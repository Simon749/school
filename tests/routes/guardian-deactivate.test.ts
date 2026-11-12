import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const guardianFindFirst = vi.fn();
const guardianUpdate = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    guardian: {
      findFirst: (...a: unknown[]) => guardianFindFirst(...a),
      update: (...a: unknown[]) => guardianUpdate(...a),
    },
    $transaction: vi.fn(async (cb: any) => await cb({ guardian: { update: guardianUpdate } })),
  },
}));

import { POST } from '@/app/api/guardians/[id]/deactivate/route';

const post = (body: unknown, id = 'g-1') =>
  POST(
    new Request('http://x', {
      method: 'POST',
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

beforeEach(() => {
  for (const m of [authMock, userFindUnique, guardianFindFirst, guardianUpdate, logAudit]) {
    m.mockReset();
  }
  guardianFindFirst.mockResolvedValue({
    id: 'g-1',
    isActive: true,
    user: { clerkId: 'clerk_parent_1' },
  });
  guardianUpdate.mockResolvedValue({ id: 'g-1', isActive: false });
});

describe('POST /api/guardians/[id]/deactivate (R1-25)', () => {
  it('401 anonymous; 403 for non-admin roles', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ reason: 'test' })).status).toBe(401);
    
    signedInAs('teacher');
    expect((await post({ reason: 'test' })).status).toBe(403);
  });

  it('400 for missing or short reason', async () => {
    signedInAs('admin');
    expect((await post({ reason: 'x' })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });

  it('404 if guardian is not in the admin\'s school', async () => {
    signedInAs('admin');
    guardianFindFirst.mockResolvedValue(null);
    expect((await post({ reason: 'Student transferred schools' })).status).toBe(404);
  });

  it('successfully deactivates guardian, logs audit, and returns clerkId', async () => {
    signedInAs('admin');
    const res = await post({ reason: 'Student transferred schools' });
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.clerkId).toBe('clerk_parent_1');

    expect(guardianUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g-1' },
        data: expect.objectContaining({
          isActive: false,
          deactivationReason: 'Student transferred schools',
          deactivatedBy: 'u-1',
        }),
      })
    );

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'guardian.deactivated',
        tableName: 'guardians',
        recordId: 'g-1',
        newData: { isActive: false, reason: 'Student transferred schools' },
      }),
      expect.anything() // tx client
    );
  });
});