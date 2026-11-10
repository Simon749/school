import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const findUnique = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
const teacherFindFirst = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
  },
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirectMock(url) }));

import {
  requirePageTeacher,
  requireTeacher,
  requireUser,
  requirePageUser,
  resolveUser,
} from '@/lib/auth/current-user';

const dbUser = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  clerkId: 'clerk_1',
  role: 'admin',
  schoolId: 'school-A',
  isActive: true,
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  authMock.mockReset();
  findUnique.mockReset();
  teacherFindFirst.mockReset();
  redirectMock.mockClear();
});

describe('resolveUser (D1: identity comes from the DB, keyed by clerkId)', () => {
  it('is unauthenticated when there is no Clerk session', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect(await resolveUser()).toEqual({ status: 'unauthenticated' });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('looks the user up by clerkId', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser());
    await resolveUser();
    expect(findUnique.mock.calls[0][0].where).toEqual({ clerkId: 'clerk_1' });
  });

  it('is forbidden when Clerk knows the person but our DB does not (SEC-25 hole)', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_ghost' });
    findUnique.mockResolvedValue(null);
    expect(await resolveUser()).toEqual({ status: 'forbidden' });
  });

  it('is forbidden when the user is deactivated (SEC-21)', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    expect(await resolveUser()).toEqual({ status: 'forbidden' });
  });

  it('is forbidden when the user is soft-deleted (SEC-21)', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ deletedAt: new Date() }));
    expect(await resolveUser()).toEqual({ status: 'forbidden' });
  });

  it('is forbidden when the role is not in the allowed list', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'parent' }));
    expect(await resolveUser(['admin', 'deputy'])).toEqual({ status: 'forbidden' });
  });

  it('returns only what callers need when allowed', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'deputy' }));
    expect(await resolveUser(['admin', 'deputy'])).toEqual({
      status: 'ok',
      user: { id: 'u-1', clerkId: 'clerk_1', role: 'deputy', schoolId: 'school-A' },
    });
  });
});

describe('requireUser (API routes)', () => {
  it('answers 401 for no session', async () => {
    authMock.mockResolvedValue({ userId: null });
    const r = await requireUser();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it('answers an identical 403 body for every kind of refusal (no account enumeration)', async () => {
    const bodies: unknown[] = [];
    for (const row of [
      null,
      dbUser({ isActive: false }),
      dbUser({ deletedAt: new Date() }),
      dbUser({ role: 'parent' }),
    ]) {
      authMock.mockResolvedValue({ userId: 'clerk_1' });
      findUnique.mockResolvedValue(row);
      const r = await requireUser(['admin']);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.response.status).toBe(403);
        bodies.push(await r.response.json());
      }
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  it('returns the user when allowed', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser());
    const r = await requireUser(['admin']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.schoolId).toBe('school-A');
  });
});

describe('requirePageUser (server components)', () => {
  it('redirects anonymous visitors to /login', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(requirePageUser(['deputy'])).rejects.toThrow('REDIRECT:/login');
  });

  it('redirects signed-in but unauthorised users to /unauthorized', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'parent' }));
    await expect(requirePageUser(['deputy', 'admin'])).rejects.toThrow('REDIRECT:/unauthorized');
  });

  it('returns the user when allowed', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'deputy' }));
    const user = await requirePageUser(['deputy', 'admin']);
    expect(user.role).toBe('deputy');
  });
});

describe('requireTeacher / requirePageTeacher (FEAT-01: the teacher record is keyed by the internal user id, never the Clerk id)', () => {
  const teacherRow = {
    id: 't-1',
    schoolId: 'school-A',
    isClassTeacher: true,
    classTeacherStreamId: 'st-1',
  };

  it('401 anonymous; 403 for non-teacher roles and deactivated teachers', async () => {
    authMock.mockResolvedValue({ userId: null });
    const r1 = await requireTeacher();
    expect(!r1.ok && r1.response.status).toBe(401);

    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'parent' }));
    const r2 = await requireTeacher();
    expect(!r2.ok && r2.response.status).toBe(403);

    findUnique.mockResolvedValue(dbUser({ role: 'teacher', isActive: false }));
    const r3 = await requireTeacher();
    expect(!r3.ok && r3.response.status).toBe(403);
    expect(teacherFindFirst).not.toHaveBeenCalled();
  });

  it('finds the teacher by the internal user UUID inside the school', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'teacher' }));
    teacherFindFirst.mockResolvedValue(teacherRow);
    const r = await requireTeacher();
    expect(r.ok).toBe(true);
    expect(teacherFindFirst.mock.calls[0][0].where).toEqual({
      userId: 'u-1',
      schoolId: 'school-A',
    });
    if (r.ok) expect(r.teacher).toEqual(teacherRow);
  });

  it('403 when the user has the teacher role but no teacher record', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'teacher' }));
    teacherFindFirst.mockResolvedValue(null);
    const r = await requireTeacher();
    expect(!r.ok && r.response.status).toBe(403);
  });

  it('page variant redirects instead (login / unauthorized) and returns both records when allowed', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(requirePageTeacher()).rejects.toThrow('REDIRECT:/login');

    authMock.mockResolvedValue({ userId: 'clerk_1' });
    findUnique.mockResolvedValue(dbUser({ role: 'teacher' }));
    teacherFindFirst.mockResolvedValue(null);
    await expect(requirePageTeacher()).rejects.toThrow('REDIRECT:/unauthorized');

    teacherFindFirst.mockResolvedValue(teacherRow);
    const { user, teacher } = await requirePageTeacher();
    expect(user.role).toBe('teacher');
    expect(teacher.id).toBe('t-1');
  });
});
