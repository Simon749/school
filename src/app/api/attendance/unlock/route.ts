import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { getCalendarDay } from '@/lib/calendar';

export async function POST(req: NextRequest) {
  // 1. Role gating: Only admin or deputy can unlock a register (ATT-08)
  const guard = await requireUser(['admin', 'deputy']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { slotId, date } = body;

  if (!slotId || typeof slotId !== 'string' || !date || typeof date !== 'string') {
    return NextResponse.json({ error: 'slotId and date (YYYY-MM-DD) are required' }, { status: 400 });
  }

  // 2. IDOR prevention: Verify slot belongs to caller's school and is published
  const slot = await prisma.timetableSlot.findUnique({
    where: { id: slotId, schoolId: user.schoolId, isPublished: true },
    select: { id: true },
  });

  if (!slot) {
    return NextResponse.json({ error: 'Invalid, unpublished, or cross-tenant slot' }, { status: 404 });
  }

  // 3. Calendar validation (ATT-10)
  const calendarDay = await getCalendarDay(user.schoolId, new Date(`${date}T00:00:00.000Z`));
  if (!calendarDay || calendarDay.dayType !== 'school_day') {
    return NextResponse.json({ error: `Cannot unlock register on a ${calendarDay?.dayType || 'non-school'} day.` }, { status: 400 });
  }

  const auditMeta = getRequestMetadata(req);

  // 4. Transactional unlock + Immutable Audit (R5-01, AUD-02)
  await prisma.$transaction(async (tx) => {
    await tx.lessonRegister.upsert({
      where: {
        slotId_date: {
          slotId,
          date: new Date(`${date}T00:00:00.000Z`),
        },
      },
      update: {
        isLocked: false,
      },
      create: {
        schoolId: user.schoolId,
        slotId,
        date: new Date(`${date}T00:00:00.000Z`),
        isLocked: false,
      },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'LESSON_REGISTER_UNLOCKED',
      tableName: 'LessonRegister',
      recordId: slotId,
      newData: { slotId, date, unlockedBy: user.id },
      ipAddress: auditMeta.ipAddress,
      userAgent: auditMeta.userAgent,
    }, tx);
  });

  return NextResponse.json({ 
    success: true, 
    message: 'Register unlocked successfully. Teacher can now edit marks.' 
  }, { status: 200 });
}