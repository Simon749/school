import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';

// ── GET: Bursar/Admin defaulters list (your existing endpoint) ─────────────
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!user?.schoolId || !['admin', 'bursar'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) return NextResponse.json({ defaulters: [] });

  const students = await prisma.student.findMany({
    where: { schoolId: user.schoolId, deletedAt: null, status: 'active' },
    include: {
      stream: { include: { grade: true } },
      studentFees: { where: { termId: currentTerm.id }, include: { feeItem: true } },
      feePayments: { where: { termId: currentTerm.id, isReversed: false } },
    },
  });

  const defaulters = students
    .map((s) => {
      const totalDue = s.studentFees.reduce(
        (sum, fee) =>
          sum + (Number(fee.amountDue) - Number(fee.discount) + Number(fee.carryForwardAmount)),
        0
      );
      const totalPaid = s.feePayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = totalDue - totalPaid;
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        stream: `${s.stream.grade.name} ${s.stream.name}`,
        totalDue,
        totalPaid,
        balance,
      };
    })
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  return NextResponse.json({ term: currentTerm.name, defaulters });
}

// ── POST: Parent raises a dispute (PAY-12 hardened) ────────────────────────
const disputeSchema = z.object({
  studentId: z.string().min(1).max(64),
  mpesaCodeClaimed: z.string().min(5).max(20),
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

  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid dispute data', details: parsed.error.issues }, { status: 400 });
  }

  const { studentId, mpesaCodeClaimed, amountClaimed, screenshotUrl } = parsed.data;

  // 2. Guardian Check: Verify the caller is an ACTIVE guardian of this student in their school
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

  // 3. ✅ PAY-12: Idempotency check — prevent duplicate disputes for the same MPesa code
  const existingDispute = await prisma.paymentDispute.findFirst({
    where: {
      schoolId: user.schoolId,
      mpesaCodeClaimed,
      status: { notIn: ['rejected'] }, // Allow re-raising if previously rejected
    },
  });

  if (existingDispute) {
    return NextResponse.json(
      { error: 'A dispute for this MPesa code already exists', disputeId: existingDispute.id },
      { status: 409 }
    );
  }

  const auditMeta = getRequestMetadata(req);

  // 4. Create dispute with status 'open' (NO auto-resolve, even if code exists locally)
  const dispute = await prisma.$transaction(async (tx) => {
    const newDispute = await tx.paymentDispute.create({
      data: {
        schoolId: user.schoolId,
        studentId,
        raisedBy: user.id,
        mpesaCodeClaimed,
        amountClaimed,
        screenshotUrl: screenshotUrl || null,
        status: 'open', // ✅ PAY-12: Never auto-resolve
      },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'PAYMENT_DISPUTE_RAISED',
      tableName: 'payment_disputes',
      recordId: newDispute.id,
      newData: { studentId, mpesaCodeClaimed, amountClaimed },
      ipAddress: auditMeta.ipAddress,
      userAgent: auditMeta.userAgent,
    }, tx);

    return newDispute;
  });

  return NextResponse.json({ success: true, disputeId: dispute.id }, { status: 201 });
}