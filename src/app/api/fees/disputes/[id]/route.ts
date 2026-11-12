import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';

const updateSchema = z.object({
  status: z.enum(['investigating', 'resolved', 'rejected']),
  resolutionNote: z.string().trim().max(1000).optional().nullable(),
  paymentId: z.string().min(1).max(64).optional().nullable(),
});

// ✅ PAY-12: Strict status machine — no backwards transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ['investigating', 'resolved', 'rejected'],
  investigating: ['resolved', 'rejected'],
  resolved: [], // Terminal
  rejected: [], // Terminal
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid update', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { status, resolutionNote, paymentId } = parsed.data;

  // 1. School-scoped fetch + current state
  const dispute = await prisma.paymentDispute.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: { id: true, studentId: true, status: true },
  });
  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  // 2. ✅ PAY-12: Status machine validation
  const allowedTransitions = VALID_TRANSITIONS[dispute.status] ?? [];
  if (!allowedTransitions.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status transition from '${dispute.status}' to '${status}'` },
      { status: 400 }
    );
  }

  // 3. Linked payment must be in same school AND for same student
  if (paymentId) {
    const payment = await prisma.feePayment.findFirst({
      where: { id: paymentId, schoolId: user.schoolId, studentId: dispute.studentId },
      select: { id: true },
    });
    if (!payment) {
      return NextResponse.json(
        { error: "That payment is not one of this student's payments in this school" },
        { status: 400 }
      );
    }
  }

  const closing = status === 'resolved' || status === 'rejected';
  const auditMeta = getRequestMetadata(req);

  // 4. ✅ PAY-12: Atomic update + transactional audit
  try {
    const updatedDispute = await prisma.$transaction(async (tx) => {
      const result = await tx.paymentDispute.update({
        where: { id: dispute.id },
        data: {
          status,
          resolutionNote: resolutionNote ?? null,
          paymentId: paymentId || null,
          resolvedBy: closing ? user.id : null,
          resolvedAt: closing ? new Date() : null,
        },
        include: {
          student: { select: { firstName: true, lastName: true } },
        },
      });

      await logAudit({
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'PAYMENT_DISPUTE_UPDATED',
        tableName: 'payment_disputes',
        recordId: dispute.id,
        oldData: { status: dispute.status },
        newData: { status, paymentId: paymentId || null, resolutionNote },
        ipAddress: auditMeta.ipAddress,
        userAgent: auditMeta.userAgent,
      }, tx); // ✅ Pass tx client

      return result;
    });

    return NextResponse.json({ dispute: updatedDispute });
  } catch (error) {
    console.error('Dispute resolution error:', error);
    return NextResponse.json({ error: 'Failed to update dispute' }, { status: 500 });
  }
}