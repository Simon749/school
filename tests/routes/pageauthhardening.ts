import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SEC-09 / SEC-11 / SEC-21 for the nine dashboard pages that used to do their own raw `auth()` +
 * `/sign-in` handling. Every page must:
 *   1. send anonymous visitors to /login BEFORE touching data,
 *   2. turn away every role that is not allowed, BEFORE touching data,
 *   3. turn away deactivated and soft-deleted users, BEFORE touching data,
 *   4. let the allowed role(s) in,
 *   5. scope EVERY query it runs to the caller's school.
 */

// Recording fake database: key "model.method" -> value, defaults to empty results.
const h = vi.hoisted(() => {
  type Call = { model: string; method: string; args: { where?: unknown } | undefined };
  const state = { calls: [] as Call[], returns: {} as Record<string, unknown> };
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
// The IT-admin dashboard pings Redis and the export queue; keep the tests offline.
vi.mock('@/lib/redis', () => ({ redis: { ping: async () => 'PONG' } }));
vi.mock('@/lib/export/queue', () => ({ exportQueue: { getJobCounts: async () => ({}) } }));

import AdminReportsPage from '@/app/(dashboard)/admin/reports/page';
import ItAdminLayout from '@/app/(dashboard)/it_admin/layout';
import ItAdminDashboardPage from '@/app/(dashboard)/it_admin/page';
import ItAdminUsersPage from '@/app/(dashboard)/it_admin/users/page';
import ParentFeesPage from '@/app/(dashboard)/parent/[studentId]/fees/page';
import ParentResultsPage from '@/app/(dashboard)/parent/[studentId]/results/page';
import ParentMessagesPage from '@/app/(dashboard)/parent/messages/page';
import TeacherMarkbookPage from '@/app/(dashboard)/teacher/markbook/page';
import TeacherMessagesPage from '@/app/(dashboard)/teacher/messages/page';

const ALL_ROLES = ['admin', 'deputy', 'teacher', 'bursar', 'parent', 'it_admin'] as const;

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
/** Anything other than the identity lookup of the signed-in user. */
const dataCalls = () => calls.filter((c) => c.model !== 'user' || c.method !== 'findUnique');
const where = (c: { args?: { where?: unknown } }) => JSON.stringify(c.args?.where ?? {});
const text = (node: unknown) => JSON.stringify(node);

// What each page needs from the fake database to get past its guards and run its queries.
const guardian = (terms: unknown[]) => ({
  student: {
    id: 's-1',
    schoolId: 'school-A',
    streamId: 'st-1',
    firstName: 'Amara',
    lastName: 'Otieno',
    admissionNumber: '1001',
    stream: { name: '7A' },
    school: { terms },
  },
});
const TERM = { id: 't-1', name: 'Term 1' };

interface Spec {
  name: string;
  allowed: readonly (typeof ALL_ROLES)[number][];
  run: () => Promise<unknown>;
  setup?: () => void;
}

const SPECS: Spec[] = [
  {
    name: 'admin/reports',
    allowed: ['admin', 'deputy'],
    run: () => AdminReportsPage(),
    setup: () => {
      h.state.returns['term.findFirst'] = TERM;
    },
  },
  {
    name: 'it_admin/layout',
    allowed: ['it_admin'],
    run: () => ItAdminLayout({ children: null }),
  },
  {
    name: 'it_admin/page',
    allowed: ['it_admin'],
    run: () => ItAdminDashboardPage(),
    setup: () => {
      h.state.returns['school.findUnique'] = { name: 'Test School', smsBalance: 10 };
    },
  },
  {
    name: 'it_admin/users',
    allowed: ['it_admin'],
    run: () => ItAdminUsersPage({ searchParams: {} }),
  },
  {
    name: 'parent/[studentId]/fees',
    allowed: ['parent'],
    run: () => ParentFeesPage({ params: { studentId: 's-1' } }),
    setup: () => {
      h.state.returns['guardian.findFirst'] = guardian([TERM]);
    },
  },
  {
    name: 'parent/[studentId]/results',
    allowed: ['parent'],
    run: () => ParentResultsPage({ params: { studentId: 's-1' } }),
    setup: () => {
      h.state.returns['guardian.findFirst'] = guardian([TERM]);
    },
  },
  {
    name: 'parent/messages',
    allowed: ['parent'],
    run: () => ParentMessagesPage(),
  },
  {
    name: 'teacher/markbook',
    allowed: ['teacher'],
    run: () => TeacherMarkbookPage(),
    setup: () => {
      h.state.returns['teacher.findFirst'] = {
        id: 't-1',
        schoolId: 'school-A',
        school: { streams: [], learningAreas: [], terms: [] },
      };
    },
  },
  {
    name: 'teacher/messages',
    allowed: ['teacher'],
    run: () => TeacherMessagesPage(),
    setup: () => {
      h.state.returns['teacher.findFirst'] = {
        id: 't-1',
        schoolId: 'school-A',
        isClassTeacher: false,
        classTeacherStream: null,
      };
    },
  },
];

beforeEach(() => {
  calls.length = 0;
  h.state.returns = {};
  authMock.mockReset();
  redirectMock.mockClear();
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe.each(SPECS)('$name (SEC-09 / SEC-11 / SEC-21)', (spec) => {
  const signInAs = (role: string, over: Record<string, unknown> = {}) => {
    spec.setup?.();
    h.state.returns['user.findUnique'] = user(role, over);
  };
  const primaryRole = spec.allowed[0]!;

  it('sends anonymous visitors to /login before querying anything', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(spec.run()).rejects.toThrow('REDIRECT:/login');
    expect(calls).toHaveLength(0);
  });

  it('never redirects to the non-existent /sign-in', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(spec.run()).rejects.not.toThrow('/sign-in');
  });

  const refused = ALL_ROLES.filter((r) => !spec.allowed.includes(r));
  it.each(refused)('turns role %s away before querying data', async (role) => {
    signInAs(role);
    await expect(spec.run()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(dataCalls()).toHaveLength(0);
  });

  it('turns away a user with no row in our database', async () => {
    spec.setup?.();
    h.state.returns['user.findUnique'] = null;
    await expect(spec.run()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(dataCalls()).toHaveLength(0);
  });

  it('turns away a deactivated user (SEC-21)', async () => {
    signInAs(primaryRole, { isActive: false });
    await expect(spec.run()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(dataCalls()).toHaveLength(0);
  });

  it('turns away a soft-deleted user (SEC-21)', async () => {
    signInAs(primaryRole, { deletedAt: new Date() });
    await expect(spec.run()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(dataCalls()).toHaveLength(0);
  });

  it.each(spec.allowed)('lets role %s in', async (role) => {
    signInAs(role);
    await expect(spec.run()).resolves.toBeDefined();
  });

  it("scopes EVERY query to the caller's school (SEC-11)", async () => {
    signInAs(primaryRole);
    await spec.run();
    for (const c of dataCalls()) {
      // The school row itself is addressed by its own id; everything else carries schoolId.
      const expected = c.model === 'school' ? '"id":"school-A"' : '"schoolId":"school-A"';
      expect(where(c), `${c.model}.${c.method} must be scoped to the caller's school`).toContain(expected);
    }
  });
});

describe('parent pages: identity is the INTERNAL user id, and no term means no data', () => {
  const parentFees = () => ParentFeesPage({ params: { studentId: 's-1' } });
  const parentResults = () => ParentResultsPage({ params: { studentId: 's-1' } });

  beforeEach(() => {
    h.state.returns['user.findUnique'] = user('parent');
  });

  it.each([
    ['fees', parentFees],
    ['results', parentResults],
  ])('%s: finds the guardian link by user.id, never by the Clerk id', async (_n, run) => {
    h.state.returns['guardian.findFirst'] = guardian([TERM]);
    await run();
    const g = calls.find((c) => c.model === 'guardian' && c.method === 'findFirst')!;
    expect(where(g)).toContain('"userId":"u-1"');
    expect(where(g)).not.toContain('clerk_1');
    expect(where(g)).toContain('"isActive":true');
    expect(where(g)).toContain('"deletedAt":null');
  });

  it.each([
    ['fees', parentFees, ['studentFee', 'feePayment']],
    ['results', parentResults, ['assessment']],
  ])('%s: with NO current term it queries nothing (never widens to every term)', async (_n, run, models) => {
    h.state.returns['guardian.findFirst'] = guardian([]);
    const out = await run();
    expect(text(out)).toContain('No current term');
    for (const m of models as string[]) {
      expect(calls.filter((c) => c.model === m), `${m} must not be queried`).toHaveLength(0);
    }
  });

  it.each([
    ['fees', parentFees, ['studentFee', 'feePayment']],
    ['results', parentResults, ['assessment']],
  ])('%s: with a current term, queries are pinned to that term', async (_n, run, models) => {
    h.state.returns['guardian.findFirst'] = guardian([TERM]);
    await run();
    for (const m of models as string[]) {
      const c = calls.find((x) => x.model === m);
      expect(c, `${m} should be queried`).toBeDefined();
      expect(where(c!)).toContain('"termId":"t-1"');
    }
  });

  it('a parent with no active link to the student gets Access Denied and no fee data', async () => {
    h.state.returns['guardian.findFirst'] = null;
    const out = await parentFees();
    expect(text(out)).toContain('Access Denied');
    expect(calls.filter((c) => c.model === 'studentFee' || c.model === 'feePayment')).toHaveLength(0);
  });
});

describe('teacher pages: teacher record found by internal user id + school', () => {
  beforeEach(() => {
    h.state.returns['user.findUnique'] = user('teacher');
  });

  it.each([
    ['markbook', () => TeacherMarkbookPage()],
    ['messages', () => TeacherMessagesPage()],
  ])('%s: a teacher-role user with no teacher record gets a friendly card and no further data', async (_n, run) => {
    h.state.returns['teacher.findFirst'] = null;
    const out = await run();
    expect(text(out)).toContain('Teacher profile not found');
    expect(dataCalls().filter((c) => c.model !== 'teacher')).toHaveLength(0);
    const t = calls.find((c) => c.model === 'teacher')!;
    expect(where(t)).toContain('"userId":"u-1"');
    expect(where(t)).not.toContain('clerk_1');
  });

  it("markbook: only lists the caller's own assessments", async () => {
    h.state.returns['teacher.findFirst'] = {
      id: 't-1',
      schoolId: 'school-A',
      school: { streams: [], learningAreas: [], terms: [] },
    };
    await TeacherMarkbookPage();
    const a = calls.find((c) => c.model === 'assessment')!;
    expect(where(a)).toContain('"teacherId":"t-1"');
    expect(where(a)).toContain('"schoolId":"school-A"');
  });

  it('messages: an active non-primary guardian is still reachable (primary preferred)', async () => {
    h.state.returns['teacher.findFirst'] = {
      id: 't-1',
      schoolId: 'school-A',
      isClassTeacher: true,
      classTeacherStream: { id: 'st-1', name: 'A', grade: { name: 'Grade 6' }, students: [] },
    };
    await TeacherMessagesPage();
    const t = calls.find((c) => c.model === 'teacher')!;
    const args = JSON.stringify((t.args as { include?: unknown }).include);
    expect(args).toContain('"orderBy":[{"isPrimary":"desc"}');
    expect(args).toContain('"isActive":true');
    expect(args).not.toContain('"isPrimary":true'); // primary is a preference, not a requirement
  });
});