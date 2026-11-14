import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { add, subtract, isZero, toNumber } from '@/lib/money/decimal';

export interface FeeBalanceItem {
  feeItemId: string;
  feeName: string;
  amountDue: number;
  discount: number;
  carryForward: number;
  paid: number;
  balance: number;
}

export interface FeeBalanceResult {
  studentId: string;
  termId: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  isOverpaid: boolean;
  overpaymentAmount: number;
  items: FeeBalanceItem[];
}

/**
 * SINGLE SOURCE OF TRUTH for all fee balance calculations.
 *
 * Used by:
 * - Parent fee view (balance/[studentId])
 * - Bursar defaulters list
 * - SMS fee reminders
 * - CSV/PDF exports
 * - Allocation logic
 *
 * PAY-07 / PAY-15: Eliminates divergent balance math across the app.
 * SEC-11: Enforces schoolId scoping at the data layer for defensive depth.
 * R3-06: All arithmetic uses Prisma.Decimal to prevent floating-point errors.
 */
export async function calculateBalance(
  studentId: string,
  termId: string,
  schoolId: string,
  tx?: Prisma.TransactionClient
): Promise<FeeBalanceResult> {
  const client = tx || prisma;

  // 1. Fetch all fee items assigned to this student for this term (scoped to school)
  const studentFees = await client.studentFee.findMany({
    where: { studentId, termId, schoolId },
    include: { feeItem: true },
    orderBy: { feeItem: { priorityOrder: 'asc' } },
  });

  // 2. Fetch all confirmed, non-reversed payments for this student/term (scoped to school)
  const payments = await client.feePayment.findMany({
    where: {
      studentId,
      termId,
      schoolId,
      isReversed: false,
    },
    select: {
      id: true,
      amount: true,
      allocations: true,
    },
  });

  let totalDue = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  const items: FeeBalanceItem[] = [];

  for (const sf of studentFees) {
    const amountDue = new Prisma.Decimal(sf.amountDue);
    const discount = new Prisma.Decimal(sf.discount);
    const carryForward = new Prisma.Decimal(sf.carryForwardAmount);

    // Total owed for this specific fee item
    const itemDue = add(subtract(amountDue, discount), carryForward);
    totalDue = add(totalDue, itemDue);

    // Calculate what has been paid towards this specific fee item
    let itemPaid = new Prisma.Decimal(0);
    const allocations = (
      payments as Array<{ id: string; amount: Prisma.Decimal; allocations: unknown }>
    ).flatMap(
      (p) => (p.allocations as Array<{ feeItemId: string; amountAllocated: number }>) || []
    );

    for (const allocation of allocations) {
      if (allocation.feeItemId === sf.feeItemId) {
        itemPaid = add(itemPaid, new Prisma.Decimal(allocation.amountAllocated));
      }
    }

    totalPaid = add(totalPaid, itemPaid);
    const itemBalance = subtract(itemDue, itemPaid);

    items.push({
      feeItemId: sf.feeItemId,
      feeName: sf.feeItem.name,
      amountDue: toNumber(amountDue),
      discount: toNumber(discount),
      carryForward: toNumber(carryForward),
      paid: toNumber(itemPaid),
      balance: toNumber(itemBalance),
    });
  }

  const balance = subtract(totalDue, totalPaid);
  const isOverpaid = balance.isNegative();
  const overpaymentAmount = isOverpaid ? toNumber(balance.abs()) : 0;

  return {
    studentId,
    termId,
    totalDue: toNumber(totalDue),
    totalPaid: toNumber(totalPaid),
    balance: toNumber(balance),
    isOverpaid,
    overpaymentAmount,
    items,
  };
}
