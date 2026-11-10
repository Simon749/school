import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!slot) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await prisma.timetableSlot.delete({ where: { id: slot.id } });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2003') {
      // Attendance or other records still point at this lesson; deleting it would destroy history.
      return NextResponse.json(
        { error: 'This lesson already has attendance records and cannot be deleted.' },
        { status: 409 }
      );
    }
    console.error('Timetable slot delete error:', error);
    return NextResponse.json({ error: 'Failed to delete the lesson' }, { status: 500 });
  }

  await logAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    action: 'timetable.slot_deleted',
    tableName: 'timetable_slots',
    recordId: slot.id,
    oldData: {
      teacherId: slot.teacherId,
      streamId: slot.streamId,
      periodId: slot.periodId,
      dayOfWeek: slot.dayOfWeek,
    },
  });

  return NextResponse.json({ success: true });
}
