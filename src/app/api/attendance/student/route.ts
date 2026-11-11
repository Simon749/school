import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, type CurrentUser } from '@/lib/auth/current-user';
import { attendanceQueue, notificationQueue } from '@/lib/queue';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { validateRegisterDate } from '@/lib/attendance/register-date';
import { submitRegisterSchema } from '@/lib/validations/student-register.schema';
import { getCalendarDay } from '@/lib/calendar';

async function mayUseRegister(
  user: CurrentUser,
  slot: { id: string; teacherId: string },
  date: Date
): Promise<boolean> {
  if (user.role === 'admin') return true;

  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!teacher) return false;
  if (slot.teacherId === teacher.id) return true;

  const cover = await prisma.teacherAttendance.findFirst({
    where: { slotId: slot.id, date, substituteTeacherId: teacher.id, status: 'covered' },
    select: { id: true },
  });
  return Boolean(cover);
}

// GET: fetch register for a slot
export async function GET(req: NextRequest) {
  const guard = await requireUser(['admin', 'teacher']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get('slotId');
  const defaultDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const dateParam = searchParams.get('date') || defaultDate;

  if (!slotId) {
    return NextResponse.json({ error: 'slotId required' }, { status: 400 });
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId },
    select: {
      id: true,
      teacherId: true,
      dayOfWeek: true,
      learningArea: { select: { id: true, name: true } },
      period: { select: { name: true, startTime: true, endTime: true } },
      stream: {
        select: {
          id: true,
          name: true,
          grade: { select: { name: true } },
          students: {
            where: { deletedAt: null, status: 'active' },
            orderBy: { firstName: 'asc' },
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });
  if (!slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  }

  const checked = validateRegisterDate(dateParam, slot.dayOfWeek);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const attendanceDate = checked.date;

  const calendarDay = await getCalendarDay(user.schoolId, attendanceDate);
  if (!calendarDay) {
    return NextResponse.json({ error: 'No calendar record found for this date. Please configure the school calendar.' }, { status: 400 });
  }
  if (calendarDay.dayType !== 'school_day') {
    return NextResponse.json({ error: `Cannot take register: this date is marked as '${calendarDay.dayType.replace(/_/g, ' ')}' in the school calendar.` }, { status: 400 });
  }
  if (calendarDay.timetableType !== 'normal') {
    return NextResponse.json({ error: `Cannot take normal lesson register: timetable type for this date is '${calendarDay.timetableType}'.` }, { status: 400 });
  }

  if (!(await mayUseRegister(user, slot, attendanceDate))) {
    return NextResponse.json({ error: 'You are not assigned to this lesson' }, { status: 403 });
  }

  const [attendances, lessonRegister] = await Promise.all([
    prisma.studentLessonAttendance.findMany({
      where: { slotId, date: attendanceDate, schoolId: user.schoolId },
    }),
    prisma.lessonRegister.findUnique({
      where: { slotId_date: { slotId, date: attendanceDate } },
    }),
  ]);

  const register = slot.stream.students.map((student) => {
    const att = attendances.find((attendance) => attendance.studentId === student.id);
    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      status: att?.status || null,
      absenceReason: att?.absenceReason || null,
      marked: !!att,
    };
  });

  return NextResponse.json({
    slot: {
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      learningArea: slot.learningArea,
      period: slot.period,
      stream: { id: slot.stream.id, name: slot.stream.name, grade: slot.stream.grade },
    },
    date: dateParam,
    register,
    isLocked: lessonRegister?.isLocked ?? false,
  });
}

// POST: submit register
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin', 'teacher']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = submitRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
  }
  const { slotId, date, entries, confirmed } = parsed.data;

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId },
    select: {
      id: true,
      teacherId: true,
      dayOfWeek: true,
      learningArea: { select: { name: true } },
      stream: {
        select: {
          students: {
            where: { deletedAt: null, status: 'active' },
            select: { id: true, firstName: true },
          },
        },
      },
    },
  });
  if (!slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  }

  const checked = validateRegisterDate(date, slot.dayOfWeek);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const attendanceDate = checked.date;

  const calendarDay = await getCalendarDay(user.schoolId, attendanceDate);
  if (!calendarDay) {
    return NextResponse.json({ error: 'No calendar record found for this date.' }, { status: 400 });
  }
  if (calendarDay.dayType !== 'school_day') {
    return NextResponse.json({ error: `Cannot submit register: this date is marked as '${calendarDay.dayType.replace(/_/g, ' ')}'.` }, { status: 400 });
  }
  if (calendarDay.timetableType !== 'normal') {
    return NextResponse.json({ error: `Cannot submit normal lesson register: timetable type is '${calendarDay.timetableType}'.` }, { status: 400 });
  }

  if (!(await mayUseRegister(user, slot, attendanceDate))) {
    return NextResponse.json({ error: 'You are not assigned to this lesson' }, { status: 403 });
  }

  // ATT-11: Idempotency and lock-state checks.
  const idempotencyKey = req.headers.get('Idempotency-Key');

  const existingRegister = await prisma.lessonRegister.findUnique({
    where: { slotId_date: { slotId, date: attendanceDate } },
  });

  // Check idempotency before lock state: a retry of an already successful
  // submission must receive 200, even if the register was locked afterward.
  const existingRegisterWithIdempotency = existingRegister as {
    idempotencyKey?: string | null;
  } | null;

  if (
    idempotencyKey &&
    existingRegisterWithIdempotency?.idempotencyKey === idempotencyKey
  ) {
    return NextResponse.json(
      { success: true, idempotent: true },
      { status: 200 }
    );
  }

  // A locked register cannot be changed by another submission.
  if (existingRegister?.isLocked) {
    return NextResponse.json(
      { error: 'This register is already locked. Please contact an admin.' },
      { status: 423 }
    );
  }

  const validStudentIds = new Set(slot.stream.students.map((student) => student.id));
  if (entries.some((entry) => !validStudentIds.has(entry.studentId))) {
    return NextResponse.json({ error: 'Invalid student in register' }, { status: 400 });
  }

  const absentCount = entries.filter((entry) => entry.status === 'absent').length;
  if (absentCount / entries.length > 0.8 && !confirmed) {
    return NextResponse.json({
      requiresConfirmation: true,
      message: `You are marking ${absentCount} of ${entries.length} students absent. Is this correct?`,
    }); // <-- Returns 200 OK by default
  }

  // 1. Fetch existing attendance to cancel pending false alarms (R4-09)
  const existingAttendances = await prisma.studentLessonAttendance.findMany({
    where: { slotId, date: attendanceDate, schoolId: user.schoolId },
    select: { studentId: true, notificationJobId: true, status: true },
  });
  const existingAttendanceMap = new Map(existingAttendances.map((att) => [att.studentId, att]));
  const lessonName = slot.learningArea?.name || 'class';

  // 2. Process queue operations OUTSIDE the transaction to avoid holding DB locks
  const processedEntries = await Promise.all(entries.map(async (entry) => {
    const student = slot.stream.students.find((item) => item.id === entry.studentId);
    if (!student) return null;

    const existing = existingAttendanceMap.get(entry.studentId);
    if (existing && existing.status === 'absent' && existing.notificationJobId && entry.status !== 'absent') {
      await notificationQueue.remove(existing.notificationJobId).catch(() => { });
    }

    let notificationJobId: string | null = null;
    let notificationHeld = false;

    if (entry.status === 'absent') {
      const parent = await prisma.user.findFirst({
        where: {
          isActive: true,
          deletedAt: null,
          guardians: { some: { studentId: entry.studentId, isPrimary: true, isActive: true } },
        },
        select: { id: true },
      });

      if (parent) {
        const job = await notificationQueue.add(
          'absence-alert',
          {
            userId: parent.id,
            type: 'attendance',
            title: 'Absence Alert',
            body: `${student.firstName} was absent from ${lessonName}.${entry.absenceReason ? ` Reason: ${entry.absenceReason}` : ''}`,
            data: { studentId: entry.studentId, date: attendanceDate.toISOString(), url: `/parent/${entry.studentId}/attendance` },
          },
          { delay: 15 * 60 * 1000 }
        );
        notificationJobId = job.id ?? null;
        notificationHeld = true;
      }
    }

    return {
      studentId: entry.studentId,
      status: entry.status,
      absenceReason: entry.absenceReason || null,
      notificationJobId,
      notificationHeld,
    };
  }));

  const { ipAddress, userAgent } = getRequestMetadata(req);

  // 3. Atomic DB update + Audit (R5-01)
  await prisma.$transaction(async (tx) => {
    const upsertPromises = processedEntries.map((data) => {
      if (!data) return Promise.resolve();
      return tx.studentLessonAttendance.upsert({
        where: { studentId_slotId_date: { studentId: data.studentId, slotId, date: attendanceDate } },
        update: {
          status: data.status,
          absenceReason: data.absenceReason,
          markedBy: user.id,
          notificationHeld: data.notificationHeld,
          notificationJobId: data.notificationJobId,
          notificationSentAt: null,
        },
        create: {
          schoolId: user.schoolId,
          studentId: data.studentId,
          slotId,
          date: attendanceDate,
          status: data.status,
          absenceReason: data.absenceReason,
          markedBy: user.id,
          notificationHeld: data.notificationHeld,
          notificationJobId: data.notificationJobId,
        },
      });
    });

    await Promise.all(upsertPromises);

    await tx.lessonRegister.upsert({
      where: { slotId_date: { slotId, date: attendanceDate } },
      update: {}, // Keep existing lock state and do not overwrite immutable idempotencyKey
      create: {
        schoolId: user.schoolId,
        slotId,
        date: attendanceDate,
        isLocked: false,
        idempotencyKey: idempotencyKey ?? undefined,
      },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'ATTENDANCE_REGISTER_SUBMITTED',
      tableName: 'lesson_registers',
      recordId: slotId,
      newData: {
        slotId,
        date: attendanceDate.toISOString(),
        totalStudents: entries.length,
        presentCount: entries.filter((e) => e.status === 'present').length,
        absentCount,
      },
      ipAddress,
      userAgent,
    }, tx);
  });

  return NextResponse.json({ success: true }, { status: 200 });
}