import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const guardianFindMany = vi.fn();
const dailyFindUnique = vi.fn();
const dailyFindMany = vi.fn();
const lessonFindMany = vi.fn();
const resultFindMany = vi.fn();
const termReportFindMany = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    guardian: { findMany: (...a: unknown[]) => guardianFindMany(...a) },
    studentDailyAttendance: {
      findUnique: (...a: unknown[]) => dailyFindUnique(...a),
      findMany: (...a: unknown[]) => dailyFindMany(...a),
    },
    studentLessonAttendance: { findMany: (...a: unknown[]) => lessonFindMany(...a) },
    assessmentResult: { findMany: (...a: unknown[]) => resultFindMany(...a) },
    termReport: { findMany: (...a: unknown[]) => termReportFindMany(...a) },
  },
}));

import { GET as getChildren } from '@/app/api/parent/children/route';
import { GET as getAttendance } from '@/app/api/parent/attendance/route';
import { GET as getResults } from '@/app/api/parent/results/route';

const ROUTES = [
  ['parent/children', () => getChildren()],
  ['parent/attendance', () => getAttendance()],
  ['parent/results', () => getResults()],
] as const;

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

const student = {
  id: 'stu-1',
  firstName: 'Amara',
  lastName: 'Otieno',
  stream: { name: 'A', grade: { name: 'Grade 7' } },
};
const guardianRow = (restricted = false) => ({ hasRestrictedAccess: restricted, student });

const ARRIVED = new Date('2026-10-26T04:43:00Z');

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    guardianFindMany,
    dailyFindUnique,
    dailyFindMany,
    lessonFindMany,
    resultFindMany,
    termReportFindMany,
  ])
    m.mockReset();
  guardianFindMany.mockResolvedValue([guardianRow()]);
  dailyFindUnique.mockResolvedValue({ status: 'present', arrivedAt: ARRIVED, departedAt: null });
  dailyFindMany.mockResolvedValue([
    {
      status: 'present',
      date: new Date('2026-10-26'),
      arrivedAt: ARRIVED,
      departedAt: new Date('2026-10-26T12:00:00Z'),
    },
  ]);
  lessonFindMany.mockResolvedValue([
    {
      id: 'l-1',
      date: new Date('2026-10-26'),
      status: 'absent',
      absenceReason: 'sick',
      createdAt: new Date('2026-10-26T06:00:00Z'),
      slot: {
        learningArea: { name: 'Mathematics' },
        period: {
          startTime: new Date('1970-01-01T08:00:00Z'),
          endTime: new Date('1970-01-01T08:40:00Z'),
        },
      },
    },
  ]);
  resultFindMany.mockResolvedValue([]);
  termReportFindMany.mockResolvedValue([]);
});

function selectedPaths(sel: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(sel).flatMap(([k, v]) => {
    if (v === true) return [prefix + k];
    if (v && typeof v === 'object') {
      const inner = (v as { select?: Record<string, unknown> }).select;
      return inner ? selectedPaths(inner, prefix + k + '.') : [prefix + k + '(!)'];
    }
    return [];
  });
}

describe.each(ROUTES)('%s: who may call it (SEC-03 / SEC-04)', (_name, run) => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
    expect(guardianFindMany).not.toHaveBeenCalled();
  });

  it('403 for a deactivated user (SEC-21)', async () => {
    signedInAs('parent', { isActive: false });
    expect((await run()).status).toBe(403);
    expect(guardianFindMany).not.toHaveBeenCalled();
  });

  it.each(['admin', 'teacher', 'bursar', 'deputy', 'it_admin'])(
    '403 for role %s (a parent-only endpoint)',
    async (role) => {
      signedInAs(role);
      expect((await run()).status).toBe(403);
      expect(guardianFindMany).not.toHaveBeenCalled();
    }
  );

  it("only reads this parent's ACTIVE guardian links, inside their school", async () => {
    signedInAs('parent');
    await run();
    const where = guardianFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: 'u-1', isActive: true });
    expect(where.student).toMatchObject({ schoolId: 'school-A', deletedAt: null });
  });

  it('never selects whole student rows (no medicalNotes / NEMIS / photo)', async () => {
    signedInAs('parent');
    await run();
    const args = guardianFindMany.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    const paths = selectedPaths(args.select).filter((p) => p.startsWith('student'));
    expect(paths.some((p) => p.endsWith('(!)'))).toBe(false); // no bare relation = whole row
    for (const forbidden of [
      'medicalNotes',
      'nemisNumber',
      'photoUrl',
      'dateOfBirth',
      'admissionNumber',
    ]) {
      expect(paths.join(',')).not.toContain(forbidden);
    }
  });
});

