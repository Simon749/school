import { prisma } from '@/lib/db';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * FINDING PAY-09: receipt prefix = first 3 letters of the school NAME, but receipt_number is
 * globally unique. Two schools whose names start the same get identical receipt numbers.
 * Desired behaviour (R3-09): receipt numbers can never collide across schools.
 */
const counters = new Map<string, number>();

vi.mock('@/lib/db', () => ({
  prisma: {
    school: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        name: where.id === 'school-a' ? 'St. Mary Academy' : 'St. Peter Academy',
      })),
    },
    feePayment: { aggregate: vi.fn(async () => ({ _max: { receiptNumber: null } })) },
  },
}));

vi.mock('@/lib/redis', () => ({
  redis: {
    incr: vi.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    set: vi.fn(),
  },
}));

describe('PAY-09 receipt numbers', () => {
  afterEach(() => counters.clear());

  it.fails(
    'two different schools must never receive the same receipt number (BUG PAY-09)',
    async () => {
      const { generateReceiptNumber } = await import('@/lib/fees/receipt');
      const a = await generateReceiptNumber('school-a', prisma as any);
      const b = await generateReceiptNumber('school-b', prisma as any);
      expect(a).not.toBe(b);
    }
  );
});
