import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const guardianFindFirst = vi.fn();
const disputeFindFirst = vi.fn();
const disputeCreate = vi.fn();
const disputeUpdate = vi.fn();
const feePaymentFindFirst = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'guardian', { get: () => ({ findFirst: (...a: unknown[]) => guardianFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'feePayment', { get: () => ({ findFirst: (...a: unknown[]) => feePaymentFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'paymentDispute', { 
    get: () => ({ 
      findFirst: (...a: unknown[]) => disputeFindFirst(...a),
      create: (...a: unknown[]) => disputeCreate(...a),
      update: (...a: unknown[]) => disputeUpdate(...a),
    }) 
  });
  
  mockPrisma.$transaction = async (cb: any) => cb(mockPrisma);
  return { prisma: mockPrisma };
});

import { POST as postDispute } from '@/app/api/fees/disputes/route';
import { PATCH as patchDispute } from '@/app/api/fees/disputes/[id]/route';
import { POST as postLookup } from '@/app/api/fees/disputes/[id]/lookup/route';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  postDispute(
    new Request('http://x/api/fees/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
  );

const patch = (id: string, body: unknown) =>
  patchDispute(
    new Request(`http://x/api/fees/disputes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    { params: { id } } as any
  );

const lookup = (id: string) =>
  postLookup(
    new Request(`http://x/api/fees/disputes/${id}/lookup`, { method: 'POST' }) as never,
    { params: { id } } as any
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

beforeEach(() => {
  for (const m of [authMock, userFindUnique, guardianFindFirst, disputeFindFirst, disputeCreate, disputeUpdate, feePaymentFindFirst, logAudit]) {
    m.mockReset();
  }
  
  guardianFindFirst.mockResolvedValue({ id: 'g-1' });
  disputeFindFirst.mockResolvedValue(null); // Default: no duplicate
  disputeCreate.mockResolvedValue({ id: 'd-1', status: 'open' });
  disputeUpdate.mockResolvedValue({ id: 'd-1', status: 'resolved' });
});

describe('POST /api/fees/disputes (PAY-12)', () => {
  it('403 for non-parent roles', async () => {
    signedInAs('bursar');
    expect((await post({ studentId: 's-1', mpesaCodeClaimed: 'QKH123', amountClaimed: 1000 })).status).toBe(403);
  });

  it('403 if caller is not an active guardian of the student', async () => {
    signedInAs('parent');
    guardianFindFirst.mockResolvedValue(null);
    expect((await post({ studentId: 's-1', mpesaCodeClaimed: 'QKH123', amountClaimed: 1000 })).status).toBe(403);
  });

  it('409 for duplicate MPesa code (idempotency)', async () => {
    signedInAs('parent');
    disputeFindFirst.mockResolvedValue({ id: 'd-existing', status: 'open' });
    const res = await post({ studentId: 's-1', mpesaCodeClaimed: 'QKH123', amountClaimed: 1000 });
    expect(res.status).toBe(409);
    expect(disputeCreate).not.toHaveBeenCalled();
  });

  it('201 creates dispute as "open" (no auto-resolve), scoped to school, audited', async () => {
    signedInAs('parent');
    const res = await post({ studentId: 's-1', mpesaCodeClaimed: 'QKH123', amountClaimed: 1000 });
    
    expect(res.status).toBe(201);
    expect(disputeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: 'school-A',
          studentId: 's-1',
          raisedById: 'u-1',
          status: 'open', // ✅ Never auto-resolve
        }),
      })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYMENT_DISPUTE_RAISED' }),
      expect.anything()
    );
  });
});

describe('PATCH /api/fees/disputes/[id] (PAY-12)', () => {
  it('403 for non-bursar/admin roles', async () => {
    signedInAs('parent');
    expect((await patch('d-1', { status: 'resolved' })).status).toBe(403);
  });

  it('404 if dispute is not in caller\'s school', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue(null);
    expect((await patch('d-1', { status: 'resolved' })).status).toBe(404);
  });

  it('400 for invalid status transition (e.g., resolved → open)', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue({ id: 'd-1', status: 'resolved', studentId: 's-1' });
    const res = await patch('d-1', { status: 'investigating' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid status transition');
  });

  it('400 for linked payment not in same school/student', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue({ id: 'd-1', status: 'open', studentId: 's-1' });
    feePaymentFindFirst.mockResolvedValue(null);
    expect((await patch('d-1', { status: 'resolved', paymentId: 'p-evil' })).status).toBe(400);
  });

  it('200 successfully resolves dispute with status machine + audit', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue({ id: 'd-1', status: 'investigating', studentId: 's-1' });
    feePaymentFindFirst.mockResolvedValue({ id: 'p-1' });
    
    const res = await patch('d-1', { status: 'resolved', resolutionNote: 'Verified via Daraja', paymentId: 'p-1' });
    
    expect(res.status).toBe(200);
    expect(disputeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'resolved',
          resolvedById: 'u-1',
        }),
      })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYMENT_DISPUTE_UPDATED' }),
      expect.anything() // tx client
    );
  });
});

describe('POST /api/fees/disputes/[id]/lookup (PAY-12)', () => {
  it('403 for non-bursar/admin roles', async () => {
    signedInAs('parent');
    expect((await lookup('d-1')).status).toBe(403);
  });

  it('404 if dispute is not in caller\'s school', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue(null);
    expect((await lookup('d-1')).status).toBe(404);
  });

  it('400 if dispute is already closed', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue({ id: 'd-1', status: 'resolved', mpesaCodeClaimed: 'QKH123' });
    expect((await lookup('d-1')).status).toBe(400);
  });

  it('200 performs lookup, updates dispute, transitions open → investigating', async () => {
    signedInAs('bursar');
    disputeFindFirst.mockResolvedValue({ id: 'd-1', status: 'open', mpesaCodeClaimed: 'QKH123' });
    
    const res = await lookup('d-1');
    expect(res.status).toBe(200);
    
    expect(disputeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'investigating', // Auto-transition
        }),
      })
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYMENT_DISPUTE_DARAJA_LOOKUP' }),
      expect.anything()
    );
  });
});