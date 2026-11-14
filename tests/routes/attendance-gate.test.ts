import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const studentFindUnique = vi.fn();
const calendarFindUnique = vi.fn();
const attendanceUpsert = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'user', {
    get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }),
  });
  Object.defineProperty(mockPrisma, 'student', {
    get: () => ({ findUnique: (...a: unknown[]) => studentFindUnique(...a) }),
  });
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', {
    get: () => ({ findUnique: (...a: unknown[]) => calendarFindUnique(...a) }),
  });
  Object.defineProperty(mockPrisma, 'studentDailyAttendance', {
    get: () => ({ upsert: (...a: unknown[]) => attendanceUpsert(...a) }),
  });

  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

vi.mock('@/lib/calendar', () => ({
  getCalendarDay: (...a: unknown[]) => calendarFindUnique(...a),
}));

import { POST } from '@/app/api/attendance/gate/route';

const TODAY = '2026-10-26'; // Monday

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/attendance/gate', {
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
  vi.useFakeTimers({ toFake: ['Date'] });
  // ✅ 07:30 AM Nairobi is 04:30 AM UTC (Nairobi is UTC+3)
  vi.setSystemTime(new Date('2026-10-26T04:30:00Z'));

  for (const m of [
    authMock,
    userFindUnique,
    studentFindUnique,
    calendarFindUnique,
    attendanceUpsert,
    logAudit,
  ]) {
    m.mockReset();
  }

  studentFindUnique.mockResolvedValue({
    id: 's-1',
    firstName: 'John',
    lastName: 'Doe',
    admissionNumber: 'ADM001',
  });
  calendarFindUnique.mockResolvedValue({ dayType: 'school_day', timetableType: 'normal' });
  attendanceUpsert.mockResolvedValue({
    id: 'att-1',
    studentId: 's-1',
    arrivedAt: new Date(),
    status: 'present',
  });
});

afterEach(() => vi.useRealTimers());

describe('POST /api/attendance/gate (ATT-07)', () => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ studentId: 's-1' })).status).toBe(401);
  });

  it('403 for non-admin/deputy roles', async () => {
    signedInAs('teacher');
    expect((await post({ studentId: 's-1' })).status).toBe(403);
  });

  it('400 for missing studentId', async () => {
    signedInAs('admin');
    expect((await post({})).status).toBe(400);
  });

  it('404 for student not in caller school', async () => {
    signedInAs('admin');
    studentFindUnique.mockResolvedValue(null);
    expect((await post({ studentId: 's-1' })).status).toBe(404);
  });

  it('400 if calendar day is not a school_day', async () => {
    signedInAs('admin');
    calendarFindUnique.mockResolvedValue({ dayType: 'holiday', timetableType: 'none' });
    expect((await post({ studentId: 's-1' })).status).toBe(400);
  });

  it('201 success: ignores client arrivedAt, uses server time, logs audit transactionally', async () => {
    signedInAs('deputy');

    // Client tries to backdate the arrival
    const res = await post({
      studentId: 's-1',
      arrivedAt: '2026-10-25T07:00:00Z', // Should be completely ignored
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain('marked present at');

    // Verify upsert used SERVER time (04:30 UTC), not client time
    expect(attendanceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          arrivedAt: new Date('2026-10-26T04:30:00Z'),
        }),
        update: expect.objectContaining({
          arrivedAt: new Date('2026-10-26T04:30:00Z'),
        }),
      })
    );

    // Verify audit log was called WITH the transaction client (tx)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STUDENT_GATE_ARRIVAL',
        newData: expect.objectContaining({ studentId: 's-1', status: 'present' }),
      }),
      expect.anything() // The tx client
    );
  });
});
