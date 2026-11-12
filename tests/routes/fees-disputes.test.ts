import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindMany = vi.fn();
const guardianFindFirst = vi.fn();
const disputeCreate = vi.fn();
const disputeFindFirst = vi.fn();
const disputeFindMany = vi.fn();
const disputeUpdate = vi.fn();
const paymentFindFirst = vi.fn();
const studentFindMany = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/mpesa/daraja', () => ({ queryStkStatus: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
    },
    guardian: { findFirst: (...a: unknown[]) => guardianFindFirst(...a) },
    paymentDispute: {
      create: (...a: unknown[]) => disputeCreate(...a),
      findFirst: (...a: unknown[]) => disputeFindFirst(...a),
      findMany: (...a: unknown[]) => disputeFindMany(...a),
      update: (...a: unknown[]) => disputeUpdate(...a),
    },
    feePayment: { findFirst: (...a: unknown[]) => paymentFindFirst(...a) },
    student: { findMany: (...a: unknown[]) => studentFindMany(...a) },
  },
}));

import { GET, POST } from '@/app/api/fees/disputes/route';
import { PATCH } from '@/app/api/fees/disputes/[id]/route';

const post = (body: unknown) =>
  POST(
    new Request('http://x', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
  );
const patch = (body: unknown, id = 'd-1') =>
  PATCH(
    new Request('http://x', {
      method: 'PATCH',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    { params: { id } }
  );

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
const claim = (over: Record<string, unknown> = {}) => ({
  studentId: 'stu-1',
  mpesaCodeClaimed: 'RKT84H29L1',
  amountClaimed: 2000,
  screenshotUrl: 'https://files.example/shot.png',
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    userFindMany,
    guardianFindFirst,
    disputeCreate,
    disputeFindFirst,
    disputeFindMany,
    disputeUpdate,
    paymentFindFirst,
    studentFindMany,
    logAudit,
  ])
    m.mockReset();
  guardianFindFirst.mockResolvedValue({ id: 'g-1' });
  disputeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'd-1',
    status: 'open',
    createdAt: new Date(),
    ...data,
  }));
  disputeFindFirst.mockResolvedValue({
    id: 'd-1',
    schoolId: 'school-A',
    studentId: 'stu-1',
    status: 'open',
  });
  disputeUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: 'd-1', ...data }));
  paymentFindFirst.mockResolvedValue({ id: 'pay-1' });
  disputeFindMany.mockResolvedValue([]);
  studentFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
});

describe('POST /api/fees/disputes (raise a dispute) (PAY-12)', () => {
  it('401 anonymous; 403 deactivated', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post(claim())).status).toBe(401);
    signedInAs('parent', { isActive: false });
    expect((await post(claim())).status).toBe(403);
  });

  it.each(['admin', 'bursar', 'teacher', 'deputy', 'it_admin'])(
    '403 for role %s (design RBAC: only parents raise disputes)',
    async (role) => {
      signedInAs(role);
      expect((await post(claim())).status).toBe(403);
      expect(disputeCreate).not.toHaveBeenCalled();
    }
  );

  it("only for the parent's OWN active child, in this school (else 404, nothing created)", async () => {
    signedInAs('parent');
    guardianFindFirst.mockResolvedValue(null);
    expect((await post(claim({ studentId: 'stu-not-mine' }))).status).toBe(404);
    expect(disputeCreate).not.toHaveBeenCalled();
    expect(guardianFindFirst.mock.calls[0]![0]!.where).toMatchObject({
      userId: 'u-1',
      studentId: 'stu-not-mine',
      isActive: true,
      student: { schoolId: 'school-A', deletedAt: null },
    });
  });

  it('creates an OPEN dispute for the caller in their school; it is never auto-resolved', async () => {
    signedInAs('parent');
    const res = await post(claim());
    expect(res.status).toBe(201);
    const data = disputeCreate.mock.calls[0]![0]!.data;
    expect(data).toMatchObject({
      schoolId: 'school-A',
      studentId: 'stu-1',
      raisedBy: 'u-1',
      mpesaCodeClaimed: 'RKT84H29L1',
      amountClaimed: 2000,
    });
    expect(data.status).toBeUndefined(); // database default 'open'
    expect(disputeUpdate).not.toHaveBeenCalled();
    expect(paymentFindFirst).not.toHaveBeenCalled(); // no look-up of the claimed code
  });

  it('the answer never reveals whether the claimed M-Pesa code exists (no oracle)', async () => {
    signedInAs('parent');
    paymentFindFirst.mockResolvedValue({ id: 'pay-1' }); // even if it did exist
    const body = await (await post(claim())).json();
    expect(body.resolved).toBeUndefined();
    expect(Object.keys(body)).toEqual(['dispute']);
    expect(Object.keys(body.dispute).sort()).toEqual(['createdAt', 'id', 'status']);
  });

  it.each([
    ['no student', { studentId: '' }],
    ['no code and no amount', { mpesaCodeClaimed: undefined, amountClaimed: undefined }],
    ['code too long for the column', { mpesaCodeClaimed: 'A'.repeat(21) }],
    ['code with symbols', { mpesaCodeClaimed: 'RKT-84H;29' }],
    ['negative amount', { amountClaimed: -5 }],
    ['text amount', { amountClaimed: 'much' }],
    ['screenshot that is not https', { screenshotUrl: 'javascript:alert(1)' }],
    ['screenshot over-long', { screenshotUrl: 'https://x.co/' + 'a'.repeat(600) }],
  ])('400 for %s', async (_n, over) => {
    signedInAs('parent');
    expect((await post(claim(over))).status).toBe(400);
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it('400 for malformed JSON', async () => {
    signedInAs('parent');
    expect((await post('{nope')).status).toBe(400);
  });
});

