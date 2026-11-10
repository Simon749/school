import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const studentFindFirst = vi.fn();
const termFindFirst = vi.fn();
const paymentCreate = vi.fn();
const paymentFindMany = vi.fn();
const allocate = vi.fn();
const receipt = vi.fn();
const notifAdd = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (e: unknown) => logAudit(e),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 't' }),
}));
vi.mock('@/lib/fees/allocation', () => ({ allocatePayment: (...a: unknown[]) => allocate(...a) }));
vi.mock('@/lib/fees/receipt', () => ({
  generateReceiptNumber: (...a: unknown[]) => receipt(...a),
}));
vi.mock('@/lib/queue', () => ({ notificationQueue: { add: (...a: unknown[]) => notifAdd(...a) } }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    },
    student: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    feePayment: {
      create: (...a: unknown[]) => paymentCreate(...a),
      findMany: (...a: unknown[]) => paymentFindMany(...a),
    },
  },
}));

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
    allocate,
    receipt,
    notifAdd,
    logAudit,
  ])
    m.mockReset();
  studentFindFirst.mockResolvedValue({ id: 'stu-1', firstName: 'Amara' });
  termFindFirst.mockResolvedValue({ id: 'term-1' });
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
  const noPayment = () => {
    expect(paymentCreate).not.toHaveBeenCalled();
    expect(allocate).not.toHaveBeenCalled();
    expect(receipt).not.toHaveBeenCalled();
  };

  it('400 when the student is not an active student of THIS school (it used to record against any student id)', async () => {
    signedInAs('bursar');
    studentFindFirst.mockResolvedValue(null);
    expect((await post(valid({ studentId: 'stu-other-school' }))).status).toBe(400);
    expect(studentFindFirst.mock.calls[0][0].where).toEqual({
      id: 'stu-other-school',
      schoolId: 'school-A',
      deletedAt: null,
      status: 'active',
    });
    noPayment();
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
    noPayment();
  });

  it('400 for malformed JSON, and for "no current term"', async () => {
    signedInAs('bursar');
    expect((await post('{nope')).status).toBe(400);
    termFindFirst.mockResolvedValue(null);
    expect((await post(valid())).status).toBe(400);
    noPayment();
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
    expect(termFindFirst.mock.calls[0][0].where).toEqual({ schoolId: 'school-A', isCurrent: true });
    const data = paymentCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      schoolId: 'school-A',
      studentId: 'stu-1',
      termId: 'term-1',
      receiptNumber: 'KIL-001001',
      amount: 5000,
      paymentMethod: 'cash',
      bankReference: 'RCPT-9',
      recordedBy: 'u-1',
    });
    expect('isReversed' in data).toBe(false);
  });

  it('audits the payment and notifies only an ACTIVE primary guardian whose account is active', async () => {
    signedInAs('bursar');
    await post(valid());
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'fee.payment.recorded',
      })
    );
    const where = userFindFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ isActive: true, deletedAt: null });
    expect(where.guardians.some).toMatchObject({
      studentId: 'stu-1',
      isPrimary: true,
      isActive: true,
    });
    expect(notifAdd.mock.calls[0][1]).toMatchObject({ userId: 'parent-1', type: 'payment' });
  });
});

describe('GET /api/fees/payments', () => {
  it("is scoped to the caller's school and excludes reversed payments", async () => {
    signedInAs('bursar');
    await get('?studentId=stu-1&termId=term-1');
    expect(paymentFindMany.mock.calls[0][0].where).toEqual({
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
    const paidAt = paymentFindMany.mock.calls[0][0].where.paidAt;
    expect(paidAt.gte).toBeInstanceOf(Date);
    expect(paidAt.lte).toBeInstanceOf(Date);
  });
});
