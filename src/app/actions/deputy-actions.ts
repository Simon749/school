'use server';

import { revalidatePath } from 'next/cache';
import { requirePageUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

/**
 * Assign a substitute teacher to a lesson whose teacher has not shown up (deputy/admin only).
 *
 * Replaces an inline server action that had no authentication and trusted the slot's own
 * `schoolId` (SEC-09). Next.js encrypts values a server action closes over, which prevents
 * tampering with arguments but NOT unauthorised invocation, so this action authenticates the
 * caller itself and re-checks that every record belongs to the caller's school.
 */
export async function assignSubstituteAction(
  slotId: string,
  substituteTeacherId: string
): Promise<void> {
  const actor = await requirePageUser(['deputy', 'admin']);

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: actor.schoolId },
    select: { id: true, teacherId: true },
  });
  if (!slot) throw new Error('Lesson not found.');

  const substitute = await prisma.teacher.findFirst({
    where: { id: substituteTeacherId, schoolId: actor.schoolId },
    select: { id: true },
  });
  if (!substitute) throw new Error('Substitute teacher not found.');
  if (substitute.id === slot.teacherId) {
    throw new Error('A teacher cannot be their own substitute.');
  }

  // Same "today" convention as the deputy pages (school-local midnight); see R4-01 for the
  // planned Africa/Nairobi time utilities.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const key = { teacherId: slot.teacherId, slotId: slot.id, date: today };
  const existing = await prisma.teacherAttendance.findUnique({
    where: { teacherId_slotId_date: key },
    select: { id: true, status: true },
  });
  if (existing && (existing.status === 'present' || existing.status === 'late')) {
    throw new Error('This teacher has already checked in for this lesson.');
  }

  const record = await prisma.teacherAttendance.upsert({
    where: { teacherId_slotId_date: key },
    create: {
      schoolId: actor.schoolId,
      teacherId: slot.teacherId,
      slotId: slot.id,
      date: today,
      status: 'covered',
      substituteTeacherId: substitute.id,
    },
    update: { status: 'covered', substituteTeacherId: substitute.id },
  });

  await logAudit({
    schoolId: actor.schoolId,
    actorId: actor.id,
    action: 'teacher_attendance.cover_assigned',
    tableName: 'teacher_attendance',
    recordId: record.id,
    oldData: existing ? { status: existing.status } : undefined,
    newData: { status: 'covered', substituteTeacherId: substitute.id, slotId: slot.id },
  });

  revalidatePath('/deputy/uncovered-lessons');
}
