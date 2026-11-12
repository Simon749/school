import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const teacherFindFirst = vi.fn();
const termFindFirst = vi.fn();
const studentFindFirst = vi.fn();
const reportFindUnique = vi.fn();
const reportUpsert = vi.fn();
const attendanceCount = vi.fn();
const assessmentFindMany = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    student: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    termReport: {
      findUnique: (...a: unknown[]) => reportFindUnique(...a),
      upsert: (...a: unknown[]) => reportUpsert(...a),
    },
    studentLessonAttendance: { count: (...a: unknown[]) => attendanceCount(...a) },
    assessment: { findMany: (...a: unknown[]) => assessmentFindMany(...a) },
  },
}));

import { POST } from '@/app/api/results/reports/generate/route';

const STUDENT = '11111111-1111-4111-8111-111111111111';
const TERM = '22222222-2222-4222-8222-222222222222';

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/results/reports/generate', {
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

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    teacherFindFirst,
    termFindFirst,
    studentFindFirst,
    reportFindUnique,
    reportUpsert,
    attendanceCount,
    assessmentFindMany,
    logAudit,
  ])
    m.mockReset();
  termFindFirst.mockResolvedValue({
    id: TERM,
    startDate: new Date('2026-01-05'),
    endDate: new Date('2026-04-03'),
  });
  studentFindFirst.mockResolvedValue({ streamId: 'stream-7A', schoolId: 'school-A' });
  reportFindUnique.mockResolvedValue(null);
  reportUpsert.mockResolvedValue({ id: 'r-1' });
  attendanceCount.mockResolvedValue(0);
  assessmentFindMany.mockResolvedValue([]);
});

const noWrite = () => expect(reportUpsert).not.toHaveBeenCalled();

describe('POST /api/results/reports/generate (SEC-26)', () => {
  it('401 when anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(401);
    noWrite();
  });

  it('403 for a deactivated user (SEC-21)', async () => {
    signedInAs('admin', { isActive: false });
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(403);
    noWrite();
  });

  it.each(['parent', 'bursar', 'it_admin'])('403 for role %s', async (role) => {
    signedInAs(role);
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(403);
    noWrite();
  });

  it('400 for malformed JSON and for invalid fields (no 500)', async () => {
    signedInAs('admin');
    expect((await post('{not json')).status).toBe(400);
    expect((await post({ studentId: 'nope', termId: TERM })).status).toBe(400);
    noWrite();
  });

  it("finds the term and the student INSIDE the caller's school", async () => {
    signedInAs('admin');
    await post({ studentId: STUDENT, termId: TERM });
    expect(termFindFirst.mock.calls[0]![0]!.where).toMatchObject({ id: TERM, schoolId: 'school-A' });
    expect(studentFindFirst.mock.calls[0]![0]!.where).toMatchObject({
      id: STUDENT,
      schoolId: 'school-A',
      deletedAt: null,
    });
  });

  it('404 when the student (or term) belongs to another school', async () => {
    signedInAs('admin');
    studentFindFirst.mockResolvedValue(null);
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(404);
    noWrite();
    termFindFirst.mockResolvedValue(null);
    studentFindFirst.mockResolvedValue({ streamId: 's', schoolId: 'school-A' });
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(404);
    noWrite();
  });

  describe('class teachers', () => {
    it('may generate for a student in THEIR class stream', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({
        isClassTeacher: true,
        classTeacherStreamId: 'stream-7A',
      });
      const res = await post({
        studentId: STUDENT,
        termId: TERM,
        classTeacherComment: 'Well done',
      });
      expect(res.status).toBe(200);
      expect(teacherFindFirst.mock.calls[0]![0]!.where).toMatchObject({
        userId: 'u-1',
        schoolId: 'school-A',
      });
      expect(reportUpsert.mock.calls[0]![0]!.create.schoolId).toBe('school-A');
    });

    it("may NOT generate for a student in someone else's class", async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({
        isClassTeacher: true,
        classTeacherStreamId: 'stream-8B',
      });
      expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(403);
      noWrite();
    });

    it('a teacher who is not a class teacher is refused', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({ isClassTeacher: false, classTeacherStreamId: null });
      expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(403);
      noWrite();
    });

    it("may NOT set the principal's comment (admin only)", async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({
        isClassTeacher: true,
        classTeacherStreamId: 'stream-7A',
      });
      const res = await post({ studentId: STUDENT, termId: TERM, principalComment: 'Approved' });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/principal/i);
      noWrite();
    });
  });

  it("deputy may generate but not set the principal's comment", async () => {
    signedInAs('deputy');
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(200);
    reportUpsert.mockClear();
    expect((await post({ studentId: STUDENT, termId: TERM, principalComment: 'x' })).status).toBe(
      403
    );
    noWrite();
  });

  it("admin may set the principal's comment", async () => {
    signedInAs('admin');
    expect(
      (await post({ studentId: STUDENT, termId: TERM, principalComment: 'Excellent term' })).status
    ).toBe(200);
    expect(reportUpsert.mock.calls[0]![0]!.create.principalComment).toBe('Excellent term');
  });

  it('refuses to silently regenerate an already-published report (409)', async () => {
    signedInAs('admin');
    reportFindUnique.mockResolvedValue({ id: 'r-1', publishedAt: new Date() });
    expect((await post({ studentId: STUDENT, termId: TERM })).status).toBe(409);
    noWrite();
  });

  it('writes an audit entry with the actor and school', async () => {
    signedInAs('admin');
    await post({ studentId: STUDENT, termId: TERM });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'term_report.generated',
        tableName: 'term_reports',
      })
    );
  });
});
