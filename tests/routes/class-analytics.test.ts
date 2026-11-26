import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Recording fake database with per-call overrides: key "model.method" -> value.
const h = vi.hoisted(() => {
  const state = {
    calls: [] as { model: string; method: string; args: { where?: Record<string, unknown> } | undefined }[],
    returns: {} as Record<string, unknown>,
  };
  const db = new Proxy(
    {},
    {
      get: (_t, model: string) =>
        new Proxy(
          {},
          {
            get: (_t2, method: string) => async (args?: { where?: Record<string, unknown> }) => {
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

import ClassAnalyticsPage from '@/app/(dashboard)/teacher/classroom/analytics/page';
import StudentAnalyticsPage from '@/app/(dashboard)/teacher/classroom/students/[studentId]/page';
import { GET as todayApi } from '@/app/api/timetable/teacher/today/route';

const calls = h.state.calls;
const callsTo = (key: string) => calls.filter((c) => `${c.model}.${c.method}` === key);
// Rendered React trees can contain cycles (owner / store references); serialise safely.
const text = (node: unknown) => {
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (_k, v) => {
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return typeof v === 'function' ? undefined : v;
  });
};

const asTeacher = (teacher: Record<string, unknown> = {}) => {
  h.state.returns['user.findUnique'] = {
    id: 'u-1', clerkId: 'clerk_1', role: 'teacher', schoolId: 'school-A', isActive: true, deletedAt: null,
  };
  h.state.returns['teacher.findFirst'] = {
    id: 't-1', schoolId: 'school-A', isClassTeacher: true, classTeacherStreamId: 'st-5A', ...teacher,
  };
  h.state.returns['stream.findFirst'] = { id: 'st-5A', name: 'A', grade: { name: 'Grade 5' } };
  h.state.returns['term.findFirst'] = {
    id: 'term-2', name: 'Term 2 2026',
    startDate: new Date('2026-05-01T00:00:00.000Z'),
    endDate: new Date('2026-08-07T00:00:00.000Z'),
  };
};

beforeEach(() => {
  calls.length = 0;
  h.state.returns = {};
  authMock.mockReset();
  redirectMock.mockClear();
  authMock.mockResolvedValue({ userId: 'clerk_1' });
});
afterEach(() => vi.useRealTimers());

describe('class analytics page: who may see it', () => {
  it('a teacher who is NOT a class teacher is refused and no learner or attendance is queried', async () => {
    asTeacher({ isClassTeacher: false, classTeacherStreamId: null });
    const out = text(await ClassAnalyticsPage());
    expect(out).toContain('Only the class teacher');
    expect(callsTo('student.findMany')).toHaveLength(0);
    expect(callsTo('studentDailyAttendance.findMany')).toHaveLength(0);
  });

  it('a parent is turned away before any data is read', async () => {
    h.state.returns['user.findUnique'] = {
      id: 'u-2', clerkId: 'clerk_1', role: 'parent', schoolId: 'school-A', isActive: true, deletedAt: null,
    };
    await expect(ClassAnalyticsPage()).rejects.toThrow(/REDIRECT/);
    expect(callsTo('student.findMany')).toHaveLength(0);
  });

  it('looks up the class by id AND school, and reads only that class\'s learners', async () => {
    asTeacher();
    h.state.returns['student.findMany'] = [{ id: 's1', firstName: 'Amara', lastName: 'Otieno', admissionNumber: '001' }];
    await ClassAnalyticsPage();
    expect(callsTo('stream.findFirst')[0]!.args!.where).toMatchObject({ id: 'st-5A', schoolId: 'school-A' });
    expect(callsTo('student.findMany')[0]!.args!.where).toMatchObject({
      streamId: 'st-5A', schoolId: 'school-A', status: 'active', deletedAt: null,
    });
    const att = callsTo('studentDailyAttendance.findMany')[0]!.args!.where!;
    expect(att).toMatchObject({ schoolId: 'school-A', studentId: { in: ['s1'] } });
  });

  it('says so when the school has no current term, instead of guessing a period', async () => {
    asTeacher();
    h.state.returns['term.findFirst'] = null;
    expect(text(await ClassAnalyticsPage())).toContain('No current term');
    expect(callsTo('student.findMany')).toHaveLength(0);
  });
});

describe('class analytics page: honesty about missing attendance', () => {
  it('with no register ever taken: "No attendance recorded yet" and "not taken yet", never 0%', async () => {
    asTeacher();
    h.state.returns['student.findMany'] = [
      { id: 's1', firstName: 'Amara', lastName: 'Otieno', admissionNumber: '001' },
      { id: 's2', firstName: 'Baraka', lastName: 'Mwangi', admissionNumber: '002' },
    ];
    const out = text(await ClassAnalyticsPage());
    expect(out).toContain('No attendance recorded yet');
    expect(out).toContain('Attendance not taken yet');
    expect(out).toContain('Not recorded yet'); // per learner
    expect(out).not.toContain('"0%"');
  });
});

describe('learner attendance page: only a learner of the teacher\'s OWN class', () => {
  it('a learner from another class (or school) is "not found" and no attendance is read', async () => {
    asTeacher();
    h.state.returns['student.findFirst'] = null; // the scoped query finds nobody
    const out = text(await StudentAnalyticsPage({ params: { studentId: 'someone-elses-child' } }));
    expect(out).toContain('Learner not found in your class');
    expect(callsTo('student.findFirst')[0]!.args!.where).toMatchObject({
      id: 'someone-elses-child', schoolId: 'school-A', streamId: 'st-5A', deletedAt: null,
    });
    expect(callsTo('studentDailyAttendance.findMany')).toHaveLength(0);
    expect(callsTo('studentLessonAttendance.findMany')).toHaveLength(0);
  });

  it('a non-class-teacher cannot open any learner', async () => {
    asTeacher({ isClassTeacher: false, classTeacherStreamId: null });
    const out = text(await StudentAnalyticsPage({ params: { studentId: 's1' } }));
    expect(out).toContain('Only the class teacher');
    expect(callsTo('student.findFirst')).toHaveLength(0);
  });

  it('shows the learner\'s own figures, scoped to that learner and school', async () => {
    asTeacher();
    h.state.returns['student.findFirst'] = { id: 's1', firstName: 'Amara', lastName: 'Otieno', admissionNumber: '001' };
    h.state.returns['studentDailyAttendance.findMany'] = [
      { studentId: 's1', date: new Date('2026-05-04T00:00:00.000Z'), status: 'present' },
      { studentId: 's1', date: new Date('2026-05-05T00:00:00.000Z'), status: 'absent' },
    ];
    h.state.returns['studentLessonAttendance.findMany'] = [
      { status: 'absent', absenceReason: 'sick', slot: { learningArea: { name: 'Mathematics' } } },
    ];
    const out = text(await StudentAnalyticsPage({ params: { studentId: 's1' } }));
    expect(out).toContain('Amara');
    expect(out).toContain('50%');
    expect(out).toContain('Sick');
    expect(out).toContain('Mathematics');
    expect(callsTo('studentDailyAttendance.findMany')[0]!.args!.where).toMatchObject({
      studentId: 's1', schoolId: 'school-A',
    });
  });
});

describe('GET /api/timetable/teacher/today: My Class panel', () => {
  // A Sunday, so the route returns right after building the panel.
  const sunday = new Date('2026-11-29T10:00:00.000Z');

  const panel = async () => {
    vi.useFakeTimers();
    vi.setSystemTime(sunday);
    const res = await todayApi();
    return (await res.json()).classTeacherPanel;
  };

  it('24 learners and no register taken: 0 absent, 24 NOT MARKED (never "24 absent")', async () => {
    asTeacher();
    h.state.returns['student.findMany'] = Array.from({ length: 24 }, (_, i) => ({
      id: `s${i}`, firstName: 'L', lastName: String(i),
    }));
    const p = await panel();
    expect(p.today).toEqual({ total: 24, present: 0, late: 0, absent: 0, other: 0, notMarked: 24 });
    expect(p.flaggedStudents).toEqual([]);
  });

  it('counts today\'s register by status, using the NAIROBI date', async () => {
    asTeacher();
    h.state.returns['student.findMany'] = ['a', 'b', 'c', 'd'].map((id) => ({ id, firstName: id, lastName: 'X' }));
    h.state.returns['studentDailyAttendance.findMany'] = [
      { studentId: 'a', date: new Date('2026-11-29T00:00:00.000Z'), status: 'present' },
      { studentId: 'b', date: new Date('2026-11-29T00:00:00.000Z'), status: 'late' },
      { studentId: 'c', date: new Date('2026-11-29T00:00:00.000Z'), status: 'absent' },
      { studentId: 'd', date: new Date('2026-11-28T00:00:00.000Z'), status: 'absent' }, // yesterday
    ];
    const p = await panel();
    expect(p.today).toEqual({ total: 4, present: 1, late: 1, absent: 1, other: 0, notMarked: 1 });
  });

  it('reads the class and its attendance inside the caller\'s school only', async () => {
    asTeacher();
    h.state.returns['student.findMany'] = [{ id: 'a', firstName: 'A', lastName: 'X' }];
    await panel();
    expect(callsTo('stream.findFirst')[0]!.args!.where).toMatchObject({ id: 'st-5A', schoolId: 'school-A' });
    expect(callsTo('studentDailyAttendance.findMany')[0]!.args!.where).toMatchObject({ schoolId: 'school-A' });
  });

  it('a teacher who is not a class teacher gets no panel at all (so no My Class card)', async () => {
    asTeacher({ isClassTeacher: false, classTeacherStreamId: null });
    expect(await panel()).toBeNull();
  });
});
