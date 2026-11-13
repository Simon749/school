import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';

// ── GET: Admin/Bursar list all payment disputes ───────────────────────────
export async function GET() {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const disputes = await prisma.paymentDispute.findMany({
    where: { schoolId: user.schoolId },
    include: {
      student: { select: { firstName: true, lastName: true } },
      raiser: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ disputes });
}

// ── POST: Parent raises a dispute (PAY-12 hardened) ────────────────────────
const disputeSchema = z.object({
  studentId: z.string().min(1).max(64),
  mpesaCodeClaimed: z
    .string()
    .min(5)
    .max(20)
    .regex(/^[A-Z0-9]+$/, 'M-Pesa code must contain only uppercase letters and numbers'),
  amountClaimed: z.number().positive('Amount must be positive'),
  screenshotUrl: z.string().url('Invalid screenshot URL').optional().nullable(),
});

export async function POST(req: NextRequest) {
  // 1. Role gating: Only parents can raise disputes
  const guard = await requireUser(['parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // ✅ Zod validation positioned right after parsing the JSON body
  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid dispute data', details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { studentId, mpesaCodeClaimed, amountClaimed, screenshotUrl } = parsed.data;

  // 2. Guardian Check: Verify caller is an active guardian of this student in their school
  const guardianship = await prisma.guardian.findFirst({
    where: {
      userId: user.id,
      studentId,
      isActive: true,
      student: {
        schoolId: user.schoolId,
        deletedAt: null,
      },
    },
    select: { id: true },
  });

  if (!guardianship) {
    return NextResponse.json({ error: 'You are not an active guardian of this student' }, { status: 403 });
  }

  // 3. ✅ PAY-12: Idempotency check — prevent duplicate active disputes for the same MPesa code
  const existingDispute = await prisma.paymentDispute.findFirst({
    where: {
      schoolId: user.schoolId,
      mpesaCodeClaimed,
      status: { notIn: ['rejected'] },
    },
  });

  if (existingDispute) {
    return NextResponse.json(
      { error: 'A dispute for this MPesa code already exists', disputeId: existingDispute.id },
      { status: 409 }
    );
  }

  const auditMeta = getRequestMetadata(req);

  // 4. Create dispute transactionally with explicit open status and audit logging
  const dispute = await prisma.$transaction(async (tx) => {
    const newDispute = await tx.paymentDispute.create({
      data: {
        schoolId: user.schoolId,
        studentId,
        raisedBy: user.id,
        mpesaCodeClaimed,
        amountClaimed,
        screenshotUrl: screenshotUrl || null,
        status: 'open',
      },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'PAYMENT_DISPUTE_RAISED',
        tableName: 'payment_disputes',
        recordId: newDispute.id,
        newData: { studentId, mpesaCodeClaimed, amountClaimed, status: 'open' },
        ipAddress: auditMeta.ipAddress,
        userAgent: auditMeta.userAgent,
      },
      tx
    );

    return newDispute;
  });

  return NextResponse.json(
    {
      dispute: {
        id: dispute.id,
        status: dispute.status,
        createdAt: dispute.createdAt,
      },
    },
    { status: 201 }
  );
}