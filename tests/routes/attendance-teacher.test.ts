import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const teacherFindFirst = vi.fn();
const slotFindFirst = vi.fn();
const coverFindFirst = vi.fn();
const qrTokenFindFirst = vi.fn();
const qrTokenUpdate = vi.fn();
const schoolCalendarDayFindUnique = vi.fn();
const attendanceAdd = vi.fn().mockResolvedValue({ id: 'job-1' });
const logAudit = vi.fn();
const isInsideGeofence = vi.fn();
const verifyQrToken = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  // ✅ FIX: Forward all arguments so the tx client is passed to the spy
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));
vi.mock('@/lib/queue', () => ({
  attendanceQueue: { add: (...a: unknown[]) => attendanceAdd(...a) },
}));
vi.mock('@/lib/geofence/check', () => ({ isInsideGeofence: (...a: unknown[]) => isInsideGeofence(...a) }));
vi.mock('@/lib/qr/token', () => ({ verifyQrToken: (...a: unknown[]) => verifyQrToken(...a) }));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'teacher', { get: () => ({ findFirst: (...a: unknown[]) => teacherFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'timetableSlot', { get: () => ({ findFirst: (...a: unknown[]) => slotFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'teacherAttendance', { get: () => ({ findFirst: (...a: unknown[]) => coverFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'classroomQrToken', { get: () => ({ findFirst: (...a: unknown[]) => qrTokenFindFirst(...a), update: (...a: unknown[]) => qrTokenUpdate(...a) }) });
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', { get: () => ({ findUnique: (...a: unknown[]) => schoolCalendarDayFindUnique(...a) }) });
  
  // ✅ FIX: Add the $transaction mock here so the route can use it
  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

import { POST } from '@/app/api/attendance/teacher/route';

const SLOT = '55555555-5555-4555-8555-555555555555';
const TODAY = '2026-10-26'; // Monday

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/attendance/teacher', {
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
  // ✅ 08:05 AM Nairobi is 05:05 AM UTC (Nairobi is UTC+3)
  vi.setSystemTime(new Date('2026-10-26T05:05:00Z')); 
  
  for (const m of [authMock, userFindUnique, teacherFindFirst, slotFindFirst, coverFindFirst, qrTokenFindFirst, qrTokenUpdate, schoolCalendarDayFindUnique, attendanceAdd, logAudit, isInsideGeofence, verifyQrToken]) {
    m.mockReset();
  }
  
  slotFindFirst.mockResolvedValue({
    id: SLOT,
    teacherId: 't-1',
    schoolId: 'school-A',
    dayOfWeek: 1,
    isPublished: true,
    period: { startTime: '08:00', endTime: '08:40' },
    school: { latitude: -1.2921, longitude: 36.8219, geofenceRadius: 100 },
  });
  teacherFindFirst.mockResolvedValue({ id: 't-1', schoolId: 'school-A' });
  verifyQrToken.mockReturnValue({ valid: true, slotId: SLOT });
  qrTokenFindFirst.mockResolvedValue({ id: 'qr-1', usedAt: null });
  schoolCalendarDayFindUnique.mockResolvedValue({ dayType: 'school_day', timetableType: 'normal' });
  isInsideGeofence.mockReturnValue({ isInside: true, distance: 10 });
  attendanceAdd.mockResolvedValue({ id: 'job-1' });
});

afterEach(() => vi.useRealTimers());

describe('POST /api/attendance/teacher (R4-11 / ATT-01,02,03)', () => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(401);
  });

  it('403 deactivated user', async () => {
    signedInAs('teacher', { isActive: false });
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(403);
  });

  it('403 for non-teacher roles', async () => {
    signedInAs('parent');
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(403);
  });

  it('404 for slot not in caller school', async () => {
    signedInAs('teacher');
    slotFindFirst.mockResolvedValue(null);
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(404);
  });

  it('403 for teacher not assigned to slot', async () => {
    signedInAs('teacher');
    teacherFindFirst.mockResolvedValue({ id: 't-other' });
    coverFindFirst.mockResolvedValue(null); // Not a substitute
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(403);
  });

  it('400 if school geofence is not configured', async () => {
    signedInAs('teacher');
    // ✅ Explicitly define the mock return value instead of relying on mock history
    slotFindFirst.mockResolvedValue({
      id: SLOT,
      teacherId: 't-1',
      schoolId: 'school-A',
      dayOfWeek: 1,
      isPublished: true,
      period: { startTime: '08:00', endTime: '08:40' },
      school: { latitude: null, longitude: null, geofenceRadius: null },
    });
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(400);
  });

  it('403 if outside geofence', async () => {
    signedInAs('teacher');
    isInsideGeofence.mockReturnValue({ isInside: false, distance: 500 });
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(403);
  });

  it('410 for invalid or expired QR token', async () => {
    signedInAs('teacher');
    verifyQrToken.mockReturnValue({ valid: false });
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(410);
    
    verifyQrToken.mockReturnValue({ valid: true, slotId: SLOT });
    qrTokenFindFirst.mockResolvedValue(null); // Already used or expired
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(410);
  });

  it('400 if calendar day is not a school_day', async () => {
    signedInAs('teacher');
    schoolCalendarDayFindUnique.mockResolvedValue({ dayType: 'holiday', timetableType: 'none' });
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(400);
  });

  it('425 if checking in too early (before 10 min window)', async () => {
    // ✅ 07:45 AM Nairobi is 04:45 AM UTC
    vi.setSystemTime(new Date('2026-10-26T04:45:00Z')); 
    signedInAs('teacher');
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(425);
  });

  it('410 if checking in after period end', async () => {
    // ✅ 08:45 AM Nairobi is 05:45 AM UTC
    vi.setSystemTime(new Date('2026-10-26T05:45:00Z')); 
    signedInAs('teacher');
    expect((await post({ slotId: SLOT, latitude: 0, longitude: 0, qrToken: 'x' })).status).toBe(410);
  });

  it('202 success: queues job, updates QR token, logs audit', async () => {
    signedInAs('teacher');
    const res = await post({ slotId: SLOT, latitude: -1.2921, longitude: 36.8219, qrToken: 'valid-token', lessonNotes: 'Good lesson' });
    
    expect(res.status).toBe(202);
    expect(qrTokenUpdate).toHaveBeenCalled();
    expect(attendanceAdd).toHaveBeenCalledWith('teacher-check-in', expect.objectContaining({
      payload: expect.objectContaining({ status: 'present', geofencePassed: true })
    }), expect.any(Object));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TEACHER_CHECK_IN_INITIATED' }), expect.anything());
  });
});