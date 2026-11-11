import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const studentFindUnique = vi.fn();
const termFindUnique = vi.fn();
const feePaymentFindFirst = vi.fn();
const feePaymentCreate = vi.fn();
const schoolFindUnique = vi.fn();
const receiptSequenceUpsert = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'student', { get: () => ({ findUnique: (...a: unknown[]) => studentFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'term', { get: () => ({ findUnique: (...a: unknown[]) => termFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'feePayment', { 
    get: () => ({ 
      findFirst: (...a: unknown[]) => feePaymentFindFirst(...a),
      create: (...a: unknown[]) => feePaymentCreate(...a)
    }) 
  });
  Object.defineProperty(mockPrisma, 'school', { get: () => ({ findUnique: (...a: unknown[]) => schoolFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'receiptSequence', { get: () => ({ upsert: (...a: unknown[]) => receiptSequenceUpsert(...a) }) });
  
  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

import { POST } from '@/app/api/fees/payments/route';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/fees/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
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
  for (const m of [authMock, userFindUnique, studentFindUnique, termFindUnique, feePaymentFindFirst, feePaymentCreate, schoolFindUnique, receiptSequenceUpsert, logAudit]) {
    m.mockReset();
  }
  
  studentFindUnique.mockResolvedValue({ id: 's-1', firstName: 'John', lastName: 'Doe' });
  termFindUnique.mockResolvedValue({ id: 't-1' });
  schoolFindUnique.mockResolvedValue({ name: 'Nairobi Academy', knecCode: 'NKA123' });
  receiptSequenceUpsert.mockResolvedValue({ lastNumber: 42 });
  feePaymentCreate.mockResolvedValue({ id: 'p-1', receiptNumber: 'NKA1-2026-000042' });
});

describe('POST /api/fees/payments (PAY-06, PAY-09, PAY-10)', () => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ studentId: 's-1', termId: 't-1', amount: '1000', paymentMethod: 'cash' })).status).toBe(401);
  });

  it('403 for non-admin/bursar roles', async () => {
    signedInAs('teacher');
    expect((await post({ studentId: 's-1', termId: 't-1', amount: '1000', paymentMethod: 'cash' })).status).toBe(403);
  });

  it('400 for invalid amount format (PAY-06)', async () => {
    signedInAs('bursar');
    const res = await post({ studentId: 's-1', termId: 't-1', amount: '1000.555', paymentMethod: 'cash' });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('valid decimal string');
  });

  it('400 for negative or zero amount (PAY-06)', async () => {
    signedInAs('bursar');
    const res = await post({ studentId: 's-1', termId: 't-1', amount: '0', paymentMethod: 'cash' });
    expect(res.status).toBe(400);
  });

  it('404 for student not in caller school (PAY-10)', async () => {
    signedInAs('bursar');
    studentFindUnique.mockResolvedValue(null);
    expect((await post({ studentId: 's-99', termId: 't-1', amount: '1000', paymentMethod: 'cash' })).status).toBe(404);
  });

  it('409 for duplicate mpesaCode (PAY-10)', async () => {
    signedInAs('bursar');
    feePaymentFindFirst.mockResolvedValue({ id: 'p-existing' });
    const res = await post({ 
      studentId: 's-1', termId: 't-1', amount: '1000', paymentMethod: 'mpesa', mpesaCode: 'QKH123' 
    });
    expect(res.status).toBe(409);
  });

  it('201 success: validates, scopes, generates atomic receipt, and audits (PAY-09)', async () => {
    signedInAs('bursar');
    
    const res = await post({
      studentId: 's-1',
      termId: 't-1',
      amount: '1500.50',
      paymentMethod: 'bank',
      bankReference: 'REF-999',
      notes: 'Term 1 fees'
    });
    
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.receiptNumber).toBe('NKA1-2026-000042');
    
    // Verify atomic sequence upsert was called
    expect(receiptSequenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId_year: { schoolId: 'school-A', year: new Date().getFullYear() } },
        update: { lastNumber: { increment: 1 } },
      })
    );

    // Verify audit log was called WITH the transaction client
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MANUAL_PAYMENT_RECORDED',
        newData: expect.objectContaining({ amount: '1500.50' }),
      }),
      expect.anything() // The tx client
    );
  });
});