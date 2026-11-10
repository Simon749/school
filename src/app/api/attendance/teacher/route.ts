import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, requireTeacher } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { getCalendarDay } from '@/lib/calendar';
import { getNairobiDateString, getNairobiNow } from '@/lib/time';
import { attendanceQueue } from '@/lib/queue';
import { isInsideGeofence } from '@/lib/geofence/check';
import { verifyQrToken } from '@/lib/qr/token';

// ── GET: Admin/Deputy dashboard ─────────────────────────────
export async function GET(req: NextRequest) {
  // 1. Central guard: allow admin OR deputy (R4-06 / ATT-06)
  const guard = await requireUser(['admin', 'deputy']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  // 2. Safe date parsing (R4-01 / ATT-04: prevent UTC skew)
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');
  const targetDateStr = dateParam || getNairobiDateString();
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(targetDateStr)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
  }

  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);
  const dayOfWeek = targetDate.getUTCDay();

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
    select: { id: true }
  });
  if (!currentTerm) {
    return NextResponse.json({ error: 'No current term configured for this school' }, { status: 400 });
  }

  // 3. Fetch data strictly scoped to schoolId (SEC-11)
  const [periods, slots, attendances] = await Promise.all([
    prisma.timetablePeriod.findMany({
      where: { schoolId: user.schoolId },
      orderBy: { orderIndex: 'asc' },
    }),
    prisma.timetableSlot.findMany({
      where: {
        schoolId: user.schoolId,
        termId: currentTerm.id,
        dayOfWeek,
        isPublished: true,
      },
      include: {
        learningArea: { select: { name: true, color: true } },
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        stream: { include: { grade: { select: { name: true } } } },
        period: true,
      },
      orderBy: { period: { orderIndex: 'asc' } },
    }),
    prisma.teacherAttendance.findMany({
      where: { schoolId: user.schoolId, date: targetDate },
      select: {
        slotId: true,
        teacherId: true,
        status: true,
        checkedInAt: true,
        minutesLate: true,
      }
    }),
  ]);

  // 4. Compute status based on PERSISTED state, not on-the-fly time math (ATT-06)
  const now = getNairobiNow();
  const enriched = slots.map((slot) => {
    const att = attendances.find((a) => a.slotId === slot.id && a.teacherId === slot.teacherId);

    // Alert logic: period starts within 15 mins and no check-in record exists
    const periodStart = new Date(`${targetDateStr}T${slot.period.startTime}:00+03:00`);
    const timeUntilStart = periodStart.getTime() - now.getTime();
    const needsAlert = timeUntilStart > 0 && timeUntilStart <= 15 * 60 * 1000 && !att;

    return {
      id: slot.id,
      period: slot.period,
      learningArea: slot.learningArea,
      teacher: slot.teacher,
      stream: slot.stream,
      room: slot.room,
      // Rely on persisted state. If no record, it's 'pending', not 'absent'.
      status: att ? att.status : 'pending',
      needsAlert,
      attendance: att ? {
        checkedInAt: att.checkedInAt,
        status: att.status,
        minutesLate: att.minutesLate,
      } : null,
    };
  });

  return NextResponse.json({
    date: targetDateStr,
    periods,
    slots: enriched,
  });
}

