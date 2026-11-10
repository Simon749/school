import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';

/**
 * Payment disputes (PAY-12).
 *
 * A PARENT raises a dispute for their own child (design RBAC: parent = disputes:raise).
 * It is NEVER resolved automatically, and the answer never says whether the claimed M-Pesa code
 * exists — that was a code-existence oracle. The bursar verifies it; a Daraja transaction lookup
 * is part of R3-11. (No screen raises disputes yet: the parent page is part of R6-13.)
 */
const raiseSchema = z
  .object({
    studentId: z.string().min(1).max(64),
    // Letters and digits only; the column is VARCHAR(20). The exact M-Pesa format is not assumed.
    mpesaCodeClaimed: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{1,20}$/, 'M-Pesa code must be letters and digits only (max 20)')
      .optional(),
    amountClaimed: z
      .number()
      .positive()
      .max(100_000_000)
      .refine((n) => Math.round(n * 100) / 100 === n, 'At most 2 decimal places')
      .optional(),
    // https only; real uploads (private storage, signed links) come with R6-08.
    screenshotUrl: z
      .string()
      .url()
      .max(500)
      .refine((u) => u.startsWith('https://'), 'Screenshot link must be https')
      .optional(),
  })
  .refine((v) => v.mpesaCodeClaimed || v.amountClaimed, {
    message: 'Give the M-Pesa code or the amount you paid',
  });

export async function POST(req: NextRequest) {
  const guard = await requireUser(['parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = raiseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid dispute', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { studentId, mpesaCodeClaimed, amountClaimed, screenshotUrl } = parsed.data;

  // Only the parent's own, active child in their school.
  const link = await prisma.guardian.findFirst({
    where: {
      userId: user.id,
      studentId,
      isActive: true,
      student: { schoolId: user.schoolId, deletedAt: null },
    },
    select: { id: true },
  });
  if (!link) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const dispute = await prisma.paymentDispute.create({
    data: {
      schoolId: user.schoolId,
      studentId,
      raisedBy: user.id,
      mpesaCodeClaimed,
      amountClaimed,
      screenshotUrl,
    },
  });

  // Deliberately minimal: no `resolved` flag and nothing about whether the code was found.
  return NextResponse.json(
    { dispute: { id: dispute.id, status: dispute.status, createdAt: dispute.createdAt } },
    { status: 201 }
  );
}

export async function GET() {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const disputes = await prisma.paymentDispute.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { createdAt: 'desc' },
  });

  const studentIds = Array.from(new Set(disputes.map((d) => d.studentId).filter(Boolean)));
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds }, schoolId: user.schoolId },
    select: { id: true, firstName: true, lastName: true },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));

  // Fetch raiser names separately (since raisedBy is not a relation)
  const raiserIds = Array.from(new Set(disputes.map((d) => d.raisedBy).filter(Boolean)));
  const raisers = await prisma.user.findMany({
    where: { id: { in: raiserIds }, schoolId: user.schoolId },
    select: { id: true, firstName: true, lastName: true },
  });
  const raiserMap = new Map(raisers.map((r) => [r.id, r]));

  const enriched = disputes.map((d) => {
    const raiser = raiserMap.get(d.raisedBy);
    const student = studentMap.get(d.studentId);
    return {
      ...d,
      raisedByName: raiser ? `${raiser.firstName} ${raiser.lastName}` : 'Unknown',
      studentName: student ? `${student.firstName} ${student.lastName}` : 'Unknown',
    };
  });

  return NextResponse.json({ disputes: enriched });
}
