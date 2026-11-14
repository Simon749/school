import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const studentFindFirst = vi.fn();
const termFindFirst = vi.fn();
const paymentCreate = vi.fn();
const paymentFindMany = vi.fn();
const paymentFindFirst = vi.fn(); // ✅ ADDED for idempotency check
const allocate = vi.fn();
const receipt = vi.fn();
const notifAdd = vi.fn();
const logAudit = vi.fn();
const studentFeeFindMany = vi.fn();
const schoolFindUnique = vi.fn();
const receiptSequenceUpsert = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (e: unknown, tx?: unknown) => logAudit(e, tx), // ✅ Allow 2nd tx argument
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 't' }),
}));
vi.mock('@/lib/fees/allocation', () => ({ allocatePayment: (...a: unknown[]) => allocate(...a) }));
vi.mock('@/lib/fees/receipt', () => ({
  generateReceiptNumber: (...a: unknown[]) => receipt(...a),
}));
vi.mock('@/lib/queue', () => ({ notificationQueue: { add: (...a: unknown[]) => notifAdd(...a) } }));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    },
    student: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    feePayment: {
      create: (...a: unknown[]) => paymentCreate(...a),
      findMany: (...a: unknown[]) => paymentFindMany(...a),
      findFirst: (...a: unknown[]) => paymentFindFirst(...a), // ✅ ADDED
    },
    // ✅ ADDED: $transaction to support atomic receipt generation and audit logging
    $transaction: async (cb: any) => cb(mockPrisma),
  };
  return { prisma: mockPrisma };
});

import { GET, POST } from '@/app/api/fees/payments/route';

const post = (body: unknown) =>
  POST(
    new Request('http://x', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
  );
const get = (qs = '') => GET(new Request(`http://x/api/fees/payments${qs}`) as never);

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
const valid = (over: Record<string, unknown> = {}) => ({
  studentId: 'stu-1',
  amount: 5000,
  paymentMethod: 'cash',
  reference: 'RCPT-9',
  notes: 'Part payment',
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    userFindFirst,
    studentFindFirst,
    termFindFirst,
    paymentCreate,
    paymentFindMany,
    paymentFindFirst, // ✅ ADDED to reset array
    allocate,
    receipt,
    notifAdd,
    logAudit,
  ])
    m.mockReset();

  studentFindFirst.mockResolvedValue({ id: 'stu-1', firstName: 'Amara' });
  termFindFirst.mockResolvedValue({ id: 'term-1' });
  paymentFindFirst.mockResolvedValue(null); // ✅ Default: no duplicate reference
  allocate.mockResolvedValue({
    allocations: [{ feeItemId: 'fi-1', amountAllocated: 5000 }],
    overpayment: 0,
  });
  receipt.mockResolvedValue('KIL-001001');
  paymentCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pay-1',
    mpesaCode: null,
    ...data,
    amount: { toLocaleString: () => '5,000' },
  }));
  userFindFirst.mockResolvedValue({ id: 'parent-1' });
  paymentFindMany.mockResolvedValue([]);
});

