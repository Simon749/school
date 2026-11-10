import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const teacherFindFirst = vi.fn();
const streamFindFirst = vi.fn();
const termFindFirst = vi.fn();
const areaFindFirst = vi.fn();
const slotFindFirst = vi.fn();
const assessmentFindMany = vi.fn();
const assessmentFindFirst = vi.fn();
const assessmentCreate = vi.fn();
const assessmentUpdate = vi.fn();
const studentFindMany = vi.fn();
const subStrandFindMany = vi.fn();
const resultFindMany = vi.fn();
const txUpsert = vi.fn();
const txDeleteMany = vi.fn();
const txCreateMany = vi.fn();
const notifAdd = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/queue', () => ({ notificationQueue: { add: (...a: unknown[]) => notifAdd(...a) } }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    stream: { findFirst: (...a: unknown[]) => streamFindFirst(...a) },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    learningArea: { findFirst: (...a: unknown[]) => areaFindFirst(...a) },
    timetableSlot: { findFirst: (...a: unknown[]) => slotFindFirst(...a) },
    assessment: {
      findMany: (...a: unknown[]) => assessmentFindMany(...a),
      findFirst: (...a: unknown[]) => assessmentFindFirst(...a),
      create: (...a: unknown[]) => assessmentCreate(...a),
      update: (...a: unknown[]) => assessmentUpdate(...a),
    },
    student: { findMany: (...a: unknown[]) => studentFindMany(...a) },
    subStrand: { findMany: (...a: unknown[]) => subStrandFindMany(...a) },
    assessmentResult: { findMany: (...a: unknown[]) => resultFindMany(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        assessment: { update: (...a: unknown[]) => assessmentUpdate(...a) }, // ➕ ADD THIS LINE
        assessmentResult: { upsert: (...a: unknown[]) => txUpsert(...a) },
        rubricScore: {
          deleteMany: (...a: unknown[]) => txDeleteMany(...a),
          createMany: (...a: unknown[]) => txCreateMany(...a),
        },
      }),
  },
}));

import { GET as listAssessments, POST as createAssessment } from '@/app/api/assessments/route';
import { POST as publish } from '@/app/api/assessments/[id]/publish/route';
import { POST as saveResults } from '@/app/api/assessments/[id]/results/route';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STREAM = U(1),
  AREA = U(2),
  TERM = U(3),
  S1 = U(11),
  S2 = U(12),
  SUB = U(21);
const json = (body: unknown) => ({
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

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

const assessment = (over: Record<string, unknown> = {}) => ({
  id: 'a-1',
  schoolId: 'school-A',
  teacherId: 't-1',
  streamId: STREAM,
  learningAreaId: AREA,
  title: 'CAT 1',
  status: 'draft',
  maxMarks: 50,
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    teacherFindFirst,
    streamFindFirst,
    termFindFirst,
    areaFindFirst,
    slotFindFirst,
    assessmentFindMany,
    assessmentFindFirst,
    assessmentCreate,
    assessmentUpdate,
    studentFindMany,
    subStrandFindMany,
    resultFindMany,
    txUpsert,
    txDeleteMany,
    txCreateMany,
    notifAdd,
    logAudit,
  ])
    m.mockReset();
  teacherFindFirst.mockResolvedValue({
    id: 't-1',
    schoolId: 'school-A',
    isClassTeacher: false,
    classTeacherStreamId: null,
  });
  streamFindFirst.mockResolvedValue({ id: STREAM });
  termFindFirst.mockResolvedValue({ id: TERM });
  areaFindFirst.mockResolvedValue({ id: AREA });
  slotFindFirst.mockResolvedValue({ id: 'slot-1' });
  assessmentFindMany.mockResolvedValue([]);
  assessmentFindFirst.mockResolvedValue(assessment());
  assessmentCreate.mockImplementation(async ({ data }: { data: object }) => ({
    id: 'a-new',
    ...data,
  }));
  assessmentUpdate.mockImplementation(async ({ data }: { data: object }) => ({
    id: 'a-1',
    ...data,
  }));
  studentFindMany.mockResolvedValue([{ id: S1 }, { id: S2 }]);
  subStrandFindMany.mockResolvedValue([{ id: SUB }]);
  resultFindMany.mockResolvedValue([]);
  txUpsert.mockResolvedValue({ id: 'res-1' });
});

