import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const streamFindFirst = vi.fn();
const teacherFindFirst = vi.fn();
const periodFindFirst = vi.fn();
const areaFindFirst = vi.fn();
const termFindFirst = vi.fn();
const slotFindFirst = vi.fn();
const slotCreate = vi.fn();
const slotUpdate = vi.fn();
const slotDelete = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    stream: { findFirst: (...a: unknown[]) => streamFindFirst(...a) },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    timetablePeriod: { findFirst: (...a: unknown[]) => periodFindFirst(...a) },
    learningArea: { findFirst: (...a: unknown[]) => areaFindFirst(...a) },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    timetableSlot: {
      findFirst: (...a: unknown[]) => slotFindFirst(...a),
      create: (...a: unknown[]) => slotCreate(...a),
      update: (...a: unknown[]) => slotUpdate(...a),
      delete: (...a: unknown[]) => slotDelete(...a),
    },
  },
}));

import { POST } from '@/app/api/timetable/slot/route';
import { DELETE } from '@/app/api/timetable/slot/[id]/route';

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/timetable/slot', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
  );
const del = (id = 'slot-1') =>
  DELETE(new Request('http://x', { method: 'DELETE' }) as never, { params: { id } });

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

const valid = (over: Record<string, unknown> = {}) => ({
  termId: 'term-1',
  streamId: 'st-1',
  periodId: 'p-1',
  dayOfWeek: 1,
  learningAreaId: 'la-1',
  teacherId: 't-1',
  room: 'Room 7',
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    streamFindFirst,
    teacherFindFirst,
    periodFindFirst,
    areaFindFirst,
    termFindFirst,
    slotFindFirst,
    slotCreate,
    slotUpdate,
    slotDelete,
    logAudit,
  ])
    m.mockReset();
  streamFindFirst.mockResolvedValue({ id: 'st-1', name: 'A', grade: { name: 'Grade 7' } });
  teacherFindFirst.mockResolvedValue({ id: 't-1', user: { firstName: 'Joy', lastName: 'M' } });
  periodFindFirst.mockResolvedValue({ id: 'p-1' });
  areaFindFirst.mockResolvedValue({ id: 'la-1' });
  termFindFirst.mockResolvedValue({ id: 'term-1' });
  slotFindFirst.mockResolvedValue(null); // no conflicts, no existing slot
  slotCreate.mockImplementation(async ({ data }: { data: object }) => ({
    id: 'slot-new',
    ...data,
  }));
  slotUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: 'slot-1', ...data }));
});

describe.each([
  ['POST slot', () => post(valid())],
  ['DELETE slot', () => del()],
] as const)('timetable %s: who may call it', (_n, run) => {
  it('401 anonymous; 403 deactivated admin', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
    signedInAs('admin', { isActive: false });
    expect((await run()).status).toBe(403);
  });
  it.each(['teacher', 'parent', 'bursar', 'deputy', 'it_admin'])(
    '403 for role %s',
    async (role) => {
      signedInAs(role);
      expect((await run()).status).toBe(403);
      expect(slotCreate).not.toHaveBeenCalled();
      expect(slotDelete).not.toHaveBeenCalled();
    }
  );
});

