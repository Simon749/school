import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const studentFindFirst = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    student: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
  },
}));

import { GET } from '@/app/api/students/[id]/route';

const call = () =>
  GET(new Request('http://x/api/students/s-1') as never, { params: { id: 's-1' } });

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
  authMock.mockReset();
  userFindUnique.mockReset();
  studentFindFirst.mockReset();
  studentFindFirst.mockResolvedValue({ id: 's-1', firstName: 'Amara' });
});

/** Collect every key path that a Prisma `select` asks for. */
function selectedPaths(sel: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(sel).flatMap(([k, v]) => {
    if (v === true) return [prefix + k];
    if (v && typeof v === 'object') {
      const inner = (v as { select?: Record<string, unknown> }).select;
      return inner ? selectedPaths(inner, prefix + k + '.') : [prefix + k];
    }
    return [];
  });
}

describe('GET /api/students/[id] (SEC-02): the full profile is admin-only', () => {
  it.each(['parent', 'teacher', 'bursar', 'deputy', 'it_admin'])(
    'refuses role %s with 403 and never touches the student table',
    async (role) => {
      signedInAs(role);
      const res = await call();
      expect(res.status).toBe(403);
      expect(studentFindFirst).not.toHaveBeenCalled();
    }
  );

  it('refuses anonymous callers with 401', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await call()).status).toBe(401);
    expect(studentFindFirst).not.toHaveBeenCalled();
  });

  it('refuses a deactivated admin (SEC-21)', async () => {
    signedInAs('admin', { isActive: false });
    expect((await call()).status).toBe(403);
    expect(studentFindFirst).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller's school and excludes soft-deleted students", async () => {
    signedInAs('admin');
    await call();
    expect(studentFindFirst.mock.calls[0][0].where).toEqual({
      id: 's-1',
      schoolId: 'school-A',
      deletedAt: null,
    });
  });

  it('uses an explicit field whitelist, never `include` (no whole rows)', async () => {
    signedInAs('admin');
    await call();
    const args = studentFindFirst.mock.calls[0][0];
    expect(args.include).toBeUndefined();
    expect(args.select).toBeDefined();
  });

  it('does not select guardian email, national ID, Clerk ID or any other guardian-account field', async () => {
    signedInAs('admin');
    await call();
    const paths = selectedPaths(studentFindFirst.mock.calls[0][0].select);
    const guardianUser = paths.filter((p) => p.startsWith('guardians.user.'));
    expect(guardianUser.sort()).toEqual([
      'guardians.user.firstName',
      'guardians.user.lastName',
      'guardians.user.phone',
    ]);
  });

  it('selects exactly the student fields the admin profile page uses', async () => {
    signedInAs('admin');
    await call();
    const paths = selectedPaths(studentFindFirst.mock.calls[0][0].select).filter(
      (p) => !p.startsWith('guardians.')
    );
    expect(paths.sort()).toEqual(
      [
        'admissionNumber',
        'dateOfBirth',
        'firstName',
        'gender',
        'id',
        'isBoarding',
        'lastName',
        'medicalNotes',
        'nemisNumber',
        'photoUrl',
        'previousSchool',
        'status',
        'stream.capacity',
        'stream.grade.name',
        'stream.name',
      ].sort()
    );
  });

  it('only returns active guardians', async () => {
    signedInAs('admin');
    await call();
    expect(studentFindFirst.mock.calls[0][0].select.guardians.where).toEqual({ isActive: true });
  });

  it("answers 404 (not 403) for a student that is not in the caller's school", async () => {
    signedInAs('admin');
    studentFindFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });
});
