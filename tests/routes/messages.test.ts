import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const userFindFirst = vi.fn();
const schoolFindUnique = vi.fn();
const guardianFindFirst = vi.fn();
const guardianFindMany = vi.fn();
const teacherFindFirst = vi.fn();
const slotFindMany = vi.fn();
const messageCreate = vi.fn();
const messageFindMany = vi.fn();
const messageCount = vi.fn();
const smsAdd = vi.fn();
const notifAdd = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/queue', () => ({
  smsQueue: { add: (...a: unknown[]) => smsAdd(...a) },
  notificationQueue: { add: (...a: unknown[]) => notifAdd(...a) },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      findFirst: (...a: unknown[]) => userFindFirst(...a),
    },
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    guardian: {
      findFirst: (...a: unknown[]) => guardianFindFirst(...a),
      findMany: (...a: unknown[]) => guardianFindMany(...a),
    },
    teacher: { findFirst: (...a: unknown[]) => teacherFindFirst(...a) },
    timetableSlot: { findMany: (...a: unknown[]) => slotFindMany(...a) },
    message: {
      create: (...a: unknown[]) => messageCreate(...a),
      findMany: (...a: unknown[]) => messageFindMany(...a),
      count: (...a: unknown[]) => messageCount(...a),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { GET, POST } from '@/app/api/messages/route';

const RECIPIENT = '33333333-3333-4333-8333-333333333333';
const STREAM = '44444444-4444-4444-8444-444444444444';

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/messages', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
  );

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

let counter = 0;
beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    userFindFirst,
    schoolFindUnique,
    guardianFindFirst,
    guardianFindMany,
    teacherFindFirst,
    slotFindMany,
    messageCreate,
    messageFindMany,
    messageCount,
    smsAdd,
    notifAdd,
    logAudit,
  ])
    m.mockReset();
  counter = 0;
  userFindFirst.mockResolvedValue({ id: RECIPIENT }); // recipient is an active user in the school
  schoolFindUnique.mockResolvedValue({ smsBalance: 1000 });
  messageCreate.mockImplementation(
    async ({ data }: { data: { recipientId: string; body: string; subject?: string } }) => ({
      id: `m-${++counter}`,
      ...data,
    })
  );
  guardianFindMany.mockResolvedValue([]);
  guardianFindFirst.mockResolvedValue(null);
  teacherFindFirst.mockResolvedValue(null);
  slotFindMany.mockResolvedValue([]);
});

const nothingSent = () => {
  expect(messageCreate).not.toHaveBeenCalled();
  expect(smsAdd).not.toHaveBeenCalled();
  expect(notifAdd).not.toHaveBeenCalled();
};

const direct = { recipientId: RECIPIENT, body: 'Hello', messageType: 'direct' };

