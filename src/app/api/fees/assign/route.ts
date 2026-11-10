import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';

const assignSchema = z.object({
  structureId: z.string().min(1).max(64),
  streamId: z.string().min(1).max(64).optional(),
  studentIds: z.array(z.string().min(1).max(64)).max(2000).optional(),
});

/**
 * Assign a fee structure's items to students (admin/bursar).
 * Every student must be an ACTIVE student of the caller's own school; if any is not, nothing is
 * assigned (SEC-11). Re-assigning still overwrites `amountDue` as before — the proper rules for
 * discounts/bursaries on re-assignment are part of R3-12 (PAY-13).
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { structureId, streamId, studentIds } = parsed.data;
  if (!streamId && !studentIds) {
    return NextResponse.json({ error: 'Choose a class or a list of students' }, { status: 400 });
  }

  const structure = await prisma.feeStructure.findFirst({
    where: { id: structureId, schoolId: user.schoolId },
    include: { feeItems: true },
  });
  if (!structure) return NextResponse.json({ error: 'Structure not found' }, { status: 404 });

  let targets: string[];
  if (studentIds) {
    const requested = [...new Set(studentIds)];
    const found = await prisma.student.findMany({
      where: { id: { in: requested }, schoolId: user.schoolId, deletedAt: null, status: 'active' },
      select: { id: true },
    });
    const foundIds = new Set(found.map((s) => s.id));
    if (requested.some((id) => !foundIds.has(id))) {
      return NextResponse.json(
        { error: 'Some students were not found in this school. Nothing was assigned.' },
        { status: 400 }
      );
    }
    targets = requested;
  } else {
    const students = await prisma.student.findMany({
      where: { streamId, schoolId: user.schoolId, deletedAt: null, status: 'active' },
      select: { id: true },
    });
    targets = students.map((s) => s.id);
  }

  if (targets.length === 0) {
    return NextResponse.json(
      { error: 'There are no active students to assign to' },
      { status: 400 }
    );
  }

  const created = await prisma.$transaction(
    targets.flatMap((studentId) =>
      structure.feeItems.map((item) =>
        prisma.studentFee.upsert({
          where: {
            studentId_termId_feeItemId: {
              studentId,
              termId: structure.termId,
              feeItemId: item.id,
            },
          },
          update: { amountDue: item.amount },
          create: {
            schoolId: user.schoolId,
            studentId,
            termId: structure.termId,
            feeItemId: item.id,
            amountDue: item.amount,
          },
        })
      )
    )
  );

  await logAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    action: 'fees.assigned',
    tableName: 'student_fees',
    newData: {
      structureId,
      termId: structure.termId,
      studentCount: targets.length,
      streamId: streamId ?? null,
      recordCount: created.length,
    },
  });

  return NextResponse.json({ success: true, assigned: created.length });
}
