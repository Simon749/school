import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { getCalendarDay } from '@/lib/calendar';
import { getNairobiDateString, getNairobiNow } from '@/lib/time';

export async function POST(req: NextRequest) {
  // 1. Role gating: Only admin or deputy can mark gate arrivals (ATT-07)
  const guard = await requireUser(['admin', 'deputy']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // ✅ ATT-07: IGNORE client-supplied arrivedAt to prevent backdating attacks
  const { studentId } = body; 

  if (!studentId || typeof studentId !== 'string') {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  }

  // 2. IDOR prevention: Verify student belongs to caller's school
  const student = await prisma.student.findUnique({
    where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, admissionNumber: true },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found or not in your school' }, { status: 404 });
  }

  // 3. Server time & Calendar validation (ATT-07, ATT-10)
  const now = getNairobiNow();
  const todayStr = getNairobiDateString(now);
  
  const calendarDay = await getCalendarDay(user.schoolId, new Date(`${todayStr}T00:00:00.000Z`));
  if (!calendarDay || calendarDay.dayType !== 'school_day') {
    return NextResponse.json({ error: `Gate arrival cannot be recorded on a ${calendarDay?.dayType || 'non-school'} day.` }, { status: 400 });
  }

  const auditMeta = getRequestMetadata(req);

  // 4. Transactional upsert + Immutable Audit (R5-01, AUD-02)
  const record = await prisma.$transaction(async (tx) => {
    const attendance = await tx.studentDailyAttendance.upsert({
      where: { studentId_date: { studentId, date: new Date(`${todayStr}T00:00:00.000Z`) } },
      update: { arrivedAt: now, status: 'present' },
      create: {
        schoolId: user.schoolId,
        studentId,
        date: new Date(`${todayStr}T00:00:00.000Z`),
        arrivedAt: now,
        status: 'present',
      },
    });

    // ✅ ATT-07: Pass tx to logAudit to ensure it runs in the same transaction
    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'STUDENT_GATE_ARRIVAL',
      tableName: 'StudentDailyAttendance',
      recordId: attendance.id,
      newData: { studentId, arrivedAt: now.toISOString(), status: 'present' },
      ipAddress: auditMeta.ipAddress,
      userAgent: auditMeta.userAgent,
    }, tx);

    return attendance;
  });

  return NextResponse.json({ 
    success: true, 
    message: `${student.firstName} ${student.lastName} marked present at ${now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi' })}`,
    record: { id: record.id, studentId: record.studentId, arrivedAt: record.arrivedAt, status: record.status }
  }, { status: 201 });
}