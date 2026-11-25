import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const teacherFindFirst = vi.fn();
const assessmentFindFirst = vi.fn();
const txResultFindFirst = vi.fn();
const txResultUpdateMany = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    assessment: { findFirst: (...a: unknown[]) => assessmentFindFirst(...a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        assessmentResult: {
          findFirst: (...a: unknown[]) => txResultFindFirst(...a),
          updateMany: (...a: unknown[]) => txResultUpdateMany(...a),
        },
      }),
  },
}));

import { POST as specialExam } from '@/app/api/assessments/[id]/special-exam/route';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STREAM = U(1);
const S1 = U(11);

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
  status: 'published',
  maxMarks: 50,
  ...over,
});
const body = (over: Record<string, unknown> = {}) => ({
  studentId: S1,
  marksObtained: 32,
  reason: 'Was in hospital on the exam day',
  ...over,
});
const run = (b: unknown = body()) =>
  specialExam(
    new Request('http://x', {
      method: 'POST',
      body: typeof b === 'string' ? b : JSON.stringify(b),
    }) as never,
    { params: { id: 'a-1' } }
  );

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    teacherFindFirst,
    assessmentFindFirst,
    txResultFindFirst,
    txResultUpdateMany,
    logAudit,
  ])
    m.mockReset();
  teacherFindFirst.mockResolvedValue({ id: 't-1', schoolId: 'school-A' });
  assessmentFindFirst.mockResolvedValue(assessment());
  txResultFindFirst.mockResolvedValue({ id: 'res-1' });
  txResultUpdateMany.mockResolvedValue({ count: 1 });
});

describe('POST /api/assessments/[id]/special-exam: who may call it', () => {
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
    expect(txResultUpdateMany).not.toHaveBeenCalled();
  });
  it("404 for an assessment that is not the caller's, looked up by id + school + owner", async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(null);
    expect((await run()).status).toBe(404);
    expect(assessmentFindFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'a-1',
      schoolId: 'school-A',
      teacherId: 't-1',
    });
    expect(txResultUpdateMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/assessments/[id]/special-exam: what it may change', () => {
  it('records the mark for an ABSENT learner, turns it into SCORED, and audits old + new + reason', async () => {
    signedInAs('teacher');
    const res = await run();
    expect(res.status).toBe(200);

    // ONE conditional update: it can only succeed while the result is still 'absent'.
    expect(txResultUpdateMany.mock.calls[0]![0]!).toMatchObject({
      where: { id: 'res-1', schoolId: 'school-A', resultStatus: 'absent' },
      data: { resultStatus: 'scored', marksObtained: 32 },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'ASSESSMENT_SPECIAL_EXAM_RECORDED',
        tableName: 'assessment_results',
        recordId: 'res-1',
        oldData: { resultStatus: 'absent', marksObtained: 0 },
        newData: expect.objectContaining({
          resultStatus: 'scored',
          marksObtained: 32,
          reason: 'Was in hospital on the exam day',
        }),
      }),
      expect.anything() // written inside the same transaction as the change
    );
  });

  it('looks the result up inside the caller\'s school and the assessment\'s class only', async () => {
    signedInAs('teacher');
    await run();
    expect(txResultFindFirst.mock.calls[0]![0]!.where).toMatchObject({
      assessmentId: 'a-1',
      studentId: S1,
      schoolId: 'school-A',
      student: { streamId: STREAM, schoolId: 'school-A', deletedAt: null },
    });
  });

  it('409 and NO audit entry when the learner already has a score: published marks cannot be overwritten', async () => {
    signedInAs('teacher');
    txResultUpdateMany.mockResolvedValue({ count: 0 }); // result is not 'absent' any more
    expect((await run()).status).toBe(409);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('two simultaneous requests: only the one whose conditional update matches wins', async () => {
    signedInAs('teacher');
    txResultUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([run(), run()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(logAudit).toHaveBeenCalledTimes(1); // exactly one audited change
  });

  it('404 when the learner has no result on this assessment or is not in its class', async () => {
    signedInAs('teacher');
    txResultFindFirst.mockResolvedValue(null);
    expect((await run()).status).toBe(404);
    expect(txResultUpdateMany).not.toHaveBeenCalled();
  });

  it('409 for a draft (use the markbook) and 403 for a locked assessment', async () => {
    signedInAs('teacher');
    assessmentFindFirst.mockResolvedValue(assessment({ status: 'draft' }));
    expect((await run()).status).toBe(409);
    assessmentFindFirst.mockResolvedValue(assessment({ status: 'locked' }));
    expect((await run()).status).toBe(403);
    expect(txResultUpdateMany).not.toHaveBeenCalled();
  });

  it('400 above the maximum, negative, or with a missing/too-short reason', async () => {
    signedInAs('teacher');
    expect((await run(body({ marksObtained: 51 }))).status).toBe(400);
    expect((await run(body({ marksObtained: -1 }))).status).toBe(400);
    expect((await run(body({ reason: '' }))).status).toBe(400);
    expect((await run(body({ reason: 'ok' }))).status).toBe(400);
    expect((await run(body({ studentId: 'not-a-uuid' }))).status).toBe(400);
    expect(txResultUpdateMany).not.toHaveBeenCalled();
  });

  it('accepts exactly the maximum and a genuine score of 0', async () => {
    signedInAs('teacher');
    expect((await run(body({ marksObtained: 50 }))).status).toBe(200);
    expect((await run(body({ marksObtained: 0 }))).status).toBe(200);
  });

  it('400 for a body that is not JSON', async () => {
    signedInAs('teacher');
    expect((await run('{nope')).status).toBe(400);
  });
});
