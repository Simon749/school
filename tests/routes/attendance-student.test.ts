import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const studentAttUpsert = vi.fn();
const lessonRegisterUpsert = vi.fn();
const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const teacherFindFirst = vi.fn();
const slotFindFirst = vi.fn();
const coverFindFirst = vi.fn();
const registerFindUnique = vi.fn();
const lessonAttFindMany = vi.fn();
const attendanceAdd = vi.fn();
const notifAdd = vi.fn().mockResolvedValue({ id: 'notif-job-1' });
const notifRemove = vi.fn().mockResolvedValue(undefined);
const logAudit = vi.fn();
const schoolCalendarDayFindUnique = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({
  logAudit: (e: unknown) => logAudit(e),
  getRequestMetadata: () => ({ ipAddress: '1.2.3.4', userAgent: 'test' }),
}));
vi.mock('@/lib/queue', () => ({
  attendanceQueue: { add: (...a: unknown[]) => attendanceAdd(...a) },
  notificationQueue: {
    add: (...a: unknown[]) => notifAdd(...a),
    remove: (...a: unknown[]) => notifRemove(...a),
  },
}));

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};

  // Use lazy getters so functions resolve AFTER variable initialization
  Object.defineProperty(mockPrisma, 'user', {
    get: () => ({
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    }),
  });
  Object.defineProperty(mockPrisma, 'teacher', {
    get: () => ({ findFirst: (...a: unknown[]) => teacherFindFirst(...a) }),
  });
  Object.defineProperty(mockPrisma, 'timetableSlot', {
    get: () => ({ findFirst: (...a: unknown[]) => slotFindFirst(...a) }),
  });
  Object.defineProperty(mockPrisma, 'teacherAttendance', {
    get: () => ({ findFirst: (...a: unknown[]) => coverFindFirst(...a) }),
  });
  Object.defineProperty(mockPrisma, 'studentLessonAttendance', {
    get: () => ({
      findMany: (...a: unknown[]) => lessonAttFindMany(...a),
      upsert: (...a: unknown[]) => studentAttUpsert(...a),
    }),
  });
  Object.defineProperty(mockPrisma, 'lessonRegister', {
    get: () => ({
      findUnique: (...a: unknown[]) => registerFindUnique(...a),
      upsert: (...a: unknown[]) => lessonRegisterUpsert(...a),
    }),
  });
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', {
    get: () => ({ findUnique: (...a: unknown[]) => schoolCalendarDayFindUnique(...a) }),
  });

  mockPrisma.$transaction = async (cb: any) => {
    return cb(mockPrisma);
  };

  return { prisma: mockPrisma };
});

import { GET, POST } from '@/app/api/attendance/student/route';

const SLOT = '55555555-5555-4555-8555-555555555555';
const TODAY = '2026-10-26'; // a Monday

