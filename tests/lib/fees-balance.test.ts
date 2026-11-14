import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateBalance } from '@/lib/fees/balance';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    studentFee: { findMany: vi.fn() },
    feePayment: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';

const mockStudentFee = vi.mocked(prisma.studentFee.findMany);
const mockFeePayment = vi.mocked(prisma.feePayment.findMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('calculateBalance (R3-07 Single Ledger)', () => {
  it('returns zero balance when no fees or payments exist', async () => {
    mockStudentFee.mockResolvedValue([]);
    mockFeePayment.mockResolvedValue([]);

    const result = await calculateBalance('stu-1', 'term-1', 'school-A');

    expect(result.totalDue).toBe(0);
    expect(result.totalPaid).toBe(0);
    expect(result.balance).toBe(0);
    expect(result.isOverpaid).toBe(false);
    expect(result.items).toEqual([]);
  });

  it('calculates balance correctly with fees and payments', async () => {
    mockStudentFee.mockResolvedValue([
      {
        feeItemId: 'fee-1',
        amountDue: new Prisma.Decimal(5000),
        discount: new Prisma.Decimal(500),
        carryForwardAmount: new Prisma.Decimal(0),
        feeItem: { name: 'Tuition' },
      },
      {
        feeItemId: 'fee-2',
        amountDue: new Prisma.Decimal(2000),
        discount: new Prisma.Decimal(0),
        carryForwardAmount: new Prisma.Decimal(1000),
        feeItem: { name: 'Activities' },
      },
    ] as any);

    mockFeePayment.mockResolvedValue([
      {
        id: 'pay-1',
        amount: new Prisma.Decimal(3000),
        allocations: [
          { feeItemId: 'fee-1', amountAllocated: 2500 },
          { feeItemId: 'fee-2', amountAllocated: 500 },
        ],
      },
    ] as any);

    const result = await calculateBalance('stu-1', 'term-1', 'school-A');

    // Fee 1: 5000 - 500 + 0 = 4500 due, 2500 paid, 2000 balance
    // Fee 2: 2000 - 0 + 1000 = 3000 due, 500 paid, 2500 balance
    // Total: 7500 due, 3000 paid, 4500 balance
    expect(result.totalDue).toBe(7500);
    expect(result.totalPaid).toBe(3000);
    expect(result.balance).toBe(4500);
    expect(result.items).toHaveLength(2);
    expect(result.items?.[0]?.balance).toBe(2000);
    expect(result.items?.[1]?.balance).toBe(2500);
  });

  it('prevents floating-point errors (R3-06)', async () => {
    mockStudentFee.mockResolvedValue([
      {
        feeItemId: 'fee-1',
        amountDue: new Prisma.Decimal(100.1),
        discount: new Prisma.Decimal(0),
        carryForwardAmount: new Prisma.Decimal(0),
        feeItem: { name: 'Test' },
      },
    ] as any);

    mockFeePayment.mockResolvedValue([
      {
        id: 'pay-1',
        amount: new Prisma.Decimal(100),
        allocations: [{ feeItemId: 'fee-1', amountAllocated: 100 }],
      },
    ] as any);

    const result = await calculateBalance('stu-1', 'term-1', 'school-A');

    // 100.1 - 100 = 0.1 (not 0.09999999999999998)
    expect(result.balance).toBe(0.1);
    expect(result.items?.[0]?.balance).toBe(0.1);
  });

  it('handles overpayment correctly', async () => {
    mockStudentFee.mockResolvedValue([
      {
        feeItemId: 'fee-1',
        amountDue: new Prisma.Decimal(1000),
        discount: new Prisma.Decimal(0),
        carryForwardAmount: new Prisma.Decimal(0),
        feeItem: { name: 'Tuition' },
      },
    ] as any);

    mockFeePayment.mockResolvedValue([
      {
        id: 'pay-1',
        amount: new Prisma.Decimal(1500),
        allocations: [{ feeItemId: 'fee-1', amountAllocated: 1500 }],
      },
    ] as any);

    const result = await calculateBalance('stu-1', 'term-1', 'school-A');

    expect(result.balance).toBe(-500);
    expect(result.isOverpaid).toBe(true);
    expect(result.overpaymentAmount).toBe(500);
  });

  it('enforces schoolId scoping (SEC-11)', async () => {
    mockStudentFee.mockResolvedValue([]);
    mockFeePayment.mockResolvedValue([]);

    await calculateBalance('stu-1', 'term-1', 'school-A');

    expect(mockStudentFee).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'stu-1', termId: 'term-1', schoolId: 'school-A' },
      })
    );
    expect(mockFeePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: 'stu-1', termId: 'term-1', schoolId: 'school-A', isReversed: false },
      })
    );
  });
});
