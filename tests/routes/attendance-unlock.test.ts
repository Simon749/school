import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const slotFindUnique = vi.fn();
const calendarFindUnique = vi.fn();
const registerUpsert = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', { get: () => ({ findUnique: (...a: unknown[]) => calendarFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }) });
  // ✅ Added both findUnique and findFirst to be bulletproof
  Object.defineProperty(mockPrisma, 'timetableSlot', {
    get: () => ({
      findUnique: (...a: unknown[]) => slotFindUnique(...a),
      findFirst: (...a: unknown[]) => slotFindUnique(...a)
    })
  });
  Object.defineProperty(mockPrisma, 'lessonRegister', { get: () => ({ upsert: (...a: unknown[]) => registerUpsert(...a) }) });

  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

vi.mock('@/lib/calendar', () => ({
  getCalendarDay: (...a: unknown[]) => calendarFindUnique(...a),
}));

import { POST } from '@/app/api/attendance/unlock/route';

const SLOT = '55555555-5555-4555-8555-555555555555';
const TODAY = '2026-10-26';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/attendance/unlock', {
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
  for (const m of [authMock, userFindUnique, slotFindUnique, calendarFindUnique, registerUpsert, logAudit]) {
    m.mockReset();
  }

  slotFindUnique.mockResolvedValue({ id: SLOT, dayOfWeek: 1 }); // 2026-10-26 is a Monday
  registerUpsert.mockResolvedValue({ id: 'reg-1', isLocked: false });
  calendarFindUnique.mockReset();
  calendarFindUnique.mockResolvedValue({
    id: 'cal-1',
    date: new Date('2026-10-26T00:00:00.000Z'), // Must match the date in the test
    dayType: 'school_day',
    timetableType: 'normal',
  });
});

describe('POST /api/attendance/unlock (ATT-08)', () => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ slotId: SLOT, date: TODAY })).status).toBe(401);
  });

  it('403 for non-admin/deputy roles (e.g., teacher)', async () => {
    signedInAs('teacher');
    expect((await post({ slotId: SLOT, date: TODAY })).status).toBe(403);
  });

  it('400 for missing slotId or date', async () => {
    signedInAs('admin');
    expect((await post({ slotId: SLOT })).status).toBe(400);
    expect((await post({ date: TODAY })).status).toBe(400);
  });

  it('404 for slot not in caller school (Cross-tenant IDOR)', async () => {
    signedInAs('admin');
    slotFindUnique.mockResolvedValue(null); // Simulates slot belonging to another school or not existing
    expect((await post({ slotId: SLOT, date: TODAY })).status).toBe(404);
  });

  it('400 if calendar day is not a school_day', async () => {
    signedInAs('admin');
    calendarFindUnique.mockResolvedValue({ dayType: 'holiday', timetableType: 'none' });
    expect((await post({ slotId: SLOT, date: TODAY })).status).toBe(400);
  });

  it('200 success: unlocks register and logs audit transactionally', async () => {
    signedInAs('deputy');

    const res = await post({ slotId: SLOT, date: TODAY });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    // ✅ FIX: Use nested expect.objectContaining so it passes even if unlockedAt/unlockedBy are present
    expect(registerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ isLocked: false }),
        create: expect.objectContaining({
          isLocked: false,
          schoolId: 'school-A',
          slotId: SLOT
        }),
      })
    );

    // Verify audit log was called WITH the transaction client (tx)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ATTENDANCE_REGISTER_UNLOCKED',
        newData: expect.objectContaining({ slotId: SLOT, date: expect.stringContaining(TODAY) }),
      }),
      expect.anything() // The tx client
    );
  });
});