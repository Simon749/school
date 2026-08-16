import { prisma } from "@/lib/db";

export interface AllocationInput {
  studentId: string;
  termId: string;
  amount: number; // total payment amount
  existingPaymentId?: string; // for idempotency / re-allocation
}

export interface AllocationResult {
  allocations: { feeItemId: string; amountAllocated: number }[];
  overpayment: number;
  fullyCoveredItemIds: string[];
}

/**
 * Allocate a payment against a student's fee balance using priority order.
 * Rules:
 * 1. Tuition (priority 1) must be paid before lunch (priority 2), etc.
 * 2. If partial payment doesn't cover an item, the whole payment goes to that item.
 * 3. Overpayment is tracked separately.
 * 4. Idempotent: if existingPaymentId provided, we recalculate from scratch.
 */
export async function allocatePayment(input: AllocationInput): Promise<AllocationResult> {
  const { studentId, termId, amount } = input;

  // Fetch all fee items for this student in priority order
  const studentFees = await prisma.studentFee.findMany({
    where: { studentId, termId },
    include: { feeItem: true },
    orderBy: { feeItem: { priorityOrder: "asc" } },
  });

  // Fetch existing payments for this student/term (excluding reversed)
  const existingPayments = await prisma.feePayment.findMany({
    where: { studentId, termId, isReversed: false },
    select: { allocations: true, amount: true },
  });

  // Calculate already-paid amount per fee item
  const paidPerItem: Record<string, number> = {};
  for (const p of existingPayments) {
    // Skip if this is the payment we're re-allocating
    if (input.existingPaymentId && p.id === input.existingPaymentId) continue;

    const allocs = (p.allocations as any[]) || [];
    for (const a of allocs) {
      paidPerItem[a.feeItemId] = (paidPerItem[a.feeItemId] || 0) + (a.amountAllocated || 0);
    }
  }

  let remaining = amount;
  const allocations: { feeItemId: string; amountAllocated: number }[] = [];
  const fullyCoveredItemIds: string[] = [];

  for (const sf of studentFees) {
    if (remaining <= 0) break;

    const due = Number(sf.amountDue) - Number(sf.discount) + Number(sf.carryForwardAmount);
    const alreadyPaid = paidPerItem[sf.feeItemId] || 0;
    const balance = Math.max(0, due - alreadyPaid);

    if (balance <= 0) {
      fullyCoveredItemIds.push(sf.feeItemId);
      continue;
    }

    const allocateToThis = Math.min(balance, remaining);
    allocations.push({
      feeItemId: sf.feeItemId,
      amountAllocated: allocateToThis,
    });
    remaining -= allocateToThis;

    if (allocateToThis >= balance) {
      fullyCoveredItemIds.push(sf.feeItemId);
    }
  }

  return {
    allocations,
    overpayment: Math.max(0, remaining),
    fullyCoveredItemIds,
  };
}