describe('GET /api/fees/disputes', () => {
  it('admin/bursar only; school-scoped, including the student and raiser look-ups', async () => {
    signedInAs('parent');
    expect((await GET()).status).toBe(403);
    signedInAs('bursar');
    disputeFindMany.mockResolvedValue([{ id: 'd-1', studentId: 'stu-1', raisedBy: 'u-9' }]);
    await GET();
    expect(disputeFindMany.mock.calls[0]![0]!.where).toEqual({ schoolId: 'school-A' });
    expect(studentFindMany.mock.calls[0]![0]!.where).toMatchObject({ schoolId: 'school-A' });
    expect(userFindMany.mock.calls[0]![0]!.where).toMatchObject({ schoolId: 'school-A' });
  });
});

describe('PATCH /api/fees/disputes/[id] (PAY-12, SEC-11)', () => {
  it('401 anonymous; 403 for deactivated and non-finance roles', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await patch({ status: 'investigating' })).status).toBe(401);
    signedInAs('bursar', { isActive: false });
    expect((await patch({ status: 'investigating' })).status).toBe(403);
    for (const role of ['parent', 'teacher', 'deputy', 'it_admin']) {
      signedInAs(role);
      expect((await patch({ status: 'investigating' })).status).toBe(403);
    }
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it("another school's dispute is a 404 and is NOT updated", async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue(null);
    expect((await patch({ status: 'resolved' }, 'd-of-school-B')).status).toBe(404);
    expect(disputeFindFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'd-of-school-B',
      schoolId: 'school-A',
    });
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it('a linked payment must be in this school AND for the same student', async () => {
    signedInAs('bursar');
    paymentFindFirst.mockResolvedValue(null);
    expect((await patch({ status: 'resolved', paymentId: 'pay-other' })).status).toBe(400);
    expect(paymentFindFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'pay-other',
      schoolId: 'school-A',
      studentId: 'stu-1',
    });
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it('resolves with a note, linked payment, resolver and time; audits old and new status', async () => {
    signedInAs('bursar');
    const res = await patch({
      status: 'resolved',
      resolutionNote: 'Matches receipt KIL-001001',
      paymentId: 'pay-1',
    });
    expect(res.status).toBe(200);
    const data = disputeUpdate.mock.calls[0]![0]!.data;
    expect(data).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Matches receipt KIL-001001',
      paymentId: 'pay-1',
      resolvedBy: 'u-1',
    });
    expect(data.resolvedAt).toBeInstanceOf(Date);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'dispute.updated',
        recordId: 'd-1',
        oldData: { status: 'open' },
        newData: expect.objectContaining({ status: 'resolved' }),
      })
    );
  });

  it('moving to "investigating" records no resolver', async () => {
    signedInAs('bursar');
    await patch({ status: 'investigating' });
    const data = disputeUpdate.mock.calls[0]![0]!.data;
    expect(data.resolvedBy).toBeNull();
    expect(data.resolvedAt).toBeNull();
  });

  it('400 for an unknown status, over-long note, or malformed JSON', async () => {
    signedInAs('bursar');
    expect((await patch({ status: 'banana' })).status).toBe(400);
    expect((await patch({ status: 'resolved', resolutionNote: 'x'.repeat(1001) })).status).toBe(
      400
    );
    expect((await patch('{nope')).status).toBe(400);
    expect(disputeUpdate).not.toHaveBeenCalled();
  });
});
