import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const slotFindFirst = vi.fn();
const registerUpsert = vi.fn();
const termFindFirst = vi.fn();
const slotUpdateMany = vi.fn();
const logAudit = vi.fn();
const schoolCalendarDayFindUnique = vi.fn(); // Added

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (e: unknown) => logAudit(e),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }) // Added
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};

  // Use lazy getters so functions resolve AFTER variable initialization
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'timetableSlot', { get: () => ({ findFirst: (...a: unknown[]) => slotFindFirst(...a), updateMany: (...a: unknown[]) => slotUpdateMany(...a) }) });
  Object.defineProperty(mockPrisma, 'lessonRegister', { get: () => ({ upsert: (...a: unknown[]) => registerUpsert(...a) }) });
  Object.defineProperty(mockPrisma, 'term', { get: () => ({ findFirst: (...a: unknown[]) => termFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', { get: () => ({ findUnique: (...a: unknown[]) => schoolCalendarDayFindUnique(...a) }) });

  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

import { POST as unlock } from '@/app/api/attendance/unlock/route';
import { POST as publish } from '@/app/api/timetable/publish/route';

const json = (body: unknown) => ({
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const doUnlock = (body: unknown) => unlock(new Request('http://x', json(body)) as never);
const doPublish = (body: unknown) => publish(new Request('http://x', json(body)) as never);

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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z')); // a Monday
  for (const m of [
    authMock,
    userFindUnique,
    slotFindFirst,
    registerUpsert,
    termFindFirst,
    slotUpdateMany,
    logAudit,
    schoolCalendarDayFindUnique, // Added
  ])
    m.mockReset();
  slotFindFirst.mockResolvedValue({ id: 'slot-1', dayOfWeek: 1 });
  registerUpsert.mockResolvedValue({ id: 'reg-1', isLocked: false });
  termFindFirst.mockResolvedValue({ id: 'term-1' });
  slotUpdateMany.mockResolvedValue({ count: 12 });

  // Added calendar mock setup
  schoolCalendarDayFindUnique.mockResolvedValue({
    id: 'cal-1',
    date: new Date('2026-10-26T00:00:00.000Z'),
    dayType: 'school_day',
    timetableType: 'normal',
  });
});
afterEach(() => vi.useRealTimers());

describe.each([
  ['unlock', () => doUnlock({ slotId: 'slot-1', date: '2026-10-26' })],
  ['publish', () => doPublish({ termId: 'term-1' })],
] as const)('%s: who may call it', (_n, run) => {
  it('401 anonymous; 403 deactivated admin (SEC-21)', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
    signedInAs('admin', { isActive: false });
    expect((await run()).status).toBe(403);
  });
  it.each(['teacher', 'parent', 'bursar', 'deputy', 'it_admin'])(
    '403 for role %s',
    async (role) => {
      signedInAs(role);
      expect((await run()).status).toBe(403);
      expect(registerUpsert).not.toHaveBeenCalled();
      expect(slotUpdateMany).not.toHaveBeenCalled();
    }
  );
});

describe('POST /api/attendance/unlock (SEC-11)', () => {
  it("the slot must be in the caller's school: another school's slot is a 404 and no register row is written", async () => {
    signedInAs('admin');
    slotFindFirst.mockResolvedValue(null);
    expect((await doUnlock({ slotId: 'slot-B', date: '2026-10-26' })).status).toBe(404);
    expect(slotFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 'slot-B', schoolId: 'school-A' });
    expect(registerUpsert).not.toHaveBeenCalled();
  });

  it.each([['garbage'], ['2026-02-30'], ['2026-10-27'], ['2026-11-02']])(
    '400 for an invalid register date %s (not a real date / not the lesson weekday / future)',
    async (date) => {
      signedInAs('admin');
      expect((await doUnlock({ slotId: 'slot-1', date })).status).toBe(400);
      expect(registerUpsert).not.toHaveBeenCalled();
    }
  );

  it('400 for malformed JSON or missing fields', async () => {
    signedInAs('admin');
    expect((await unlock(new Request('http://x', json('{nope')) as never)).status).toBe(400);
    expect((await doUnlock({ slotId: 'slot-1' })).status).toBe(400);
  });

  it("unlocks in the CALLER's school, records who and when, and audits it", async () => {
    signedInAs('admin');
    const res = await doUnlock({ slotId: 'slot-1', date: '2026-10-26' });
    expect(res.status).toBe(200);
    const arg = registerUpsert.mock.calls[0]![0]!;
    expect(arg.create).toMatchObject({
      schoolId: 'school-A',
      slotId: 'slot-1',
      isLocked: false,
      unlockedBy: 'u-1',
    });
    expect(arg.update).toMatchObject({ isLocked: false, unlockedBy: 'u-1' });
    expect(arg.update.unlockedAt).toBeInstanceOf(Date);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'ATTENDANCE_REGISTER_UNLOCKED',
        tableName: 'lesson_registers',
      })
    );
  });
});

describe('POST /api/timetable/publish', () => {
  it('400 for malformed JSON or a missing termId; 400 for a term of another school', async () => {
    signedInAs('admin');
    expect((await publish(new Request('http://x', json('{nope')) as never)).status).toBe(400);
    expect((await doPublish({})).status).toBe(400);
    termFindFirst.mockResolvedValue(null);
    expect((await doPublish({ termId: 'term-B' })).status).toBe(400);
    expect(slotUpdateMany).not.toHaveBeenCalled();
    expect(termFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 'term-B', schoolId: 'school-A' });
  });

  it("publishes only this school's unpublished slots for that term, and audits the count", async () => {
    signedInAs('admin');
    const res = await doPublish({ termId: 'term-1' });
    expect(await res.json()).toEqual({ success: true, publishedCount: 12 });
    expect(slotUpdateMany.mock.calls[0]![0]!).toEqual({
      where: { termId: 'term-1', schoolId: 'school-A', isPublished: false },
      data: { isPublished: true },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'timetable.published',
        newData: expect.objectContaining({ termId: 'term-1', publishedCount: 12 }),
      })
    );
  });
});