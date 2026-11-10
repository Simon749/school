import { beforeEach, describe, expect, it, vi } from 'vitest';

// Recording fake database: any model/method answers with an "empty" value, and every call is logged.
const h = vi.hoisted(() => {
  const state = {
    calls: [] as { model: string; method: string; args: { where?: unknown } | undefined }[],
    currentTerm: null as unknown,
    userRow: null as unknown,
  };
  const emptyFor = (model: string, method: string) => {
    if (model === 'term' && method === 'findFirst') return state.currentTerm;
    if (method === 'count') return 0;
    if (method === 'findMany' || method === 'groupBy') return [];
    return null;
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
              if (model === 'user' && method === 'findUnique') return state.userRow;
              return emptyFor(model, method);
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
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: h.db }));

import DeputyDashboardPage from '@/app/(dashboard)/deputy/page';
import TeacherPerformancePage from '@/app/(dashboard)/deputy/teacher-performance/page';
import UncoveredLessonsPage from '@/app/(dashboard)/deputy/uncovered-lessons/page';

const PAGES = [
  ['deputy dashboard', DeputyDashboardPage],
  ['teacher performance', TeacherPerformancePage],
  ['uncovered lessons', UncoveredLessonsPage],
] as const;

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
const dataCalls = () => calls.filter((c) => c.model !== 'user');

beforeEach(() => {
  calls.length = 0;
  authMock.mockReset();
  redirectMock.mockClear();
  h.state.currentTerm = null;
  h.state.userRow = user('deputy');
  authMock.mockResolvedValue({ userId: 'clerk_1' });
});

describe.each(PAGES)('%s page (SEC-09)', (_name, Page) => {
  it('sends anonymous visitors to /login before querying anything', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(Page()).rejects.toThrow('REDIRECT:/login');
    expect(calls).toHaveLength(0);
  });

  it.each(['parent', 'teacher', 'bursar', 'it_admin'])(
    'turns role %s away before querying data',
    async (role) => {
      h.state.userRow = user(role);
      await expect(Page()).rejects.toThrow('REDIRECT:/unauthorized');
      expect(dataCalls()).toHaveLength(0);
    }
  );

  it('turns away a deactivated deputy (SEC-21)', async () => {
    h.state.userRow = user('deputy', { isActive: false });
    await expect(Page()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(dataCalls()).toHaveLength(0);
  });

  it.each(['deputy', 'admin'])('lets %s in', async (role) => {
    h.state.userRow = user(role);
    await expect(Page()).resolves.toBeDefined();
  });

  it("scopes EVERY query to the caller's school (no cross-school data)", async () => {
    h.state.currentTerm = {
      id: 'term-1',
      schoolId: 'school-A',
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-04-03'),
    };
    await Page();
    const queried = dataCalls();
    expect(queried.length).toBeGreaterThan(0);
    for (const c of queried) {
      expect(
        JSON.stringify(c.args?.where),
        `${c.model}.${c.method} must filter by schoolId`
      ).toContain('"schoolId":"school-A"');
    }
  });

  it('never widens to every term when no term is current', async () => {
    h.state.currentTerm = null;
    await Page();
    const slotQueries = dataCalls().filter((x) => x.model === 'timetableSlot');
    for (const c of slotQueries) {
      expect(JSON.stringify(c.args?.where)).toContain('"termId":{"in":[]}');
    }
  });
});