describe('POST /api/messages: who may send (SEC-08)', () => {
  it('401 when anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post(direct)).status).toBe(401);
    nothingSent();
  });

  it('403 for a deactivated user (SEC-21)', async () => {
    signedInAs('admin', { isActive: false });
    expect((await post(direct)).status).toBe(403);
    nothingSent();
  });

  // Tracker 3.5 defines admin, teacher and parent messaging only; deputy/bursar/it_admin are undecided (D18).
  it.each(['deputy', 'bursar', 'it_admin'])(
    '403 for role %s (not defined in tracker 3.5; D18)',
    async (role) => {
      signedInAs(role);
      expect((await post(direct)).status).toBe(403);
      nothingSent();
    }
  );

  describe('parents', () => {
    it.each(['class', 'school_wide'])('cannot send a %s broadcast', async (messageType) => {
      signedInAs('parent');
      expect((await post({ body: 'x', messageType, streamId: STREAM })).status).toBe(403);
      nothingSent();
    });

    it("cannot spend the school's SMS balance", async () => {
      signedInAs('parent');
      expect((await post({ ...direct, sendViaSms: true })).status).toBe(403);
      nothingSent();
    });

    it('can message the CLASS TEACHER of their own child', async () => {
      signedInAs('parent');
      guardianFindMany.mockResolvedValue([{ student: { streamId: 'stream-7A' } }]);
      teacherFindFirst.mockResolvedValue({ id: 't-1' });
      expect((await post(direct)).status).toBe(201);
      expect(teacherFindFirst.mock.calls[0][0].where).toMatchObject({
        userId: RECIPIENT,
        schoolId: 'school-A',
        isClassTeacher: true,
        classTeacherStreamId: { in: ['stream-7A'] },
      });
      expect(guardianFindMany.mock.calls[0][0].where).toMatchObject({
        userId: 'u-1',
        isActive: true,
      });
    });

    it('cannot message any other user (subject teacher, another parent, admin...)', async () => {
      signedInAs('parent');
      guardianFindMany.mockResolvedValue([{ student: { streamId: 'stream-7A' } }]);
      teacherFindFirst.mockResolvedValue(null);
      expect((await post(direct)).status).toBe(403);
      nothingSent();
    });
  });

  describe('teachers', () => {
    it.each(['class', 'school_wide'])('cannot send a %s broadcast', async (messageType) => {
      signedInAs('teacher');
      expect((await post({ body: 'x', messageType, streamId: STREAM })).status).toBe(403);
      nothingSent();
    });

    it('can message a guardian of a student in a stream they teach or class-teach', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({ id: 't-1', classTeacherStreamId: 'stream-7A' });
      slotFindMany.mockResolvedValue([{ streamId: 'stream-8B' }, { streamId: 'stream-7A' }]);
      guardianFindFirst.mockResolvedValue({ id: 'g-1' });
      expect((await post(direct)).status).toBe(201);
      const where = guardianFindFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({ userId: RECIPIENT, isActive: true });
      expect(where.student).toMatchObject({ schoolId: 'school-A', deletedAt: null });
      expect(where.student.streamId.in.sort()).toEqual(['stream-7A', 'stream-8B']);
    });

    it('cannot message a parent whose children are not in their classes', async () => {
      signedInAs('teacher');
      teacherFindFirst.mockResolvedValue({ id: 't-1', classTeacherStreamId: null });
      slotFindMany.mockResolvedValue([{ streamId: 'stream-8B' }]);
      guardianFindFirst.mockResolvedValue(null);
      expect((await post(direct)).status).toBe(403);
      nothingSent();
    });
  });

  describe('admins', () => {
    it('can message any active user in their own school', async () => {
      signedInAs('admin');
      expect((await post(direct)).status).toBe(201);
      expect(userFindFirst.mock.calls[0][0].where).toMatchObject({
        id: RECIPIENT,
        schoolId: 'school-A',
        isActive: true,
        deletedAt: null,
      });
    });

    it('cannot message a user from another school or an inactive user', async () => {
      signedInAs('admin');
      userFindFirst.mockResolvedValue(null);
      expect((await post(direct)).status).toBe(403);
      nothingSent();
    });
  });
});

