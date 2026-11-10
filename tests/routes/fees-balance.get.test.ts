import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const studentFindFirst = vi.fn();
const guardianFindFirst = vi.fn();
const feesFindMany = vi.fn();
const paymentsFindMany = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    student: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    guardian: { findFirst: (...a: unknown[]) => guardianFindFirst(...a) },
    studentFee: { findMany: (...a: unknown[]) => feesFindMany(...a) },
    feePayment: { findMany: (...a: unknown[]) => paymentsFindMany(...a) },
  },
}));

import { GET } from '@/app/api/fees/balance/[studentId]/route';

const call = () =>
  GET(new Request('http://x/api/fees/balance/stu-1'), { params: { studentId: 'stu-1' } });

const signedInAs = (role: string, over: Record<string, unknown> = {}) => {
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  userFindUnique.mockResolvedValue({
    id: 'u-1',
    clerkId: 'clerk_1',
    role,
    schoolId: 'school-A',
    isActive: true,
    deletedAt: null,
    ...over,
  });
};

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    studentFindFirst,
    guardianFindFirst,
    feesFindMany,
    paymentsFindMany,
  ])
    m.mockReset();
  studentFindFirst.mockResolvedValue({ id: 'stu-1' });
  guardianFindFirst.mockResolvedValue({ id: 'g-1' });
  feesFindMany.mockResolvedValue([]);
  paymentsFindMany.mockResolvedValue([]);
});

const noFinancialRead = () => {
  expect(feesFindMany).not.toHaveBeenCalled();
  expect(paymentsFindMany).not.toHaveBeenCalled();
};

describe('GET /api/fees/balance/[studentId] (SEC-05)', () => {
  it('401 when anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await call()).status).toBe(401);
    noFinancialRead();
  });

  it('403 for a deactivated user (SEC-21)', async () => {
    signedInAs('bursar', { isActive: false });
    expect((await call()).status).toBe(403);
    noFinancialRead();
  });

  it.each(['teacher', 'deputy', 'it_admin'])(
    "403 for role %s (a teacher could read ANY school's balances before)",
    async (role) => {
      signedInAs(role);
      expect((await call()).status).toBe(403);
      noFinancialRead();
    }
  );

  it.each(['admin', 'bursar'])(
    '%s: the student must be in their own school, else 404',
    async (role) => {
      signedInAs(role);
      studentFindFirst.mockResolvedValue(null);
      expect((await call()).status).toBe(404);
      expect(studentFindFirst.mock.calls[0][0].where).toEqual({
        id: 'stu-1',
        schoolId: 'school-A',
        deletedAt: null,
      });
      noFinancialRead();
    }
  );

  it.each(['admin', 'bursar'])(
    '%s: every financial query is scoped to the school',
    async (role) => {
      signedInAs(role);
      expect((await call()).status).toBe(200);
      expect(feesFindMany.mock.calls[0][0].where).toMatchObject({
        studentId: 'stu-1',
        schoolId: 'school-A',
      });
      expect(paymentsFindMany.mock.calls[0][0].where).toMatchObject({
        studentId: 'stu-1',
        schoolId: 'school-A',
        isReversed: false,
      });
    }
  );

  it('a parent can read only their OWN active child (and a stranger gets 404, not a hint)', async () => {
    signedInAs('parent');
    expect((await call()).status).toBe(200);
    expect(guardianFindFirst.mock.calls[0][0].where).toMatchObject({
      userId: 'u-1',
      studentId: 'stu-1',
      isActive: true,
    });

    guardianFindFirst.mockResolvedValue(null);
    feesFindMany.mockClear();
    paymentsFindMany.mockClear();
    expect((await call()).status).toBe(404);
    noFinancialRead();
  });

  it('keeps the existing response shape and arithmetic', async () => {
    signedInAs('bursar');
    feesFindMany.mockResolvedValue([
      {
        feeItemId: 'f1',
        amountDue: '10000',
        discount: '1000',
        carryForwardAmount: '500',
        feeItem: { name: 'Tuition' },
      },
    ]);
    paymentsFindMany.mockResolvedValue([
      { amount: '4000', allocations: [{ feeItemId: 'f1', amountAllocated: 4000 }] },
    ]);
    const body = await (await call()).json();
    expect(body).toEqual({
      totalDue: 9500,
      totalPaid: 4000,
      balance: 5500,
      items: [{ name: 'Tuition', due: 9000, paid: 4000 }],
    });
  });
});
