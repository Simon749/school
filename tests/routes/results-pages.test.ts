import { beforeEach, describe, expect, it, vi } from 'vitest';

// Recording fake database with per-call overrides: key "model.method" -> value.
const h = vi.hoisted(() => {
  const state = {
    calls: [] as { model: string; method: string; args: { where?: unknown } | undefined }[],
    returns: {} as Record<string, unknown>,
  };
  const db = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_t2, method: string) => async (args?: { where?: unknown }) => {
              state.calls.push({ model, method, args });
              const key = `${model}.${method}`;
              if (key in state.returns) return state.returns[key];
              if (method === 'findMany') return [];
              if (method === 'count') return 0;
              return null;
            },
          }
        ),
    }
  );
  return { state, db };
});

const authMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirectMock(u) }));
vi.mock('@/lib/db', () => ({ prisma: h.db }));

import MarksEntryPage from '@/app/(dashboard)/teacher/markbook/[assessmentId]/page';
import TeacherReportPage from '@/app/(dashboard)/teacher/reports/[studentId]/page';
import ParentReportsPage from '@/app/(dashboard)/parent/[studentId]/reports/page';

const user = (role: string, over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  clerkId: 'clerk_1',
  role,
  schoolId: 'school-A',
  isActive: true,
  deletedAt: null,
  ...over,
});
const calls = h.state.calls;
const callsTo = (key: string) => calls.filter((c) => `${c.model}.${c.method}` === key);
const text = (node: unknown) => JSON.stringify(node);

beforeEach(() => {
  calls.length = 0;
  h.state.returns = {};
  authMock.mockReset();
  redirectMock.mockClear();
  authMock.mockResolvedValue({ userId: 'clerk_1' });
});

const asTeacher = (teacher: Record<string, unknown> = {}) => {
  h.state.returns['user.findUnique'] = user('teacher');
  h.state.returns['teacher.findFirst'] = {
    id: 't-1',
    schoolId: 'school-A',
    isClassTeacher: true,
    classTeacherStreamId: 'st-7A',
    ...teacher,
  };
};

describe('teacher/markbook/[assessmentId] page (FEAT-01)', () => {
  const run = () => MarksEntryPage({ params: { assessmentId: 'a-1' } });
  const assessment = {
    id: 'a-1',
    title: 'CAT 1',
    status: 'draft',
    maxMarks: 50,
    streamId: 'st-7A',
    learningArea: {
      name: 'Maths',
      strands: [{ name: 'Numbers', subStrands: [{ id: 'ss-1', name: 'Fractions' }] }],
    },
    stream: { name: 'A' },
    term: { name: 'Term 1' },
  };

  it('anonymous → /login; non-teachers and teachers without a record → /unauthorized, before any data query', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(run()).rejects.toThrow('REDIRECT:/login');
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    h.state.returns['user.findUnique'] = user('parent');
    await expect(run()).rejects.toThrow('REDIRECT:/unauthorized');
    h.state.returns['user.findUnique'] = user('teacher');
    h.state.returns['teacher.findFirst'] = null;
    await expect(run()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(callsTo('assessment.findFirst')).toHaveLength(0);
  });

  it('a real teacher is no longer thrown out: the teacher is found by the internal user id', async () => {
    asTeacher();
    h.state.returns['assessment.findFirst'] = assessment;
    await expect(run()).resolves.toBeDefined();
    expect(callsTo('teacher.findFirst')[0]!.args?.where).toEqual({
      userId: 'u-1',
      schoolId: 'school-A',
    });
  });

  it("loads the assessment only if it is this teacher's, in this school", async () => {
    asTeacher();
    h.state.returns['assessment.findFirst'] = assessment;
    await run();
    expect(callsTo('assessment.findFirst')[0]!.args?.where).toEqual({
      id: 'a-1',
      teacherId: 't-1',
      schoolId: 'school-A',
    });
  });

  it('shows "not found" for someone else\'s assessment and loads no students', async () => {
    asTeacher();
    h.state.returns['assessment.findFirst'] = null;
    expect(text(await run())).toContain('not found');
    expect(callsTo('student.findMany')).toHaveLength(0);
  });

  it("lists only active, non-deleted students of the assessment's class in this school", async () => {
    asTeacher();
    h.state.returns['assessment.findFirst'] = assessment;
    await run();
    expect(callsTo('student.findMany')[0]!.args?.where).toMatchObject({
      streamId: 'st-7A',
      schoolId: 'school-A',
      status: 'active',
      deletedAt: null,
    });
  });
});