const get = (qs: string) => GET(new Request(`http://x/api/attendance/student?${qs}`) as never);
const post = (body: unknown) =>
  POST(
    new Request('http://x/api/attendance/student', {
      method: 'POST',
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

const students = [
  { id: 's1', firstName: 'Amara', lastName: 'O', medicalNotes: 'asthma', nemisNumber: 'N1' },
  { id: 's2', firstName: 'Baraka', lastName: 'K', medicalNotes: null, nemisNumber: 'N2' },
];
const slot = () => ({
  id: SLOT,
  teacherId: 't-1',
  dayOfWeek: 1,
  learningArea: { name: 'Mathematics' },
  period: {
    name: 'Period 1',
    startTime: new Date('1970-01-01T08:00:00Z'),
    endTime: new Date('1970-01-01T08:40:00Z'),
  },
  stream: { id: 'st-1', name: 'A', grade: { name: 'Grade 7' }, students },
});

const validBody = (over: Record<string, unknown> = {}) => ({
  slotId: SLOT,
  date: TODAY,
  entries: [
    { studentId: 's1', status: 'present' },
    { studentId: 's2', status: 'absent', absenceReason: 'sick' },
  ],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T08:00:00Z'));
  for (const m of [
    authMock,
    userFindUnique,
    userFindFirst,
    teacherFindFirst,
    slotFindFirst,
    coverFindFirst,
    registerFindUnique,
    lessonAttFindMany,
    attendanceAdd,
    notifAdd,
    notifRemove,
    logAudit,
    schoolCalendarDayFindUnique,
  ])
    m.mockReset();
  slotFindFirst.mockResolvedValue(slot());
  teacherFindFirst.mockResolvedValue({ id: 't-1' });
  coverFindFirst.mockResolvedValue(null);
  registerFindUnique.mockResolvedValue(null);
  lessonAttFindMany.mockResolvedValue([]);
  attendanceAdd.mockResolvedValue({ id: 'job-1' });
  notifAdd.mockResolvedValue({ id: 'notif-job-1' });
  notifRemove.mockResolvedValue(undefined);
  userFindFirst.mockResolvedValue({ id: 'parent-1' });
  schoolCalendarDayFindUnique.mockResolvedValue({
    id: 'cal-1',
    date: new Date('2026-10-26T00:00:00.000Z'),
    dayType: 'school_day',
    timetableType: 'normal',
  });
  studentAttUpsert.mockResolvedValue({ id: 'att-1' });
  lessonRegisterUpsert.mockResolvedValue({ id: 'reg-1', isLocked: false });
});
afterEach(() => vi.useRealTimers());

const nothingQueued = () => {
  expect(attendanceAdd).not.toHaveBeenCalled();
  expect(notifAdd).not.toHaveBeenCalled();
  expect(logAudit).not.toHaveBeenCalled();
};

describe.each([
  ['GET', () => get(`slotId=${SLOT}&date=${TODAY}`)],
  ['POST', () => post(validBody())],
] as const)('%s /api/attendance/student: who may use it (SEC-07)', (_m, run) => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
    expect(slotFindFirst).not.toHaveBeenCalled();
  });

  it('403 deactivated user (SEC-21)', async () => {
    signedInAs('teacher', { isActive: false });
    expect((await run()).status).toBe(403);
    expect(slotFindFirst).not.toHaveBeenCalled();
  });

  it.each(['parent', 'bursar', 'deputy', 'it_admin'])(
    '403 for role %s (a parent could submit a register before)',
    async (role) => {
      signedInAs(role);
      expect((await run()).status).toBe(403);
      expect(slotFindFirst).not.toHaveBeenCalled();
      nothingQueued();
    }
  );

  it("looks the slot up inside the caller's school", async () => {
    signedInAs('admin');
    await run();
    expect(slotFindFirst.mock.calls[0]![0]!.where).toEqual({ id: SLOT, schoolId: 'school-A' });
  });

  it("404 for a slot that is not in the caller's school", async () => {
    signedInAs('admin');
    slotFindFirst.mockResolvedValue(null);
    expect((await run()).status).toBe(404);
    nothingQueued();
  });

  it('a teacher who does not own the lesson (and is not its substitute) gets 403', async () => {
    signedInAs('teacher');
    teacherFindFirst.mockResolvedValue({ id: 't-other' });
    expect((await run()).status).toBe(403);
    nothingQueued();
  });

  it('a user with role teacher but no teacher record gets 403', async () => {
    signedInAs('teacher');
    teacherFindFirst.mockResolvedValue(null);
    expect((await run()).status).toBe(403);
    nothingQueued();
  });

  it("the lesson's own teacher is allowed", async () => {
    signedInAs('teacher');
    expect((await run()).status).toBeLessThan(300);
    expect(teacherFindFirst.mock.calls[0]![0]!.where).toMatchObject({
      userId: 'u-1',
      schoolId: 'school-A',
    });
  });

  it('a recorded substitute for TODAY is allowed', async () => {
    signedInAs('teacher');
    teacherFindFirst.mockResolvedValue({ id: 't-sub' });
    coverFindFirst.mockResolvedValue({ id: 'cover-1' });
    expect((await run()).status).toBeLessThan(300);
    expect(coverFindFirst.mock.calls[0]![0]!.where).toMatchObject({
      slotId: SLOT,
      substituteTeacherId: 't-sub',
      status: 'covered',
    });
  });

  it('admin is allowed for any slot in their school', async () => {
    signedInAs('admin');
    expect((await run()).status).toBeLessThan(300);
    expect(teacherFindFirst).not.toHaveBeenCalled();
  });
});

