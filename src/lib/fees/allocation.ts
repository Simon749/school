import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { add, subtract, greaterThan, isZero, equals, toNumber } from '@/lib/money/decimal';

export interface AllocationInput {
  studentId: string;
  termId: string;
  amount: number | string | Prisma.Decimal;
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
 * Uses safe decimal math to prevent rounding errors.
 */
export async function allocatePayment(input: AllocationInput): Promise<AllocationResult> {
  const { studentId, termId, amount, existingPaymentId } = input;
  const db = input.tx ?? prisma;

  if (input.tx) {
    await db.$executeRaw`
      SELECT 1 FROM "StudentFee" 
      WHERE "studentId" = ${studentId} AND "termId" = ${termId} 
      FOR UPDATE
    `;
    await db.$executeRaw`
      SELECT 1 FROM "FeePayment" 
      WHERE "studentId" = ${studentId} AND "termId" = ${termId} AND "isReversed" = false 
      FOR UPDATE
    `;
  }

  const studentFees = await db.studentFee.findMany({
    where: { studentId, termId },
    include: { feeItem: true },
    orderBy: { feeItem: { priorityOrder: 'asc' } },
  });

  const existingPayments = await db.feePayment.findMany({
    where: { studentId, termId, isReversed: false },
    select: { id: true, allocations: true, amount: true },
  });

  const paidPerItem: Record<string, Prisma.Decimal> = {};

  for (const payment of existingPayments) {
    if (existingPaymentId && payment.id === existingPaymentId) {
      continue;
    }

    const allocations = (payment.allocations as any[]) || [];
    for (const allocation of allocations) {
      const feeItemId = allocation.feeItemId;
      const allocatedAmount = new Prisma.Decimal(allocation.amountAllocated || 0);

      if (paidPerItem[feeItemId]) {
        paidPerItem[feeItemId] = add(paidPerItem[feeItemId], allocatedAmount);
      } else {
        paidPerItem[feeItemId] = allocatedAmount;
      }
    }
  }

  let remaining = new Prisma.Decimal(amount);
  const allocations: { feeItemId: string; amountAllocated: number }[] = [];
  const fullyCoveredItemIds: string[] = [];

  for (const studentFee of studentFees) {
    if (isZero(remaining)) break;

    const due = add(
      subtract(new Prisma.Decimal(studentFee.amountDue), new Prisma.Decimal(studentFee.discount)),
      new Prisma.Decimal(studentFee.carryForwardAmount)
    );

    const alreadyPaid = paidPerItem[studentFee.feeItemId] || new Prisma.Decimal(0);
    const balance = subtract(due, alreadyPaid);

    if (isZero(balance) || !greaterThan(balance, 0)) {
      fullyCoveredItemIds.push(studentFee.feeItemId);
      continue;
    }

    const allocateToThis = greaterThan(remaining, balance) ? balance : remaining;

    allocations.push({
      feeItemId: studentFee.feeItemId,
      amountAllocated: toNumber(allocateToThis),
    });

    remaining = subtract(remaining, allocateToThis);

    if (equals(allocateToThis, balance) || greaterThan(allocateToThis, balance)) {
      fullyCoveredItemIds.push(studentFee.feeItemId);
    }
  }

  return {
    allocations,
    overpayment: toNumber(remaining),
    fullyCoveredItemIds,
  };
}