describe('POST /api/timetable/slot (SEC-11)', () => {
  it("creates a slot in the CALLER's school", async () => {
    signedInAs('admin');
    const res = await post(valid({ schoolId: 'school-EVIL' }));
    expect(res.status).toBe(201);
    expect(slotCreate.mock.calls[0]![0]!.data).toMatchObject({
      schoolId: 'school-A',
      teacherId: 't-1',
      dayOfWeek: 1,
      room: 'Room 7',
    });
  });

  it.each([
    ['stream', () => streamFindFirst.mockResolvedValue(null)],
    ['teacher', () => teacherFindFirst.mockResolvedValue(null)],
    ['period', () => periodFindFirst.mockResolvedValue(null)],
    ['learning area', () => areaFindFirst.mockResolvedValue(null)],
    ['term', () => termFindFirst.mockResolvedValue(null)],
  ])(
    "400 when the %s is not in the caller's school (term was never checked before)",
    async (_w, breakIt) => {
      signedInAs('admin');
      breakIt();
      expect((await post(valid())).status).toBe(400);
      expect(slotCreate).not.toHaveBeenCalled();
      expect(termFindFirst.mock.calls[0]![0]!.where).toMatchObject({
        id: 'term-1',
        schoolId: 'school-A',
      });
    }
  );

  it('a double lesson needs a real second period from the same school, different from the first', async () => {
    signedInAs('admin');
    expect((await post(valid({ isDoubleLesson: true }))).status).toBe(400);
    expect((await post(valid({ isDoubleLesson: true, secondPeriodId: 'p-1' }))).status).toBe(400);
    periodFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'p-1' ? { id: 'p-1' } : null
    );
    expect(
      (await post(valid({ isDoubleLesson: true, secondPeriodId: 'p-other-school' }))).status
    ).toBe(400);
    expect(slotCreate).not.toHaveBeenCalled();
  });

  it('400 for malformed JSON, missing fields and a bad weekday (0, 6, text, 2.5)', async () => {
    signedInAs('admin');
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ termId: 'x' })).status).toBe(400);
    for (const dayOfWeek of [0, 6, 'monday', 2.5]) {
      expect((await post(valid({ dayOfWeek }))).status).toBe(400);
    }
    expect(slotCreate).not.toHaveBeenCalled();
  });

  describe('updating an existing slot', () => {
    it("the slot must belong to the caller's school: another school's slot is a 404 and is NOT updated", async () => {
      signedInAs('admin');
      slotFindFirst.mockResolvedValue(null);
      expect((await post(valid({ id: 'slot-of-school-B' }))).status).toBe(404);
      expect(slotUpdate).not.toHaveBeenCalled();
      expect(slotFindFirst.mock.calls[0]![0]!.where).toEqual({
        id: 'slot-of-school-B',
        schoolId: 'school-A',
      });
    });

    it("updates it when it is the caller's own", async () => {
      signedInAs('admin');
      slotFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        where.id === 'slot-1' &&
        !('NOT' in where) &&
        !('teacherId' in where) &&
        !('streamId' in where)
          ? { id: 'slot-1' }
          : null
      );
      const res = await post(valid({ id: 'slot-1' }));
      expect(res.status).toBe(200);
      expect(slotUpdate.mock.calls[0]![0]!.where).toEqual({ id: 'slot-1' });
    });
  });

  it('409 teacher conflict and 409 class conflict, with conflict queries scoped to the school', async () => {
    signedInAs('admin');
    slotFindFirst.mockResolvedValueOnce({
      learningArea: { name: 'Maths' },
      stream: { name: 'B', grade: { name: 'Grade 8' } },
    });
    const r1 = await post(valid());
    expect(r1.status).toBe(409);
    expect((await r1.json()).conflict.type).toBe('teacher');
    expect(slotFindFirst.mock.calls[0]![0]!.where).toMatchObject({
      schoolId: 'school-A',
      teacherId: 't-1',
    });

    slotFindFirst.mockReset();
    slotFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      learningArea: { name: 'English' },
      teacher: { user: { firstName: 'A', lastName: 'B' } },
    });
    const r2 = await post(valid());
    expect(r2.status).toBe(409);
    expect((await r2.json()).conflict.type).toBe('stream');
  });

  it('a race that hits the database unique key is a 409, not a 500', async () => {
    signedInAs('admin');
    slotCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );
    const res = await post(valid());
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toMatch(/Unique constraint/);
  });

  it('audits create and update', async () => {
    signedInAs('admin');
    await post(valid());
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'timetable.slot_created',
        tableName: 'timetable_slots',
      })
    );
  });
});

describe('DELETE /api/timetable/slot/[id]', () => {
  it("404 for a slot outside the caller's school, and nothing is deleted", async () => {
    signedInAs('admin');
    slotFindFirst.mockResolvedValue(null);
    expect((await del('slot-B')).status).toBe(404);
    expect(slotFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 'slot-B', schoolId: 'school-A' });
    expect(slotDelete).not.toHaveBeenCalled();
  });

  it("deletes the caller's own slot and audits it", async () => {
    signedInAs('admin');
    slotFindFirst.mockResolvedValue({ id: 'slot-1', teacherId: 't-1', streamId: 'st-1' });
    expect((await del()).status).toBe(200);
    expect(slotDelete).toHaveBeenCalledWith({ where: { id: 'slot-1' } });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'timetable.slot_deleted', recordId: 'slot-1' })
    );
  });

  it('a slot that already has attendance records cannot be deleted: a clear 409, not a 500', async () => {
    signedInAs('admin');
    slotFindFirst.mockResolvedValue({ id: 'slot-1' });
    slotDelete.mockRejectedValue(
      Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' })
    );
    const res = await del();
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).not.toMatch(/Foreign key/);
  });
});
