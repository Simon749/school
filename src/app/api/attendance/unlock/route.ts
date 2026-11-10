import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { validateRegisterDate } from '@/lib/attendance/register-date';
import { getCalendarDay } from '@/lib/calendar';

/** Admin unlocks a submitted lesson register so a teacher can correct it. Always audited. */
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: { slotId?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const { slotId, date } = body;
  if (typeof slotId !== 'string' || typeof date !== 'string' || !slotId || !date) {
    return NextResponse.json({ error: 'slotId and date required' }, { status: 400 });
  }

  // 1. School check on slotId (SEC-11)
  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId },
    select: { id: true, dayOfWeek: true },
  });
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

  const checked = validateRegisterDate(date, slot.dayOfWeek);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // 2. Calendar Awareness Check (R4-08)
  const calendarDay = await getCalendarDay(user.schoolId, checked.date);
  if (!calendarDay) {
    return NextResponse.json({ error: 'No calendar record found for this date.' }, { status: 400 });
  }
  if (calendarDay.dayType !== 'school_day') {
    return NextResponse.json({ error: `Cannot unlock register: this date is marked as '${calendarDay.dayType.replace(/_/g, ' ')}'.` }, { status: 400 });
  }

  const unlockedAt = new Date();
  const { ipAddress, userAgent } = getRequestMetadata(req);

  // 3. Atomic DB update + Audit (R5-01)
  await prisma.$transaction(async (tx) => {
    const register = await tx.lessonRegister.upsert({
      where: { slotId_date: { slotId: slot.id, date: checked.date } },
      update: { isLocked: false, unlockedAt, unlockedBy: user.id },
      create: {
        schoolId: user.schoolId,
        slotId: slot.id,
        date: checked.date,
        isLocked: false,
        unlockedAt,
        unlockedBy: user.id,
      },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'ATTENDANCE_REGISTER_UNLOCKED',
      tableName: 'lesson_registers',
      recordId: register.id,
      newData: { slotId: slot.id, date: checked.date.toISOString() },
      ipAddress,
      userAgent,
    }, tx);
  });

  return NextResponse.json({ success: true }, { status: 200 });
}