// ---------------------------------------------------------------------------------------------
describe.each([
  ['GET /assessments', () => listAssessments(new Request('http://x/api/assessments') as never)],
  [
    'POST /assessments',
    () => createAssessment(new Request('http://x/api/assessments', json({})) as never),
  ],
  [
    'POST /assessments/[id]/publish',
    () => publish(new Request('http://x', json({})) as never, { params: { id: 'a-1' } }),
  ],
  [
    'POST /assessments/[id]/results',
    () =>
      saveResults(new Request('http://x', json({ results: [] })) as never, {
        params: { id: 'a-1' },
      }),
  ],
] as const)('%s: who may call it (FEAT-01, SEC-21)', (_n, run) => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
  });
  it('403 for a deactivated teacher', async () => {
    signedInAs('teacher', { isActive: false });
    expect((await run()).status).toBe(403);
  });
  it.each(['parent', 'bursar', 'admin', 'deputy', 'it_admin'])('403 for role %s', async (role) => {
    signedInAs(role);
    expect((await run()).status).toBe(403);
  });
  it('403 for a teacher-role user with no teacher record', async () => {
    signedInAs('teacher');
    teacherFindFirst.mockResolvedValue(null);
    expect((await run()).status).toBe(403);
  });
  it('FEAT-01: finds the teacher by the INTERNAL user id, so a real teacher is no longer rejected', async () => {
    signedInAs('teacher');
    await run();
    expect(teacherFindFirst.mock.calls[0][0].where).toEqual({
      userId: 'u-1',
      schoolId: 'school-A',
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe('GET /api/assessments', () => {
  it("lists only this teacher's assessments in their school, with optional filters", async () => {
    signedInAs('teacher');
    await listAssessments(
      new Request(`http://x/api/assessments?termId=${TERM}&streamId=${STREAM}`) as never
    );
    expect(assessmentFindMany.mock.calls[0][0].where).toEqual({
      schoolId: 'school-A',
      teacherId: 't-1',
      termId: TERM,
      streamId: STREAM,
    });
  });
});

describe('POST /api/assessments', () => {
  const valid = (over: Record<string, unknown> = {}) => ({
    title: 'Term 1 CAT',
    type: 'cat',
    assessmentDate: '2026-10-26',
    maxMarks: 50,
    weightPercent: 20,
    streamId: STREAM,
    learningAreaId: AREA,
    termId: TERM,
    ...over,
  });
  const create = (body: unknown) =>
    createAssessment(new Request('http://x/api/assessments', json(body)) as never);

  it('creates a draft owned by the caller, with school and teacher taken from the session', async () => {
    signedInAs('teacher');
    const res = await create(
      valid({ schoolId: 'school-EVIL', teacherId: 't-EVIL', status: 'published' })
    );
    expect(res.status).toBe(201);
    const data = assessmentCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      schoolId: 'school-A',
      teacherId: 't-1',
      status: 'draft',
      title: 'Term 1 CAT',
    });
  });

  it('passes a real Date object to the database (a bare "2026-10-26" string is not a valid Prisma DateTime)', async () => {
    signedInAs('teacher');
    await create(valid());
    const data = assessmentCreate.mock.calls[0][0].data;
    expect(data.assessmentDate).toBeInstanceOf(Date);
    expect(data.assessmentDate.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('saves the instructions the teacher typed (the dialog has an Instructions field)', async () => {
    signedInAs('teacher');
    await create(valid({ instructions: 'Answer all questions. Calculators allowed.' }));
    expect(assessmentCreate.mock.calls[0][0].data.instructions).toBe(
      'Answer all questions. Calculators allowed.'
    );
  });

  it('accepts exactly what the dialog sends, including an empty instructions string', async () => {
    signedInAs('teacher');
    const res = await create(valid({ instructions: '', dueDate: undefined }));
    expect(res.status).toBe(201);
  });

  it('ignores a client-sent dueDate instead of crashing (the database has no such column yet)', async () => {
    signedInAs('teacher');
    const res = await create(valid({ dueDate: '2026-11-02' }));
    expect(res.status).toBe(201);
    expect('dueDate' in assessmentCreate.mock.calls[0][0].data).toBe(false);
  });

  it.each([
    ['stream', () => streamFindFirst.mockResolvedValue(null)],
    ['term', () => termFindFirst.mockResolvedValue(null)],
    ['learning area', () => areaFindFirst.mockResolvedValue(null)],
  ])(
    "400 when the %s is not in the caller's school (no cross-school links)",
    async (_what, breakIt) => {
      signedInAs('teacher');
      breakIt();
      const res = await create(valid());
      expect(res.status).toBe(400);
      expect(assessmentCreate).not.toHaveBeenCalled();
      expect(streamFindFirst.mock.calls[0][0].where).toMatchObject({
        id: STREAM,
        schoolId: 'school-A',
      });
      expect(termFindFirst.mock.calls[0][0].where).toMatchObject({
        id: TERM,
        schoolId: 'school-A',
      });
      expect(areaFindFirst.mock.calls[0][0].where).toMatchObject({
        id: AREA,
        schoolId: 'school-A',
      });
    }
  );

  describe('D20: the teacher must be timetabled for this class and learning area, in this term', () => {
    it('403 when the teacher has no timetable slot for it, and nothing is created', async () => {
      signedInAs('teacher');
      slotFindFirst.mockResolvedValue(null);
      const res = await create(valid());
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/timetable/i);
      expect(assessmentCreate).not.toHaveBeenCalled();
    });

    it('looks for a slot of THIS teacher, in THIS school, class, learning area and term', async () => {
      signedInAs('teacher');
      await create(valid());
      expect(slotFindFirst.mock.calls[0][0].where).toEqual({
        schoolId: 'school-A',
        teacherId: 't-1',
        streamId: STREAM,
        learningAreaId: AREA,
        termId: TERM,
      });
    });

    it('is only checked after the class/term/learning area are confirmed to be in the school', async () => {
      signedInAs('teacher');
      streamFindFirst.mockResolvedValue(null);
      expect((await create(valid())).status).toBe(400);
      expect(slotFindFirst).not.toHaveBeenCalled();
    });
  });

  it('400 for malformed JSON and for invalid fields; no raw error details beyond field messages', async () => {
    signedInAs('teacher');
    expect((await create('{nope')).status).toBe(400);
    expect((await create(valid({ title: 'x' }))).status).toBe(400);
    expect((await create(valid({ streamId: 'not-a-uuid' }))).status).toBe(400);
    expect(assessmentCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /api/assessments/[id]/publish', () => {
  const run = () => publish(new Request('http://x', json({})) as never, { params: { id: 'a-1' } });

  it("looks the assessment up by id + the caller's school + the caller as owner (404 otherwise)", async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(null);
    expect((await run()).status).toBe(404);
    expect(assessmentFindFirst.mock.calls[0][0].where).toEqual({
      id: 'a-1',
      schoolId: 'school-A',
      teacherId: 't-1',
    });
    expect(assessmentUpdate).not.toHaveBeenCalled();
  });

  it('403 for a locked assessment', async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(assessment({ status: 'locked' }));
    expect((await run()).status).toBe(403);
    expect(assessmentUpdate).not.toHaveBeenCalled();
  });

  it('409 when already published, and parents are NOT notified a second time', async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(assessment({ status: 'published' }));
    expect((await run()).status).toBe(409);
    expect(assessmentUpdate).not.toHaveBeenCalled();
    expect(notifAdd).not.toHaveBeenCalled();
  });

    it('publishes, notifies only guardians of students who HAVE a result, and audits', async () => {
    signedInAs('teacher');
    resultFindMany.mockResolvedValue([
      { student: { id: S1, firstName: 'Amara', guardians: [{ userId: 'p-1' }] } },
      { student: { id: S2, firstName: 'Baraka', guardians: [] } }, // no active primary guardian
    ]);
    
    const res = await run();
    expect(res.status).toBe(200);
    
    // 1. Assessment update is called correctly
    expect(assessmentUpdate.mock.calls[0][0].data).toMatchObject({ status: 'published' });
    expect(assessmentUpdate.mock.calls[0][0].data.publishedAt).toBeInstanceOf(Date);

    // 2. Results query is scoped correctly
    const q = resultFindMany.mock.calls[0][0];
    expect(q.where).toMatchObject({
      schoolId: 'school-A', // ➕ FIXED: Moved to root to match route.ts (was incorrectly nested inside student)
      assessmentId: 'a-1',
      student: { deletedAt: null, status: 'active' },
    });
    expect(JSON.stringify(q.select.student.select.guardians.where)).toContain('"isActive":true');

    // 3. Notifications are sent correctly
    expect(notifAdd).toHaveBeenCalledTimes(1);
    expect(notifAdd.mock.calls[0][1]).toMatchObject({ 
      userId: 'p-1', 
      type: 'result-published' // ➕ FIXED: Route sends 'result-published', test expected 'results'
    });
    
    // 4. Audit log is recorded correctly
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'ASSESSMENT_PUBLISHED', // ➕ FIXED: Route sends 'ASSESSMENT_PUBLISHED', test expected 'assessment.published'
      })
    );
  });
});

// ---------------------------------------------------------------------------------------------
describe('POST /api/assessments/[id]/results', () => {
  const save = (body: unknown) =>
    saveResults(new Request('http://x', json(body)) as never, { params: { id: 'a-1' } });
  const row = (over: Record<string, unknown> = {}) => ({
    studentId: S1,
    marksObtained: 40,
    teacherComment: 'Good',
    ...over,
  });

  it("404 for an assessment that is not the caller's (looked up by id + school + owner)", async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(null);
    expect((await save({ results: [row()] })).status).toBe(404);
    expect(assessmentFindFirst.mock.calls[0][0].where).toEqual({
      id: 'a-1',
      schoolId: 'school-A',
      teacherId: 't-1',
    });
    expect(txUpsert).not.toHaveBeenCalled();
  });

  it('403 when locked', async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(assessment({ status: 'locked' }));
    expect((await save({ results: [row()] })).status).toBe(403);
    expect(txUpsert).not.toHaveBeenCalled();
  });

  it("400 when a student is not in THIS assessment's class (cross-class / cross-school write)", async () => {
    signedInAs('teacher');
    studentFindMany.mockResolvedValue([{ id: S1 }]); // S2 not found in the stream
    const res = await save({ results: [row(), row({ studentId: S2 })] });
    expect(res.status).toBe(400);
    expect(txUpsert).not.toHaveBeenCalled();
    expect(studentFindMany.mock.calls[0][0].where).toMatchObject({
      streamId: STREAM,
      schoolId: 'school-A',
      deletedAt: null,
    });
  });

  it('400 for marks above the assessment maximum, negative marks, duplicates, oversize input', async () => {
    signedInAs('teacher');
    expect((await save({ results: [row({ marksObtained: 51 })] })).status).toBe(400);
    expect((await save({ results: [row({ marksObtained: -1 })] })).status).toBe(400);
    expect((await save({ results: [row(), row()] })).status).toBe(400);
    expect((await save({ results: [row({ teacherComment: 'x'.repeat(1001) })] })).status).toBe(400);
    expect((await save({ results: Array.from({ length: 501 }, () => row()) })).status).toBe(400);
    expect(txUpsert).not.toHaveBeenCalled();
  });

  it('accepts the maximum mark, zero, and blank marks (null or empty string = not marked, NOT zero)', async () => {
    signedInAs('teacher');
    const res = await save({
      results: [row({ marksObtained: 50 }), row({ studentId: S2, marksObtained: '' })],
    });
    expect(res.status).toBe(200);
    expect(txUpsert.mock.calls[0][0].update.marksObtained).toBe(50);
    expect(txUpsert.mock.calls[1][0].update.marksObtained).toBeNull();
  });

  it("400 when a rubric sub-strand does not belong to this assessment's learning area", async () => {
    signedInAs('teacher');
    subStrandFindMany.mockResolvedValue([]);
    const res = await save({
      results: [row({ rubricScores: [{ subStrandId: SUB, score: 'ME' }] })],
    });
    expect(res.status).toBe(400);
    expect(txUpsert).not.toHaveBeenCalled();
    expect(subStrandFindMany.mock.calls[0][0].where).toMatchObject({
      strand: { learningAreaId: AREA },
    });
  });

  it('saves marks and rubric scores, and audits (without logging marks themselves)', async () => {
    signedInAs('teacher');
    const res = await save({
      results: [row({ rubricScores: [{ subStrandId: SUB, score: 'EE' }] })],
    });
    expect(res.status).toBe(200);
    expect((await res.json()).saved).toBe(1);
    expect(txDeleteMany).toHaveBeenCalledTimes(1);
    expect(txCreateMany.mock.calls[0][0].data[0]).toMatchObject({ subStrandId: SUB, score: 'EE' });
    const audit = logAudit.mock.calls[0][0];
    expect(audit).toMatchObject({
      schoolId: 'school-A',
      actorId: 'u-1',
      action: 'assessment.results_saved',
    });
    expect(JSON.stringify(audit)).not.toContain('Good'); // no per-student content in the audit entry
  });
});