describe('teacher/reports/[studentId] page', () => {
  const run = () => TeacherReportPage({ params: { studentId: 'stu-1' } });

  it('anonymous → /login; non-teachers → /unauthorized', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(run()).rejects.toThrow('REDIRECT:/login');
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    h.state.returns['user.findUnique'] = user('bursar');
    await expect(run()).rejects.toThrow('REDIRECT:/unauthorized');
  });

  it('a teacher who is not a class teacher sees "Access denied" and no student data is read', async () => {
    asTeacher({ isClassTeacher: false, classTeacherStreamId: null });
    expect(text(await run())).toContain('Access denied');
    expect(callsTo('student.findFirst')).toHaveLength(0);
  });

  it("only opens students of the teacher's OWN class (another class's student is 'not found')", async () => {
    asTeacher();
    h.state.returns['student.findFirst'] = null;
    expect(text(await run())).toContain('Student not found');
    expect(callsTo('student.findFirst')[0]!.args?.where).toMatchObject({
      id: 'stu-1',
      schoolId: 'school-A',
      streamId: 'st-7A',
      deletedAt: null,
    });
  });

  it('does not crash when no term is current (it used to query with termId: undefined)', async () => {
    asTeacher();
    h.state.returns['student.findFirst'] = {
      id: 'stu-1',
      firstName: 'Amara',
      lastName: 'O',
      stream: { name: 'A', grade: { name: 'Grade 7' } },
    };
    h.state.returns['term.findFirst'] = null;
    expect(text(await run())).toContain('No current term');
    expect(callsTo('termReport.findUnique')).toHaveLength(0);
  });

  it('with a current term, looks up the existing report for that student and term', async () => {
    asTeacher();
    h.state.returns['student.findFirst'] = {
      id: 'stu-1',
      firstName: 'Amara',
      lastName: 'O',
      stream: { name: 'A', grade: { name: 'Grade 7' } },
    };
    h.state.returns['term.findFirst'] = { id: 'term-1', name: 'Term 1' };
    await run();
    expect(callsTo('term.findFirst')[0]!.args?.where).toMatchObject({
      schoolId: 'school-A',
      isCurrent: true,
    });
    expect(callsTo('termReport.findUnique')[0]!.args?.where).toEqual({
      studentId_termId: { studentId: 'stu-1', termId: 'term-1' },
    });
  });
});

describe('parent/[studentId]/reports page', () => {
  const run = () => ParentReportsPage({ params: { studentId: 'stu-1' } });
  const guardian = { student: { firstName: 'Amara', stream: { name: 'A' } } };

  it('anonymous → /login; non-parents → /unauthorized', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(run()).rejects.toThrow('REDIRECT:/login');
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    h.state.returns['user.findUnique'] = user('teacher');
    await expect(run()).rejects.toThrow('REDIRECT:/unauthorized');
  });

  it('finds the guardian link by the INTERNAL user id, active, inside the school', async () => {
    h.state.returns['user.findUnique'] = user('parent');
    h.state.returns['guardian.findFirst'] = guardian;
    await run();
    expect(callsTo('guardian.findFirst')[0]!.args?.where).toMatchObject({
      userId: 'u-1',
      studentId: 'stu-1',
      isActive: true,
      student: { schoolId: 'school-A', deletedAt: null },
    });
  });

  it('a parent who is not this child\'s guardian sees "Access denied" and no reports are read', async () => {
    h.state.returns['user.findUnique'] = user('parent');
    h.state.returns['guardian.findFirst'] = null;
    expect(text(await run())).toContain('Access denied');
    expect(callsTo('termReport.findMany')).toHaveLength(0);
  });

  it('reads only PUBLISHED reports of this child in this school', async () => {
    h.state.returns['user.findUnique'] = user('parent');
    h.state.returns['guardian.findFirst'] = guardian;
    await run();
    expect(callsTo('termReport.findMany')[0]!.args?.where).toMatchObject({
      studentId: 'stu-1',
      schoolId: 'school-A',
      publishedAt: { not: null },
    });
  });
});