describe('parent/children (SEC-03)', () => {
  it('returns only the fields the dashboard uses', async () => {
    signedInAs('parent');
    const body = await (await getChildren()).json();
    expect(Object.keys(body.children[0].student).sort()).toEqual([
      'firstName',
      'id',
      'lastName',
      'stream',
    ]);
    expect(body.children[0].student.stream).toEqual({ name: 'A', grade: { name: 'Grade 7' } });
    expect(body.children[0].lessons[0]).toEqual({
      status: 'absent',
      absenceReason: 'sick',
      slot: { learningArea: { name: 'Mathematics' } },
    });
    expect(body.children[0].daily.arrivedAt).toBeTruthy();
  });

  it('a RESTRICTED guardian does not get the arrival time (design §7)', async () => {
    signedInAs('parent');
    guardianFindMany.mockResolvedValue([guardianRow(true)]);
    const body = await (await getChildren()).json();
    expect(body.children[0].daily.arrivedAt).toBeUndefined();
    expect(body.children[0].daily.status).toBe('present');
    expect(JSON.stringify(body)).not.toContain('04:43');
  });

  it("scopes the day's attendance queries to the child and school", async () => {
    signedInAs('parent');
    await getChildren();
    expect(dailyFindUnique.mock.calls[0][0].where.studentId_date.studentId).toBe('stu-1');
    expect(lessonFindMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'stu-1',
      schoolId: 'school-A',
    });
  });
});

describe('parent/attendance (SEC-04)', () => {
  it('normal guardian sees arrival/departure times', async () => {
    signedInAs('parent');
    const body = await (await getAttendance()).json();
    expect(body.children[0].lastArrival).toBeTruthy();
    expect(body.children[0].recentDays[0].arrivedAt).toBeTruthy();
    expect(body.children[0].recentDays[0].departedAt).toBeTruthy();
  });

  it('a RESTRICTED guardian sees no arrival/departure/last-arrival times', async () => {
    signedInAs('parent');
    guardianFindMany.mockResolvedValue([guardianRow(true)]);
    const body = await (await getAttendance()).json();
    const text = JSON.stringify(body);
    expect(body.children[0].lastArrival).toBeUndefined();
    expect(body.children[0].recentDays[0].arrivedAt).toBeUndefined();
    expect(body.children[0].recentDays[0].departedAt).toBeUndefined();
    expect(text).not.toContain('04:43');
    // but the attendance picture itself is still shown
    expect(body.children[0].totalPresent).toBe(1);
    expect(body.children[0].recentDays[0].lessons[0].status).toBe('absent');
  });

  it('scopes daily and lesson queries to the child and school', async () => {
    signedInAs('parent');
    await getAttendance();
    expect(dailyFindMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'stu-1',
      schoolId: 'school-A',
    });
    expect(lessonFindMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'stu-1',
      schoolId: 'school-A',
    });
  });
});

describe('parent/results (SEC-04): drafts must never reach parents', () => {
  it('asks only for PUBLISHED (or locked) assessments of the child, in the school', async () => {
    signedInAs('parent');
    await getResults();
    const where = resultFindMany.mock.calls[0][0].where;
    expect(where.studentId).toBe('stu-1');
    expect(where.assessment).toMatchObject({
      schoolId: 'school-A',
      status: { in: ['published', 'locked'] },
    });
  });

  it('asks only for PUBLISHED term reports in the school', async () => {
    signedInAs('parent');
    await getResults();
    expect(termReportFindMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'stu-1',
      schoolId: 'school-A',
      publishedAt: { not: null },
    });
  });

  it('a restricted guardian still sees results (design: results/fees allowed)', async () => {
    signedInAs('parent');
    guardianFindMany.mockResolvedValue([guardianRow(true)]);
    const res = await getResults();
    expect(res.status).toBe(200);
    expect((await res.json()).children).toHaveLength(1);
  });

  it('keeps the response shape', async () => {
    signedInAs('parent');
    const body = await (await getResults()).json();
    expect(Object.keys(body.children[0]).sort()).toEqual(
      [
        'assessments',
        'firstName',
        'grade',
        'lastName',
        'needsImprovement',
        'overallAverage',
        'stream',
        'strengths',
        'studentId',
        'subjectPerformance',
        'termSummaries',
      ].sort()
    );
  });
});
