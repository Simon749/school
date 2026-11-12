import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const userCreate = vi.fn();
const userUpdate = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      create: (...a: unknown[]) => userCreate(...a),
      update: (...a: unknown[]) => userUpdate(...a),
    },
  },
}));

import * as actions from '@/app/actions/it-admin-actions';
import {
  createUserAction,
  importStudentsAction,
  updateUserAction,
} from '@/app/actions/it-admin-actions';

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
const data = (over: Record<string, unknown> = {}) => ({
  firstName: 'Joy',
  lastName: 'Mwangi',
  email: 'joy@school.ke',
  phone: '254712345678',
  role: 'teacher' as const,
  nationalId: '12345678',
  ...over,
});

beforeEach(() => {
  for (const m of [authMock, userFindUnique, userFindFirst, userCreate, userUpdate, logAudit])
    m.mockReset();
  userCreate.mockResolvedValue({ id: 'u-new' });
  userUpdate.mockResolvedValue({ id: 'u-9' });
  userFindFirst.mockResolvedValue({ id: 'u-9', role: 'teacher' });
});

describe.each([
  ['createUserAction', () => createUserAction(data())],
  ['updateUserAction', () => updateUserAction('u-9', data())],
] as const)('%s: who may use it', (_n, run) => {
  it('is refused (returns an error, no throw, no write) for anonymous, deactivated and non-IT-admin callers', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect(await run()).toEqual({ error: 'You are not allowed to do this.' });
    signedInAs('it_admin', { isActive: false });
    expect(await run()).toEqual({ error: 'You are not allowed to do this.' });
    for (const role of ['admin', 'bursar', 'deputy', 'teacher', 'parent']) {
      signedInAs(role);
      expect(await run()).toEqual({ error: 'You are not allowed to do this.' });
    }
    expect(userCreate).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe('createUserAction (SEC-11 / SEC-12; decision D7)', () => {
  it("creates the user in the CALLER'S school: there is no schoolId argument any more", async () => {
    signedInAs('it_admin');
    expect(createUserAction.length).toBe(1);
    expect(await createUserAction(data())).toEqual({ success: true });
    expect(userCreate.mock.calls[0]![0]!.data).toMatchObject({
      schoolId: 'school-A',
      role: 'teacher',
      email: 'joy@school.ke',
    });
    expect('clerkId' in userCreate.mock.calls[0]![0]!.data).toBe(false);
  });

  it.each(['admin', 'bursar', 'it_admin'])(
    "refuses to create a %s (privileged roles are not an IT admin's to hand out)",
    async (role) => {
      signedInAs('it_admin');
      const out = await createUserAction(data({ role }) as never);
      expect(out.error).toMatch(/role/i);
      expect(userCreate).not.toHaveBeenCalled();
    }
  );

  it.each(['deputy', 'teacher', 'parent'])('may create a %s', async (role) => {
    signedInAs('it_admin');
    expect(await createUserAction(data({ role }) as never)).toEqual({ success: true });
  });

  it('rejects invalid input without writing', async () => {
    signedInAs('it_admin');
    expect((await createUserAction(data({ email: 'not-an-email' }))).error).toBeTruthy();
    expect((await createUserAction(data({ firstName: 'J' }))).error).toBeTruthy();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('audits creation (role and school, not personal details)', async () => {
    signedInAs('it_admin');
    await createUserAction(data());
    const audit = logAudit.mock.calls[0]![0]!;
    expect(audit).toMatchObject({
      schoolId: 'school-A',
      actorId: 'u-1',
      action: 'user.created',
      tableName: 'users',
      recordId: 'u-new',
    });
    expect(JSON.stringify(audit)).not.toMatch(/12345678|joy@school\.ke|254712345678/);
  });

  it('duplicate email/phone/ID gives a friendly message; other failures never leak the raw error', async () => {
    signedInAs('it_admin');
    userCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed on (email)'), { code: 'P2002' })
    );
    expect((await createUserAction(data())).error).toMatch(/already exists/i);
    userCreate.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.3.7:5432'));
    const out = await createUserAction(data());
    expect(out.error).toBeTruthy();
    expect(out.error).not.toMatch(/ECONNREFUSED|10\.0\.3\.7/);
  });
});

describe('updateUserAction (SEC-11 / SEC-12)', () => {
  it("only touches a user of the caller's school (another school's user: 'not found', nothing updated)", async () => {
    signedInAs('it_admin');
    userFindFirst.mockResolvedValue(null);
    expect((await updateUserAction('u-of-school-B', data())).error).toMatch(/not found/i);
    expect(userFindFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'u-of-school-B',
      schoolId: 'school-A',
      deletedAt: null,
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it.each(['admin', 'bursar', 'it_admin'])(
    'cannot edit an existing %s account (including promoting or demoting them)',
    async (current) => {
      signedInAs('it_admin');
      userFindFirst.mockResolvedValue({ id: 'u-9', role: current });
      expect((await updateUserAction('u-9', data())).error).toMatch(
        /not allowed|privileged|cannot/i
      );
      expect(userUpdate).not.toHaveBeenCalled();
    }
  );

  it.each(['admin', 'bursar', 'it_admin'])('cannot promote a teacher to %s', async (role) => {
    signedInAs('it_admin');
    expect((await updateUserAction('u-9', data({ role }) as never)).error).toMatch(/role/i);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('updates a manageable user, and audits the role change', async () => {
    signedInAs('it_admin');
    userFindFirst.mockResolvedValue({ id: 'u-9', role: 'teacher' });
    expect(await updateUserAction('u-9', data({ role: 'deputy' }) as never)).toEqual({
      success: true,
    });
    expect(userUpdate.mock.calls[0]![0]!.where).toEqual({ id: 'u-9' });
    expect(userUpdate.mock.calls[0]![0]!.data).toMatchObject({ role: 'deputy' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'user.updated',
        recordId: 'u-9',
        oldData: { role: 'teacher' },
        newData: { role: 'deputy' },
      })
    );
  });
});

describe('the mocked actions (FEAT-04): never report success for work that was not done', () => {
  it('importStudentsAction says plainly that it is not available yet', async () => {
    signedInAs('it_admin');
    const out = await importStudentsAction([{}, {}, {}]);
    expect(out.error).toMatch(/not available yet/i);
    expect((out as { success?: boolean }).success).toBeUndefined();
    expect((out as { count?: number }).count).toBeUndefined();
  });

  it('exportDataAction (a fake-URL mock nobody called) no longer exists', () => {
    expect('exportDataAction' in actions).toBe(false);
  });
});
