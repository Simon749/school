import { Prisma } from '@prisma/client';
import { add, subtract, equals, isZero } from '@/lib/money/decimal';

interface BalanceInput {
  studentId: string;
  termId: string;
  tx?: Prisma.TransactionClient;
}

interface BalanceResult {
  totalDue: number;
  totalPaid: number;
  balance: number;
  items: Array<{
    feeItemId: string;
    feeName: string;
    amountDue: number;
    discount: number;
    carryForward: number;
    paid: number;
    balance: number;
  }>;
}

/**
 * Calculate the exact balance for a student/term using safe decimal math.
 * This is the single source of truth for all balance displays.
 */
export async function calculateBalance({
  studentId,
  termId,
  tx,
}: BalanceInput): Promise<BalanceResult> {
  const client = tx || (await import('@/lib/db')).prisma;

  // Fetch all fee items for this student/term
  const feeItems = await client.studentFee.findMany({
    where: { studentId, termId },
    include: { feeItem: true },
  });

  // Fetch all payments for this student/term
  const payments = await client.feePayment.findMany({
    where: {
      studentId,
      termId,
      isReversed: false,
    },
  });

  let totalDue = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  const items: BalanceResult['items'] = [];

  for (const studentFee of feeItems) {
    const amountDue = studentFee.amountDue;
    const discount = studentFee.discount;
    const carryForward = studentFee.carryForwardAmount;

    // Calculate total owed for this item
    const itemTotalDue = add(subtract(amountDue, discount), carryForward);
    totalDue = add(totalDue, itemTotalDue);

    // Calculate what's been paid to this item
    let itemPaid = new Prisma.Decimal(0);
    for (const payment of payments) {
      const allocations = payment.allocations as Array<{ feeItemId: string; amount: number }>;
      const allocationForThisItem = allocations.find(
        (a) => a.feeItemId === studentFee.feeItemId
      );
      if (allocationForThisItem) {
        itemPaid = add(itemPaid, allocationForThisItem.amount);
      }
    }

    totalPaid = add(totalPaid, itemPaid);

    const itemBalance = subtract(itemTotalDue, itemPaid);

    items.push({
      feeItemId: studentFee.feeItemId,
      feeName: studentFee.feeItem.name,
      amountDue: amountDue.toNumber(),
      discount: discount.toNumber(),
      carryForward: carryForward.toNumber(),
      paid: itemPaid.toNumber(),
      balance: itemBalance.toNumber(),
    });
  }

  const balance = subtract(totalDue, totalPaid);

  return {
    totalDue: totalDue.toNumber(),
    totalPaid: totalPaid.toNumber(),
    balance: balance.toNumber(),
    items,
  };
}