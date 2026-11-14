import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const schoolFindUnique = vi.fn();
const schoolUpdate = vi.fn();
const logAudit = vi.fn();
const getRequestMetadata = vi.fn().mockReturnValue({ ipAddress: '1.2.3.4', userAgent: 'test-ua' });

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));

vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => getRequestMetadata(),
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'user', {
    get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }),
  });
  Object.defineProperty(mockPrisma, 'school', {
    get: () => ({
      findUnique: (...a: unknown[]) => schoolFindUnique(...a),
      update: (...a: unknown[]) => schoolUpdate(...a),
    }),
  });

  // Mock $transaction to execute the callback with the mockPrisma object
  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

import { GET, PUT } from '@/app/api/school/settings/route';

const get = () => GET(new Request('http://x/api/school/settings') as never);
const put = (body: unknown) =>
  PUT(
    new Request('http://x/api/school/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
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

  schoolFindUnique.mockResolvedValue({
    id: 'school-A',
    name: 'Test School',
    phone: '0712345678',
    email: 'admin@test.com',
    logoUrl: 'https://example.com/logo.png',
    latitude: -1.2921,
    longitude: 36.8219,
    geofenceRadius: 150,
  });
};

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    schoolFindUnique,
    schoolUpdate,
    logAudit,
    getRequestMetadata,
  ]) {
    m.mockReset();
  }
  getRequestMetadata.mockReturnValue({ ipAddress: '1.2.3.4', userAgent: 'test-ua' });
});

afterEach(() => vi.clearAllMocks());

describe('GET /api/school/settings (SEC-13)', () => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await get()).status).toBe(401);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('403 deactivated user', async () => {
    signedInAs('admin', { isActive: false });
    expect((await get()).status).toBe(403);
    expect(schoolFindUnique).not.toHaveBeenCalled();
  });

  it('requests basic info for a teacher, explicitly HIDING geofence coordinates', async () => {
    signedInAs('teacher');
    const res = await get();
    expect(res.status).toBe(200);

    // ✅ PROOF: Verify the route constructed the correct Prisma select argument
    const callArgs = schoolFindUnique.mock.calls[0]![0]!;
    expect(callArgs.select.latitude).toBeUndefined();
    expect(callArgs.select.longitude).toBeUndefined();
    expect(callArgs.select.geofenceRadius).toBeUndefined();
    expect(callArgs.select.name).toBe(true);

    const data = await res.json();
    expect(data.school.name).toBe('Test School');
    expect(data.school.phone).toBe('0712345678');
  });

  it('requests geofence coordinates for admin', async () => {
    signedInAs('admin');
    const res = await get();
    expect(res.status).toBe(200);

    // ✅ PROOF: Verify the route included geofence fields in the select argument
    const callArgs = schoolFindUnique.mock.calls[0]![0]!;
    expect(callArgs.select.latitude).toBe(true);
    expect(callArgs.select.longitude).toBe(true);
    expect(callArgs.select.geofenceRadius).toBe(true);

    const data = await res.json();
    expect(data.school.latitude).toBe(-1.2921);
  });

  it('requests geofence coordinates for it_admin', async () => {
    signedInAs('it_admin');
    const res = await get();
    expect(res.status).toBe(200);

    const callArgs = schoolFindUnique.mock.calls[0]![0]!;
    expect(callArgs.select.latitude).toBe(true);
  });

  it('404 if school not found', async () => {
    signedInAs('admin');
    schoolFindUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });
});

describe('PUT /api/school/settings (R1-18)', () => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await put({ name: 'New Name' })).status).toBe(401);
  });

  it('403 for non-privileged roles (teacher, deputy, parent, bursar)', async () => {
    for (const role of ['teacher', 'deputy', 'parent', 'bursar']) {
      signedInAs(role);
      const res = await put({ name: 'New Name' });
      expect(res.status).toBe(403);
      expect(schoolUpdate).not.toHaveBeenCalled();
    }
  });

  it('400 for invalid JSON', async () => {
    signedInAs('admin');
    const req = new Request('http://x/api/school/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json }',
    });
    const res = await PUT(req as never);
    expect(res.status).toBe(400);
  });

  it('400 for invalid geofence radius (< 50)', async () => {
    signedInAs('admin');
    const res = await put({ geofenceRadius: 10 });
    expect(res.status).toBe(400);
    expect(schoolUpdate).not.toHaveBeenCalled();
  });

  it('400 for invalid geofence radius (> 500)', async () => {
    signedInAs('admin');
    const res = await put({ geofenceRadius: 1000 });
    expect(res.status).toBe(400);
    expect(schoolUpdate).not.toHaveBeenCalled();
  });

  it('400 for invalid Kenyan phone format', async () => {
    signedInAs('admin');
    const res = await put({ phone: '12345' });
    expect(res.status).toBe(400);
    expect(schoolUpdate).not.toHaveBeenCalled();
  });

  it('400 for mass-assignment attempt (e.g., smsBalance)', async () => {
    signedInAs('admin');
    // .strict() in Zod should reject unknown fields
    const res = await put({ name: 'New School', smsBalance: 9999 });
    expect(res.status).toBe(400);
    expect(schoolUpdate).not.toHaveBeenCalled();
  });

  it('404 if school not found', async () => {
    signedInAs('admin');
    schoolFindUnique.mockResolvedValue(null);
    const res = await put({ name: 'New School' });
    expect(res.status).toBe(404);
    expect(schoolUpdate).not.toHaveBeenCalled();
  });

  it('200 success: updates school, uses $transaction, and logs audit', async () => {
    signedInAs('admin');
    schoolUpdate.mockResolvedValue({
      id: 'school-A',
      name: 'Updated School',
      phone: '0712345678',
      geofenceRadius: 200,
    });

    const res = await put({ name: 'Updated School', geofenceRadius: 200 });
    expect(res.status).toBe(200);

    // Verify update was called with correct data
    expect(schoolUpdate).toHaveBeenCalledWith({
      where: { id: 'school-A' },
      data: { name: 'Updated School', geofenceRadius: 200 },
    });

    // Verify audit was logged inside the transaction
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'SCHOOL_SETTINGS_UPDATED',
        tableName: 'schools',
        recordId: 'school-A',
        oldData: expect.objectContaining({
          name: 'Test School',
          geofenceRadius: 150,
        }),
        newData: { name: 'Updated School', geofenceRadius: 200 },
        ipAddress: '1.2.3.4',
        userAgent: 'test-ua',
      }),
      expect.anything() // The tx client
    );
  });
});
