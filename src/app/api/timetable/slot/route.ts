import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';

const id = z.string().min(1).max(64);

const slotSchema = z
  .object({
    id: id.optional(), // present when editing an existing slot
    termId: id,
    streamId: id,
    periodId: id,
    learningAreaId: id,
    teacherId: id,
    dayOfWeek: z.coerce.number().int().min(1).max(5), // 1 = Monday ... 5 = Friday
    room: z.string().trim().max(50).optional().nullable(),
    isDoubleLesson: z.boolean().optional(),
    secondPeriodId: id.optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.isDoubleLesson) {
      if (!v.secondPeriodId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['secondPeriodId'],
          message: 'A double lesson needs a second period',
        });
      } else if (v.secondPeriodId === v.periodId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['secondPeriodId'],
          message: 'The second period must be different from the first',
        });
      }
    }
  });

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';

const SLOT_INCLUDE = {
  learningArea: { select: { id: true, name: true, color: true } },
  teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
  stream: { include: { grade: { select: { name: true } } } },
  period: true,
} as const;

/**
 * Create or edit a timetable slot (admin only). Every id in the request — including the id of
 * the slot being edited, the term and the second period — must belong to the caller's school
 * (SEC-11); the school always comes from the session.
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = slotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Missing or invalid fields', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const {
    id: existingId,
    termId,
    streamId,
    periodId,
    dayOfWeek,
    learningAreaId,
    teacherId,
    room,
    isDoubleLesson,
    secondPeriodId,
  } = parsed.data;
  const schoolId = user.schoolId;

  try {
    // Verify ownership of every referenced record.
    const [stream, teacher, period, learningArea, term, secondPeriod] = await Promise.all([
      prisma.stream.findFirst({ where: { id: streamId, schoolId }, include: { grade: true } }),
      prisma.teacher.findFirst({ where: { id: teacherId, schoolId }, include: { user: true } }),
      prisma.timetablePeriod.findFirst({ where: { id: periodId, schoolId } }),
      prisma.learningArea.findFirst({ where: { id: learningAreaId, schoolId } }),
      prisma.term.findFirst({ where: { id: termId, schoolId } }),
      isDoubleLesson && secondPeriodId
        ? prisma.timetablePeriod.findFirst({ where: { id: secondPeriodId, schoolId } })
        : Promise.resolve(true),
    ]);

    if (!stream || !teacher || !period || !learningArea || !term || !secondPeriod) {
      return NextResponse.json({ error: 'Invalid reference' }, { status: 400 });
    }

    // An edit must target a slot of THIS school (it used to update any slot by id).
    const existing = existingId
      ? await prisma.timetableSlot.findFirst({ where: { id: existingId, schoolId } })
      : null;
    if (existingId && !existing) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
    }

    // Conflict checks
    const conflictWhere = existingId ? { NOT: { id: existingId } } : {};

    const [teacherConflict, streamConflict] = await Promise.all([
      prisma.timetableSlot.findFirst({
        where: { schoolId, teacherId, periodId, dayOfWeek, termId, ...conflictWhere },
        include: { stream: { include: { grade: true } }, learningArea: true },
      }),
      prisma.timetableSlot.findFirst({
        where: { schoolId, streamId, periodId, dayOfWeek, termId, ...conflictWhere },
        include: { teacher: { include: { user: true } }, learningArea: true },
      }),
    ]);

    if (teacherConflict) {
      return NextResponse.json(
        {
          error: 'Teacher conflict',
          conflict: {
            type: 'teacher',
            message: `${teacher.user.firstName} ${teacher.user.lastName} is already assigned to ${teacherConflict.learningArea.name} for ${teacherConflict.stream.grade.name} ${teacherConflict.stream.name} at this time.`,
          },
        },
        { status: 409 }
      );
    }

    if (streamConflict) {
      return NextResponse.json(
        {
          error: 'Stream conflict',
          conflict: {
            type: 'stream',
            message: `${stream.grade.name} ${stream.name} already has ${streamConflict.learningArea.name} with ${streamConflict.teacher.user.firstName} ${streamConflict.teacher.user.lastName} at this time.`,
          },
        },
        { status: 409 }
      );
    }

    // Check second period if double lesson
    if (isDoubleLesson && secondPeriodId) {
      const [teacherConflict2, streamConflict2] = await Promise.all([
        prisma.timetableSlot.findFirst({
          where: {
            schoolId,
            teacherId,
            periodId: secondPeriodId,
            dayOfWeek,
            termId,
            ...conflictWhere,
          },
        }),
        prisma.timetableSlot.findFirst({
          where: {
            schoolId,
            streamId,
            periodId: secondPeriodId,
            dayOfWeek,
            termId,
            ...conflictWhere,
          },
        }),
      ]);
      if (teacherConflict2) {
        return NextResponse.json(
          {
            error: 'Teacher conflict',
            conflict: {
              type: 'teacher',
              message: 'Teacher is already booked during the second period.',
            },
          },
          { status: 409 }
        );
      }
      if (streamConflict2) {
        return NextResponse.json(
          {
            error: 'Stream conflict',
            conflict: {
              type: 'stream',
              message: 'Stream already has a lesson during the second period.',
            },
          },
          { status: 409 }
        );
      }
    }

    const data = {
      schoolId,
      termId,
      streamId,
      periodId,
      dayOfWeek,
      learningAreaId,
      teacherId,
      room: room || null,
      isDoubleLesson: isDoubleLesson || false,
      secondPeriodId: isDoubleLesson ? secondPeriodId || null : null,
    };

    const slot = existingId
      ? await prisma.timetableSlot.update({
          where: { id: existingId },
          data,
          include: SLOT_INCLUDE,
        })
      : await prisma.timetableSlot.create({ data, include: SLOT_INCLUDE });

    await logAudit({
      schoolId,
      actorId: user.id,
      action: existingId ? 'timetable.slot_updated' : 'timetable.slot_created',
      tableName: 'timetable_slots',
      recordId: slot.id,
      oldData: existing
        ? {
            teacherId: existing.teacherId,
            streamId: existing.streamId,
            periodId: existing.periodId,
            dayOfWeek: existing.dayOfWeek,
            learningAreaId: existing.learningAreaId,
          }
        : undefined,
      newData: {
        teacherId,
        streamId,
        periodId,
        dayOfWeek,
        learningAreaId,
        termId,
        isDoubleLesson: data.isDoubleLesson,
      },
    });

    return NextResponse.json({ success: true, slot }, { status: existingId ? 200 : 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Two admins took the same time slot at once; the database unique key caught it.
      return NextResponse.json(
        {
          error: 'Conflict',
          conflict: {
            type: 'slot',
            message: 'That time slot was just taken. Refresh and try again.',
          },
        },
        { status: 409 }
      );
    }
    console.error('Timetable slot save error:', error);
    return NextResponse.json({ error: 'Failed to save the lesson' }, { status: 500 });
  }
}