describe.each([
  ['POST', () => post(valid())],
  ['GET', () => get()],
] as const)('fees/payments %s: who may call it', (_n, run) => {
  it('401 anonymous; 403 deactivated (SEC-21)', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
    signedInAs('bursar', { isActive: false });
    expect((await run()).status).toBe(403);
  });
  it.each(['parent', 'teacher', 'deputy', 'it_admin'])('403 for role %s', async (role) => {
    signedInAs(role);
    expect((await run()).status).toBe(403);
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(paymentFindMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/fees/payments (manual payment) (SEC-11)', () => {
  it('400 when the student is not an active student of THIS school', async () => {
    signedInAs('bursar');
    studentFindFirst.mockResolvedValue(null);
    expect((await post(valid({ studentId: 'stu-other-school' }))).status).toBe(400);
    expect(studentFindFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'stu-other-school',
      schoolId: 'school-A',
      deletedAt: null,
      status: 'active',
    });
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -500 }],
    ['text amount', { amount: 'lots' }],
    ['absurd amount', { amount: 999999999999 }],
    ['half-cent amount (the database stores 2 decimals)', { amount: 10.005 }],
    ['unknown method', { paymentMethod: 'barter' }],
    ['missing student', { studentId: '' }],
    ['over-long reference', { reference: 'x'.repeat(101) }],
    ['over-long notes', { notes: 'x'.repeat(501) }],
  ])('400 for %s', async (_n, over) => {
    signedInAs('bursar');
    expect((await post(valid(over))).status).toBe(400);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('409 for duplicate reference code', async () => {
    signedInAs('bursar');
    paymentFindFirst.mockResolvedValue({ id: 'pay-existing' });
    expect((await post(valid({ reference: 'DUPE-CODE' }))).status).toBe(409);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('400 for malformed JSON, and for "no current term"', async () => {
    signedInAs('bursar');
    expect((await post('{nope')).status).toBe(400);
    termFindFirst.mockResolvedValue(null);
    expect((await post(valid())).status).toBe(400);
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('accepts every method the bursar form offers, and a 2-decimal amount', async () => {
    signedInAs('bursar');
    for (const paymentMethod of ['cash', 'bank', 'cheque', 'mpesa']) {
      expect((await post(valid({ paymentMethod, amount: 1234.5 }))).status).toBe(201);
    }
  });

  it("records the payment for the caller's school and the current term, with the caller as recorder", async () => {
    signedInAs('bursar');
    const res = await post(
      valid({ schoolId: 'school-EVIL', recordedBy: 'u-EVIL', isReversed: true })
    );
    expect(res.status).toBe(201);
    expect(termFindFirst.mock.calls[0]![0]!.where).toEqual({
      schoolId: 'school-A',
      isCurrent: true,
    });
    const data = paymentCreate.mock.calls[0]![0]!.data;

    expect(data.schoolId).toBe('school-A');
    expect(data.studentId).toBe('stu-1');
    expect(data.termId).toBe('term-1');
    expect(data.receiptNumber).toBe('KIL-001001');

    // ✅ PAY-06: Verify amount is a string/Decimal (preventing float precision loss), not a raw number
    expect(String(data.amount)).toBe('5000');

    expect(data.paymentMethod).toBe('cash');
    expect(data.bankReference).toBe('RCPT-9');
    expect(data.recordedBy).toBe('u-1');
    expect('isReversed' in data).toBe(false);
  });

  it('audits the payment and notifies only an ACTIVE primary guardian whose account is active', async () => {
    signedInAs('bursar');
    await post(valid());
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'MANUAL_PAYMENT_RECORDED',
      }),
      expect.anything() // The tx client
    );
    const where = userFindFirst.mock.calls[0]![0]!.where;
    expect(where).toMatchObject({ isActive: true, deletedAt: null });
    expect(where.guardians.some).toMatchObject({
      studentId: 'stu-1',
      isPrimary: true,
      isActive: true,
    });
    expect(notifAdd.mock.calls[0]![1]!).toMatchObject({ userId: 'parent-1', type: 'payment' });
  });
});

describe('GET /api/fees/payments', () => {
  it("is scoped to the caller's school and excludes reversed payments", async () => {
    signedInAs('bursar');
    await get('?studentId=stu-1&termId=term-1');
    expect(paymentFindMany.mock.calls[0]![0]!.where).toEqual({
      schoolId: 'school-A',
      isReversed: false,
      studentId: 'stu-1',
      termId: 'term-1',
    });
  });

  it('400 for an invalid date filter (it used to crash with an Invalid Date)', async () => {
    signedInAs('bursar');
    expect((await get('?from=garbage')).status).toBe(400);
    expect((await get('?to=2026-13-45')).status).toBe(400);
    expect(paymentFindMany).not.toHaveBeenCalled();
  });

  it('applies valid date filters', async () => {
    signedInAs('bursar');
    await get('?from=2026-01-01&to=2026-03-31');
    const paidAt = paymentFindMany.mock.calls[0]![0]!.where.paidAt;
    expect(paidAt.gte).toBeInstanceOf(Date);
    expect(paidAt.lte).toBeInstanceOf(Date);
  });
});

// Add this to tests/routes/fees-payments.test.ts

describe('POST /api/fees/payments (PAY-08: Concurrent Allocation Locking)', () => {
  it('prevents race conditions: allocation runs inside transaction with locking', async () => {
    allocate.mockClear(); // ✅ Ensure we start with exactly 0 calls
    signedInAs('bursar');

    let allocateCallCount = 0;
    allocate.mockImplementation(({ amount }: any) => {
      allocateCallCount++;
      if (allocateCallCount === 1) {
        return { allocations: [{ feeItemId: 'fi-1', amountAllocated: 6000 }], overpayment: 0 };
      } else {
        return { allocations: [{ feeItemId: 'fi-1', amountAllocated: 4000 }], overpayment: 2000 };
      }
    });

    const createdPayments: any[] = [];
    paymentCreate.mockImplementation(async ({ data }: any) => {
      createdPayments.push(data);
      return { id: `pay-${allocateCallCount}`, ...data };
    });

    const res1 = post(valid({ amount: 6000, reference: 'REF-1' }));
    const res2 = post(valid({ amount: 6000, reference: 'REF-2' }));

    const [result1, result2] = await Promise.all([res1, res2]);

    expect(result1.status).toBe(201);
    expect(result2.status).toBe(201);

    // 1. Verify allocatePayment was called exactly twice (once per request)
    expect(allocate).toHaveBeenCalledTimes(2);

    const [firstAllocationCall, secondAllocationCall] = allocate.mock.calls;

    // 2. CRITICAL: Verify that BOTH calls received the transaction client (tx)
    expect(firstAllocationCall?.[0]?.tx).toBeDefined();
    expect(secondAllocationCall?.[0]?.tx).toBeDefined();

    // 3. Verify the second payment correctly recorded the overpayment
    expect(createdPayments).toHaveLength(2);
    const secondPaymentData = createdPayments[1]!;
    expect(Number(secondPaymentData.overpaymentAmount)).toBe(2000);
    expect(secondPaymentData.overpaymentAction).toBe('carry_forward');
  });
});