describe('POST /api/messages: correctness', () => {
  it('sends a broadcast ONCE per parent even when they have several children in scope', async () => {
    signedInAs('admin');
    guardianFindMany.mockResolvedValue([{ userId: 'p-1' }, { userId: 'p-1' }, { userId: 'p-2' }]);
    const res = await post({ body: 'Closed Friday', messageType: 'school_wide', sendViaSms: true });
    expect(res.status).toBe(201);
    expect((await res.json()).count).toBe(2);
    expect(messageCreate).toHaveBeenCalledTimes(2);
    expect(smsAdd.mock.calls[0][1].messageIds).toHaveLength(2);
  });

  it("scopes class and school-wide recipients to the sender's school (and active guardians)", async () => {
    signedInAs('admin');
    guardianFindMany.mockResolvedValue([{ userId: 'p-1' }]);
    await post({ body: 'x', messageType: 'class', streamId: STREAM });
    expect(guardianFindMany.mock.calls[0][0].where).toMatchObject({
      isActive: true,
      student: { streamId: STREAM, schoolId: 'school-A', status: 'active' },
    });
  });

  it('charges the SMS balance check on UNIQUE recipients', async () => {
    signedInAs('admin');
    schoolFindUnique.mockResolvedValue({ smsBalance: 2 });
    guardianFindMany.mockResolvedValue([{ userId: 'p-1' }, { userId: 'p-1' }]);
    expect((await post({ body: 'x', messageType: 'school_wide', sendViaSms: true })).status).toBe(
      201
    );
  });

  it('refuses (400) when the SMS balance is insufficient, and sends nothing', async () => {
    signedInAs('admin');
    schoolFindUnique.mockResolvedValue({ smsBalance: 1 });
    guardianFindMany.mockResolvedValue([{ userId: 'p-1' }, { userId: 'p-2' }]);
    const res = await post({ body: 'x', messageType: 'school_wide', sendViaSms: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ required: 2, available: 1 });
    nothingSent();
  });

  it('refuses (400) a broadcast with no recipients instead of reporting success', async () => {
    signedInAs('admin');
    guardianFindMany.mockResolvedValue([]);
    expect((await post({ body: 'x', messageType: 'class', streamId: STREAM })).status).toBe(400);
    nothingSent();
  });

  it("validates input: bad JSON, class without stream, direct without recipient, 'automated' from clients", async () => {
    signedInAs('admin');
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ body: 'x', messageType: 'class' })).status).toBe(400);
    expect((await post({ body: 'x', messageType: 'direct' })).status).toBe(400);
    expect(
      (await post({ body: 'x', messageType: 'automated', recipientId: RECIPIENT })).status
    ).toBe(400);
    nothingSent();
  });

  it('audits broadcasts (who, school, how many)', async () => {
    signedInAs('admin');
    guardianFindMany.mockResolvedValue([{ userId: 'p-1' }, { userId: 'p-2' }]);
    await post({ body: 'x', messageType: 'school_wide' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'message.broadcast',
        newData: expect.objectContaining({ recipientCount: 2, messageType: 'school_wide' }),
      })
    );
  });

  it('queues an in-app notification per message', async () => {
    signedInAs('admin');
    expect((await post(direct)).status).toBe(201);
    expect(notifAdd).toHaveBeenCalledTimes(1);
    expect(notifAdd.mock.calls[0][1]).toMatchObject({ userId: RECIPIENT, type: 'message' });
  });
});

describe('GET /api/messages', () => {
  const get = (qs = '') => GET(new Request(`http://x/api/messages${qs}`) as never);

  it('401 when anonymous, 403 when deactivated', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await get()).status).toBe(401);
    signedInAs('parent', { isActive: false });
    expect((await get()).status).toBe(403);
  });

  it("returns only the caller's own messages in their school", async () => {
    signedInAs('parent');
    messageFindMany.mockResolvedValue([]);
    messageCount.mockResolvedValue(0);
    await get();
    expect(messageFindMany.mock.calls[0][0].where).toMatchObject({
      schoolId: 'school-A',
      recipientId: 'u-1',
    });
  });

  it('clamps page and limit (no 100000-row dumps, no NaN)', async () => {
    signedInAs('parent');
    messageFindMany.mockResolvedValue([]);
    messageCount.mockResolvedValue(0);
    await get('?limit=100000&page=abc');
    const args = messageFindMany.mock.calls[0][0];
    expect(args.take).toBe(100);
    expect(args.skip).toBe(0);
    await get('?limit=-5&page=0');
    const args2 = messageFindMany.mock.calls[1][0];
    expect(args2.take).toBe(20);
    expect(args2.skip).toBe(0);
  });
});
