import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const userUpsert = vi.fn();
const schoolFindUnique = vi.fn();
const schoolUpdate = vi.fn();
const schoolCreate = vi.fn();
const gradeFindFirst = vi.fn();
const gradeCreate = vi.fn();
const streamUpsert = vi.fn();
const txSchoolUpdate = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      upsert: (...a: unknown[]) => userUpsert(...a),
    },
    school: {
      findUnique: (...a: unknown[]) => schoolFindUnique(...a),
      update: (...a: unknown[]) => schoolUpdate(...a),
      create: (...a: unknown[]) => schoolCreate(...a),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        grade: {
          findFirst: (...a: unknown[]) => gradeFindFirst(...a),
          create: (...a: unknown[]) => gradeCreate(...a),
        },
        stream: { upsert: (...a: unknown[]) => streamUpsert(...a) },
        school: { update: (...a: unknown[]) => txSchoolUpdate(...a) },
      }),
  },
}));

import { POST as step1 } from '@/app/api/onboarding/step-1/route';
import { POST as step4 } from '@/app/api/onboarding/step-4/route';

const req = (body: unknown) =>
  new Request('http://x/api/onboarding', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never;

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

const identity = (over: Record<string, unknown> = {}) => ({
  name: 'Test School',
  county: 'Nairobi',
  subCounty: 'Westlands',
  phone: '254712345678',
  email: 'office@test.ke',
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    userUpsert,
    schoolFindUnique,
    schoolUpdate,
    schoolCreate,
    gradeFindFirst,
    gradeCreate,
    streamUpsert,
    txSchoolUpdate,
    logAudit,
  ])
    m.mockReset();
  schoolFindUnique.mockResolvedValue({
    name: 'Old Name',
    knecCode: null,
    county: 'Nairobi',
    subCounty: 'X',
    phone: '254700000000',
    email: 'old@x.ke',
    logoUrl: null,
  });
  schoolUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'school-A',
    onboardingStep: 1,
    subscriptionStatus: 'trial',
    smsBalance: 500,
    ...data,
  }));
  gradeFindFirst.mockResolvedValue(null);
  gradeCreate.mockResolvedValue({ id: 'g-new' });
  streamUpsert.mockResolvedValue({});
});

describe.each([
  ['step-1', () => step1(req(identity()))],
  ['step-4', () => step4(req({ grades: [] }))],
] as const)('onboarding %s: who may call it (SEC-22 / SEC-23)', (_n, run) => {
  it('401 anonymous', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
  });
  it('403 for a deactivated admin (SEC-21)', async () => {
    signedInAs('admin', { isActive: false });
    expect((await run()).status).toBe(403);
  });
  it.each(['teacher', 'parent', 'bursar', 'deputy', 'it_admin'])(
    '403 for role %s',
    async (role) => {
      signedInAs(role);
      expect((await run()).status).toBe(403);
      expect(schoolUpdate).not.toHaveBeenCalled();
      expect(gradeCreate).not.toHaveBeenCalled();
    }
  );
  it('403 for a Clerk user with no school/user row: nobody can create a school by signing in (D15)', async () => {
    authMock.mockResolvedValue({ userId: 'clerk_stranger' });
    userFindUnique.mockResolvedValue(null);
    expect((await run()).status).toBe(403);
    expect(schoolCreate).not.toHaveBeenCalled();
    expect(userUpsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/onboarding/step-1 (SEC-22)', () => {
  it("always updates the CALLER'S school, ignoring any schoolId in the request", async () => {
    signedInAs('admin');
    const res = await step1(req({ ...identity(), schoolId: 'school-EVIL' }));
    expect(res.status).toBe(200);
    expect(schoolUpdate.mock.calls[0][0].where).toEqual({ id: 'school-A' });
    expect(schoolFindUnique.mock.calls[0][0].where).toEqual({ id: 'school-A' });
  });

  it('can never create a school or move a user into one', async () => {
    signedInAs('admin');
    await step1(req(identity())); // no schoolId at all (this used to create a school)
    expect(schoolCreate).not.toHaveBeenCalled();
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('validates input: bad JSON and bad phone are 400', async () => {
    signedInAs('admin');
    expect((await step1(req('{nope'))).status).toBe(400);
    expect((await step1(req(identity({ phone: '0712345678' })))).status).toBe(400);
    expect(schoolUpdate).not.toHaveBeenCalled();
  });

  it('returns only what the wizard needs (never billing / SMS balance)', async () => {
    signedInAs('admin');
    const body = await (await step1(req(identity()))).json();
    expect(Object.keys(body.school).sort()).toEqual(['id', 'name', 'onboardingStep']);
    expect(JSON.stringify(body)).not.toContain('smsBalance');
  });

  it('audits the change with the previous values', async () => {
    signedInAs('admin');
    await step1(req(identity()));
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'school.identity_updated',
        oldData: expect.objectContaining({ name: 'Old Name' }),
        newData: expect.objectContaining({ name: 'Test School' }),
      })
    );
  });

  it('a database failure returns a generic message, never the raw error', async () => {
    signedInAs('admin');
    schoolUpdate.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.3.7:5432 password=hunter2')
    );
    const res = await step1(req(identity()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/ECONNREFUSED|hunter2|10\.0\.3\.7/);
  });
});

describe('POST /api/onboarding/step-4 (SEC-23): grades and streams, safe to repeat', () => {
  const grades = (names: string[]) => ({
    grades: names.map((name, i) => ({
      name,
      level: i + 2,
      cbcStage: 'lower_primary',
      streams: [
        { name: 'A', capacity: 40 },
        { name: 'B', capacity: 35 },
      ],
    })),
  });

  it("creates missing grades and their streams in the caller's school", async () => {
    signedInAs('admin');
    expect((await step4(req(grades(['Grade 1'])))).status).toBe(200);
    expect(gradeCreate.mock.calls[0][0].data).toMatchObject({
      schoolId: 'school-A',
      name: 'Grade 1',
      level: 2,
    });
    expect(streamUpsert).toHaveBeenCalledTimes(2);
    expect(streamUpsert.mock.calls[0][0].create).toMatchObject({
      schoolId: 'school-A',
      gradeId: 'g-new',
      name: 'A',
      capacity: 40,
    });
    expect(txSchoolUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: 'school-A' },
      data: { onboardingStep: 4 },
    });
  });

  it('running it again does NOT create duplicate grades: existing ones are reused and streams are upserted', async () => {
    signedInAs('admin');
    gradeFindFirst.mockResolvedValue({ id: 'g-existing' });
    expect((await step4(req(grades(['Grade 1'])))).status).toBe(200);
    expect(gradeFindFirst.mock.calls[0][0].where).toEqual({
      schoolId: 'school-A',
      name: 'Grade 1',
    });
    expect(gradeCreate).not.toHaveBeenCalled();
    expect(streamUpsert.mock.calls[0][0].where).toEqual({
      gradeId_name: { gradeId: 'g-existing', name: 'A' },
    });
    expect(streamUpsert.mock.calls[0][0].update).toEqual({ capacity: 40 });
  });

  it('400 for bad JSON / invalid payload; generic 500 on failure', async () => {
    signedInAs('admin');
    expect((await step4(req('{nope'))).status).toBe(400);
    expect((await step4(req({ nope: true }))).status).toBe(400);
    gradeFindFirst.mockRejectedValue(new Error('relation "grades" ECONNRESET secret'));
    const res = await step4(req(grades(['Grade 1'])));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/ECONNRESET|relation/);
  });
});
