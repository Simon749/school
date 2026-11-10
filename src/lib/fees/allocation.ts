
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export interface AllocationInput {
  studentId: string;
  termId: string;
  amount: number;
  existingPaymentId?: string;
  tx?: Prisma.TransactionClient;
}

export interface AllocationResult {
  allocations: { feeItemId: string; amountAllocated: number }[];
  overpayment: number;
  fullyCoveredItemIds: string[];
}

/**
 * Allocate a payment against a student's fee balance using priority order.
 * Pass a transaction client when allocation must be atomic with payment creation.
 */
export async function allocatePayment(
  input: AllocationInput,
): Promise<AllocationResult> {
  const { studentId, termId, amount } = input;
  const db = input.tx ?? prisma;

  const studentFees = await db.studentFee.findMany({
    where: { studentId, termId },
    include: { feeItem: true },
    orderBy: { feeItem: { priorityOrder: 'asc' } },
  });

  const existingPayments = await db.feePayment.findMany({
    where: { studentId, termId, isReversed: false },
    select: { id: true, allocations: true, amount: true },
  });

  const paidPerItem: Record<string, number> = {};

  for (const payment of existingPayments) {
    if (
      input.existingPaymentId &&
      payment.id === input.existingPaymentId
    ) {
      continue;
    }

    const allocations = (payment.allocations as any[]) || [];

    for (const allocation of allocations) {
      paidPerItem[allocation.feeItemId] =
        (paidPerItem[allocation.feeItemId] || 0) +
        Number(allocation.amountAllocated || 0);
    }
  }

  let remaining = amount;

  const allocations: { feeItemId: string; amountAllocated: number }[] = [];
  const fullyCoveredItemIds: string[] = [];

  for (const studentFee of studentFees) {
    if (remaining <= 0) break;

    const due =
      Number(studentFee.amountDue) -
      Number(studentFee.discount) +
      Number(studentFee.carryForwardAmount);

    const alreadyPaid = paidPerItem[studentFee.feeItemId] || 0;
    const balance = Math.max(0, due - alreadyPaid);

    if (balance <= 0) {
      fullyCoveredItemIds.push(studentFee.feeItemId);
      continue;
    }

    const allocateToThis = Math.min(balance, remaining);

    allocations.push({
      feeItemId: studentFee.feeItemId,
      amountAllocated: allocateToThis,
    });

    remaining -= allocateToThis;

    if (allocateToThis >= balance) {
      fullyCoveredItemIds.push(studentFee.feeItemId);
    }
  }

  return {
    allocations,
    overpayment: Math.max(0, remaining),
    fullyCoveredItemIds,
  };
}
