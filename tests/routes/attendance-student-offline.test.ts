import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const teacherFindFirst = vi.fn();
const slotFindFirst = vi.fn();
const teacherAttendanceFindFirst = vi.fn();
const lessonAttFindMany = vi.fn();
const lessonAttUpsert = vi.fn();
const lessonRegisterFindUnique = vi.fn();
const lessonRegisterUpsert = vi.fn();
const schoolCalendarDayFindUnique = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (...args: unknown[]) => logAudit(...args),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findUnique: (...a: unknown[]) => userFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'teacher', { get: () => ({ findFirst: (...a: unknown[]) => teacherFindFirst(...a) }) });
  Object.defineProperty(mockPrisma, 'timetableSlot', { get: () => ({ findFirst: (...a: unknown[]) => slotFindFirst(...a) }) });
  
  Object.defineProperty(mockPrisma, 'teacherAttendance', { 
    get: () => ({ findFirst: (...a: unknown[]) => teacherAttendanceFindFirst(...a) }) 
  });
  
  Object.defineProperty(mockPrisma, 'lessonRegister', { 
    get: () => ({ 
      findUnique: (...a: unknown[]) => lessonRegisterFindUnique(...a),
      upsert: (...a: unknown[]) => lessonRegisterUpsert(...a)
    }) 
  });
  
  Object.defineProperty(mockPrisma, 'studentLessonAttendance', { 
    get: () => ({ 
      upsert: (...a: unknown[]) => lessonAttUpsert(...a),
      findMany: (...a: unknown[]) => lessonAttFindMany(...a)
    }) 
  });
  
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', { get: () => ({ findUnique: (...a: unknown[]) => schoolCalendarDayFindUnique(...a) }) });
  
  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

import { POST } from '@/app/api/attendance/student/route';

const SLOT = '55555555-5555-4555-8555-555555555555';
const TODAY = '2026-10-26';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://x/api/attendance/student', {
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
  for (const m of [
    authMock, userFindUnique, teacherFindFirst, slotFindFirst, 
    teacherAttendanceFindFirst, lessonAttFindMany, lessonRegisterFindUnique, 
    lessonRegisterUpsert, lessonAttUpsert, schoolCalendarDayFindUnique, logAudit
  ]) {
    m.mockReset();
  }
  
  teacherFindFirst.mockResolvedValue({ id: 't-1', schoolId: 'school-A' });
  
  slotFindFirst.mockResolvedValue({ 
    id: SLOT, 
    schoolId: 'school-A', 
    isPublished: true, 
    dayOfWeek: 1, 
    teacherId: 't-1',
    stream: {
      students: [{ id: 's-1' }]
    }
  });
  
  teacherAttendanceFindFirst.mockResolvedValue(null);
  schoolCalendarDayFindUnique.mockResolvedValue({ dayType: 'school_day', timetableType: 'normal' });
  lessonRegisterFindUnique.mockResolvedValue(null);
  lessonRegisterUpsert.mockResolvedValue({ id: 'reg-1', isLocked: true });
  lessonAttUpsert.mockResolvedValue({ id: 'att-1' });
  lessonAttFindMany.mockResolvedValue([]);
});

describe('POST /api/attendance/student (ATT-11 Offline Idempotency)', () => {
  it('423 Locked: rejects sync if register is already locked', async () => {
    signedInAs('teacher');
    lessonRegisterFindUnique.mockResolvedValue({ id: 'reg-1', isLocked: true });
    
    const res = await post(
      {
        slotId: SLOT,
        date: TODAY,
        entries: [{ studentId: 's-1', status: 'present' }],
        markedBy: 't-1',
      },
      { 'Idempotency-Key': 'op-123-uuid' }
    );
    
    expect(res.status).toBe(423);
    const json = await res.json();
    expect(json.error).toContain('locked');
    expect(lessonAttUpsert).not.toHaveBeenCalled();
  });

  it('200 Success: accepts valid payload with Idempotency-Key', async () => {
    signedInAs('teacher');
    
    const res = await post(
      {
        slotId: SLOT,
        date: TODAY,
        entries: [{ studentId: 's-1', status: 'present' }],
        markedBy: 't-1',
      },
      { 'Idempotency-Key': 'op-123-uuid' }
    );
    
    // ✅ FIX: Route returns 200 on success, not 202
    expect(res.status).toBe(200);
    expect(lessonAttUpsert).toHaveBeenCalled();
  });
});