// ── POST: Teacher check-in ──────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Central guard for teachers
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { slotId, latitude, longitude, qrToken, lessonNotes } = body;
  if (!slotId || latitude == null || longitude == null || !qrToken) {
    return NextResponse.json({ error: 'slotId, latitude, longitude, and qrToken are required' }, { status: 400 });
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId, isPublished: true },
    include: { period: true, school: true },
  });
  if (!slot) return NextResponse.json({ error: 'Invalid or unpublished slot' }, { status: 404 });

  if (slot.teacherId !== teacher.id) {
    const nairobiTodayStr = getNairobiDateString();
    const isSubstitute = await prisma.teacherAttendance.findFirst({
      where: {
        slotId: slot.id,
        date: new Date(`${nairobiTodayStr}T00:00:00.000Z`),
        substituteTeacherId: teacher.id,
        status: 'covered',
      },
    });
    if (!isSubstitute) {
      return NextResponse.json({ error: 'You are not assigned to this lesson' }, { status: 403 });
    }
  }

  // 2. Geofence validation
  if (slot.school.latitude == null || slot.school.longitude == null || slot.school.geofenceRadius == null) {
    return NextResponse.json({ error: 'School geofence not configured.' }, { status: 400 });
  }

  const geo = isInsideGeofence(
    Number(latitude), Number(longitude),
    Number(slot.school.latitude), Number(slot.school.longitude),
    slot.school.geofenceRadius
  );
  if (!geo.isInside) {
    return NextResponse.json({ error: 'Outside school geofence', distance: Math.round(geo.distance) }, { status: 403 });
  }

  // 3. QR token validation
  const qrCheck = verifyQrToken(qrToken);
  if (!qrCheck.valid || qrCheck.slotId !== slotId) {
    return NextResponse.json({ error: 'Invalid or expired QR token' }, { status: 410 });
  }

  const now = getNairobiNow();
  const nairobiTodayStr = getNairobiDateString(now);

  const tokenRecord = await prisma.classroomQrToken.findFirst({
    where: { token: qrToken, slotId, usedAt: null, validFrom: { lte: now }, validUntil: { gte: now } },
  });
  if (!tokenRecord) {
    return NextResponse.json({ error: 'QR token already used, expired, or not yet valid' }, { status: 410 });
  }

  // 4. Calendar validation (ATT-10)
  const calendarDay = await getCalendarDay(user.schoolId, new Date(`${nairobiTodayStr}T00:00:00.000Z`));
  if (!calendarDay || calendarDay.dayType !== 'school_day') {
    return NextResponse.json({ error: `Check-in not allowed on a ${calendarDay?.dayType || 'non-school'} day.` }, { status: 400 });
  }

  // 5. Time window validation
  const getTimeStr = (t: any) => (typeof t === 'string' ? t.substring(0, 5) : t.toISOString().substring(11, 16));
  const periodStartSafe = new Date(`${nairobiTodayStr}T${getTimeStr(slot.period.startTime)}+03:00`);
  const periodEndSafe = new Date(`${nairobiTodayStr}T${getTimeStr(slot.period.endTime)}+03:00`);

  if (now < new Date(periodStartSafe.getTime() - 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too early. Check-in opens 10 minutes before period start.' }, { status: 425 });
  }
  if (now > periodEndSafe) {
    return NextResponse.json({ error: 'Period has ended. Cannot check in.' }, { status: 410 });
  }

  const diffMs = now.getTime() - periodStartSafe.getTime();
  const minutesLate = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
  const status = minutesLate > 10 ? 'late' : 'present';

  const auditMeta = getRequestMetadata(req);

  // 6. Atomic update of QR token + Audit Log (AUD-02)
  await prisma.$transaction(async (tx) => {
    await tx.classroomQrToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: now },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'TEACHER_CHECK_IN_INITIATED',
      tableName: 'TeacherAttendance',
      recordId: slot.id,
      newData: { slotId, status, minutesLate, geofencePassed: true },
      ipAddress: auditMeta.ipAddress,
      userAgent: auditMeta.userAgent,
    }, tx);
  });

  // 7. Enqueue write (Queue-first for 8AM spike resilience)
  const job = await attendanceQueue.add('teacher-check-in', {
    type: 'teacher-check-in',
    payload: { 
      teacherId: teacher.id, 
      schoolId: user.schoolId, 
      slotId, 
      date: nairobiTodayStr, 
      checkedInAt: now.toISOString(), 
      checkInLat: Number(latitude), 
      checkInLng: Number(longitude), 
      geofencePassed: true, 
      qrScanned: true,  
      status, 
      minutesLate: minutesLate > 0 ? minutesLate : null, 
      lessonNotes: lessonNotes || null 
    },
  }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });

  return NextResponse.json({ 
    success: true, 
    message: `Checked in at ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, 
    status, 
    minutesLate: minutesLate > 0 ? minutesLate : null, 
    jobId: job.id 
  }, { status: 202 });
}