import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    calls: [] as { model: string; method: string; args: { where?: unknown } | undefined }[],
    userRow: null as unknown,
  };
  const emptyFor = (model: string, method: string) => {
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
vi.mock('@/lib/db', () => ({ prisma: h.db }));

import TeacherClassroomPage from '@/app/(dashboard)/teacher/classroom/page';

const user = (role: string, over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  clerkId: 'clerk_1',
  role,
  schoolId: 'school-A',
  isActive: true,
  deletedAt: null,
  ...over,
});

const classTeacherUser = () =>
  user('teacher', {
    teacher: {
      id: 't-1',
      schoolId: 'school-A',
      isClassTeacher: true,
      classTeacherStreamId: 'stream-1',
      school: { id: 'school-A', name: 'Test School' },
    },
  });

const calls = h.state.calls;
const dataCalls = () => calls.filter((c) => c.model !== 'user');

beforeEach(() => {
  calls.length = 0;
  authMock.mockReset();
  redirectMock.mockClear();
  h.state.userRow = classTeacherUser();
  authMock.mockResolvedValue({ userId: 'clerk_1' });
});

describe('teacher classroom page (SEC-09 / SEC-11)', () => {
  it('sends anonymous visitors to /login before querying anything', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(TeacherClassroomPage()).rejects.toThrow('REDIRECT:/login');
    expect(calls).toHaveLength(0);
  });

  it.each(['parent', 'admin', 'bursar', 'it_admin', 'deputy'])(
    'turns role %s away before querying data',
    async (role) => {
      h.state.userRow = user(role);
      await expect(TeacherClassroomPage()).rejects.toThrow('REDIRECT:/unauthorized');
      expect(dataCalls()).toHaveLength(0);
    }
  );

  it('turns away a deactivated teacher (SEC-21)', async () => {
    h.state.userRow = user('teacher', { isActive: false });
    await expect(TeacherClassroomPage()).rejects.toThrow('REDIRECT:/unauthorized');
    expect(dataCalls()).toHaveLength(0);
  });

  it('shows a friendly card (not a redirect, not a 404) for a non-class-teacher', async () => {
    h.state.userRow = user('teacher', {
      teacher: { id: 't-1', schoolId: 'school-A', isClassTeacher: false },
    });
    await expect(TeacherClassroomPage()).resolves.toBeDefined();
  });

  it('lets a class teacher through', async () => {
    await expect(TeacherClassroomPage()).resolves.toBeDefined();
  });

  it("scopes EVERY query to the caller's school (no cross-school data)", async () => {
    await TeacherClassroomPage();
    const queried = dataCalls();
    expect(queried.length).toBeGreaterThan(0);
    for (const c of queried) {
      expect(
        JSON.stringify(c.args?.where),
        `${c.model}.${c.method} must filter by schoolId`
      ).toContain('"schoolId":"school-A"');
    }
  });
});
