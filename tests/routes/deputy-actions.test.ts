import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const slotFindFirst = vi.fn();
const teacherFindFirst = vi.fn();
const attFindUnique = vi.fn();
const attUpsert = vi.fn();
const logAudit = vi.fn();
const revalidatePath = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirectMock(u) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    timetableSlot: { findFirst: (...a: unknown[]) => slotFindFirst(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    teacherAttendance: {
      findUnique: (...a: unknown[]) => attFindUnique(...a),
      upsert: (...a: unknown[]) => attUpsert(...a),
    },
  },
}));

import { assignSubstituteAction } from '@/app/actions/deputy-actions';

const signedInAs = (role: string, over: Record<string, unknown> = {}) => {
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  userFindUnique.mockResolvedValue({
    id: 'actor-1',
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
    slotFindFirst,
    teacherFindFirst,
    attFindUnique,
    attUpsert,
    logAudit,
    revalidatePath,
    redirectMock,
  ])
    m.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  slotFindFirst.mockResolvedValue({ id: 'slot-1', teacherId: 't-absent', schoolId: 'school-A' });
  teacherFindFirst.mockResolvedValue({ id: 't-sub', schoolId: 'school-A' });
  attFindUnique.mockResolvedValue(null);
  attUpsert.mockResolvedValue({ id: 'att-1' });
});

const noWrites = () => {
  expect(attUpsert).not.toHaveBeenCalled();
  expect(logAudit).not.toHaveBeenCalled();
};

describe('assignSubstituteAction (SEC-09): was an unauthenticated inline server action', () => {
  it('sends anonymous callers to /login and writes nothing', async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(assignSubstituteAction('slot-1', 't-sub')).rejects.toThrow('REDIRECT:/login');
    expect(slotFindFirst).not.toHaveBeenCalled();
    noWrites();
  });

  it.each(['parent', 'teacher', 'bursar', 'it_admin'])(
    'refuses role %s and writes nothing',
    async (role) => {
      signedInAs(role);
      await expect(assignSubstituteAction('slot-1', 't-sub')).rejects.toThrow(
        'REDIRECT:/unauthorized'
      );
      expect(slotFindFirst).not.toHaveBeenCalled();
      noWrites();
    }
  );

  it('refuses a deactivated deputy (SEC-21)', async () => {
    signedInAs('deputy', { isActive: false });
    await expect(assignSubstituteAction('slot-1', 't-sub')).rejects.toThrow(
      'REDIRECT:/unauthorized'
    );
    noWrites();
  });

  it("looks the slot and the substitute up INSIDE the caller's school", async () => {
    signedInAs('deputy');
    await assignSubstituteAction('slot-1', 't-sub');
    expect(slotFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 'slot-1', schoolId: 'school-A' });
    expect(teacherFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 't-sub', schoolId: 'school-A' });
  });

  it('rejects a slot from another school', async () => {
    signedInAs('deputy');
    slotFindFirst.mockResolvedValue(null);
    await expect(assignSubstituteAction('slot-other', 't-sub')).rejects.toThrow(/not found/i);
    noWrites();
  });

  it('rejects a substitute from another school', async () => {
    signedInAs('deputy');
    teacherFindFirst.mockResolvedValue(null);
    await expect(assignSubstituteAction('slot-1', 't-other')).rejects.toThrow(/not found/i);
    noWrites();
  });

  it('rejects assigning the absent teacher as their own substitute', async () => {
    signedInAs('deputy');
    teacherFindFirst.mockResolvedValue({ id: 't-absent', schoolId: 'school-A' });
    await expect(assignSubstituteAction('slot-1', 't-absent')).rejects.toThrow(/own substitute/i);
    noWrites();
  });

  it.each(['present', 'late'])(
    'refuses to mark a lesson covered when the teacher already checked in (%s)',
    async (status) => {
      signedInAs('deputy');
      attFindUnique.mockResolvedValue({ id: 'att-9', status });
      await expect(assignSubstituteAction('slot-1', 't-sub')).rejects.toThrow(/already/i);
      noWrites();
    }
  );

  it("records the cover for the CALLER's school, audits it, and refreshes the page", async () => {
    signedInAs('admin');
    await assignSubstituteAction('slot-1', 't-sub');

    const arg = attUpsert.mock.calls[0]![0]!;
    expect(arg.where.teacherId_slotId_date).toMatchObject({
      teacherId: 't-absent',
      slotId: 'slot-1',
    });
    expect(arg.create).toMatchObject({
      schoolId: 'school-A',
      teacherId: 't-absent',
      slotId: 'slot-1',
      status: 'covered',
      substituteTeacherId: 't-sub',
    });
    expect(arg.update).toMatchObject({ status: 'covered', substituteTeacherId: 't-sub' });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'actor-1',
        action: 'teacher_attendance.cover_assigned',
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/deputy/uncovered-lessons');
  });

  it("can convert an existing 'absent' record into 'covered' (upsert, not a crashing create)", async () => {
    signedInAs('deputy');
    attFindUnique.mockResolvedValue({ id: 'att-2', status: 'absent' });
    await assignSubstituteAction('slot-1', 't-sub');
    expect(attUpsert).toHaveBeenCalledTimes(1);
  });
});