describe('GET: what the response contains', () => {
  it('never returns whole student rows (no medicalNotes / NEMIS), only what the register needs', async () => {
    signedInAs('teacher');
    const res = await get(`slotId=${SLOT}&date=${TODAY}`);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('medicalNotes');
    expect(text).not.toContain('asthma');
    expect(text).not.toContain('nemisNumber');
    expect(text).toContain('Amara');
  });

  it('keeps the shape the page uses', async () => {
    signedInAs('teacher');
    const body = await (await get(`slotId=${SLOT}&date=${TODAY}`)).json();
    expect(body.slot.learningArea.name).toBe('Mathematics');
    expect(body.slot.stream.grade.name).toBe('Grade 7');
    expect(body.slot.stream.name).toBe('A');
    expect(body.slot.period.name).toBe('Period 1');
    expect(body.register).toHaveLength(2);
    expect(body.isLocked).toBe(false);
  });

  it('400 for a bad or wrong-weekday date, and for a missing slotId', async () => {
    signedInAs('teacher');
    expect((await get(`slotId=${SLOT}&date=garbage`)).status).toBe(400);
    expect((await get(`slotId=${SLOT}&date=2026-10-27`)).status).toBe(400);
    expect((await get(`date=${TODAY}`)).status).toBe(400);
  });
});

describe('POST: validation and behaviour', () => {
  it('400 for malformed JSON', async () => {
    signedInAs('teacher');
    expect((await post('{nope')).status).toBe(400);
    nothingQueued();
  });

  it.each([
    ['no entries', { entries: [] }],
    ['entries not an array', { entries: 'x' }],
    ['unknown status', { entries: [{ studentId: 's1', status: 'teleported' }] }],
    [
      'duplicate student',
      {
        entries: [
          { studentId: 's1', status: 'present' },
          { studentId: 's1', status: 'absent' },
        ],
      },
    ],
    ['student not in this class', { entries: [{ studentId: 's999', status: 'present' }] }],
    ['garbage date', { date: 'not-a-date' }],
    ['wrong weekday', { date: '2026-10-27' }],
    ['future date', { date: '2026-11-02' }],
  ])('400 for %s', async (_name, over) => {
    signedInAs('teacher');
    expect((await post(validBody(over))).status).toBe(400);
    nothingQueued();
  });

  it('asks for confirmation when more than 80% are marked absent (unchanged behaviour)', async () => {
    signedInAs('teacher');
    const res = await post(
      validBody({
        entries: [
          { studentId: 's1', status: 'absent' },
          { studentId: 's2', status: 'absent' },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).requiresConfirmation).toBe(true);
    nothingQueued();
  });

  it('a locked register is 423 for a teacher, but an admin may override', async () => {
    registerFindUnique.mockResolvedValue({ isLocked: true });
    signedInAs('teacher');
    expect((await post(validBody())).status).toBe(423);
    nothingQueued();
    signedInAs('admin');
    expect((await post(validBody())).status).toBe(200);
  });

  it('saves the register to the DB and queues notifications for absences', async () => {
    signedInAs('teacher');
    const res = await post(validBody());
    expect(res.status).toBe(200);

    expect(studentAttUpsert).toHaveBeenCalledTimes(2);
    expect(notifAdd).toHaveBeenCalledTimes(1);

    const notifPayload = notifAdd.mock.calls[0]![1]!;
    const notifOptions = notifAdd.mock.calls[0]![2]!;

    expect(notifPayload.data.studentId).toBe('s2');
    expect(notifOptions.delay).toBe(15 * 60 * 1000);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'ATTENDANCE_REGISTER_SUBMITTED',
      })
    );
  });

  it('cancels the notification job if a student is corrected from absent to present', async () => {
    signedInAs('teacher');
    lessonAttFindMany.mockResolvedValue([
      { studentId: 's2', status: 'absent', notificationJobId: 'job-123' },
    ]);

    const correctedBody = {
      slotId: SLOT,
      date: TODAY,
      entries: [
        { studentId: 's1', status: 'present' },
        { studentId: 's2', status: 'present' },
      ],
    };

    const res = await post(correctedBody);
    expect(res.status).toBe(200);
    expect(notifRemove).toHaveBeenCalledWith('job-123');
  });

  it('only alerts ACTIVE guardians whose account is active (not deactivated ones)', async () => {
    signedInAs('teacher');
    await post(validBody());
    const where = userFindFirst.mock.calls[0]![0]!.where;
    expect(where).toMatchObject({ isActive: true, deletedAt: null });
    expect(where.guardians.some).toMatchObject({
      studentId: 's2',
      isPrimary: true,
      isActive: true,
    });
  });
});
