import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const structureFindFirst = vi.fn();
const structureFindMany = vi.fn();
const structureCreate = vi.fn();
const termFindFirst = vi.fn();
const studentFindMany = vi.fn();
const feeUpsert = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    feeStructure: {
      findFirst: (...a: unknown[]) => structureFindFirst(...a),
      findMany: (...a: unknown[]) => structureFindMany(...a),
      create: (...a: unknown[]) => structureCreate(...a),
    },
    term: { findFirst: (...a: unknown[]) => termFindFirst(...a) },
    student: { findMany: (...a: unknown[]) => studentFindMany(...a) },
    studentFee: { upsert: (...a: unknown[]) => feeUpsert(...a) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { POST as assign } from '@/app/api/fees/assign/route';
import { GET as listStructures, POST as createStructure } from '@/app/api/fees/structure/route';

const json = (body: unknown) => ({
  method: 'POST',
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const doAssign = (body: unknown) => assign(new Request('http://x', json(body)) as never);
const doCreate = (body: unknown) => createStructure(new Request('http://x', json(body)) as never);

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

const items = [
  {
    name: 'Tuition',
    amount: 25000,
    isMandatory: true,
    isOptionalActivity: false,
    priorityOrder: 1,
  },
  { name: 'Lunch', amount: 6000, isMandatory: true, isOptionalActivity: false, priorityOrder: 2 },
];
const validStructure = (over: Record<string, unknown> = {}) => ({
  termId: 'term-1',
  name: 'Term 1 2026',
  items,
  ...over,
});

beforeEach(() => {
  for (const m of [
    authMock,
    userFindUnique,
    structureFindFirst,
    structureFindMany,
    structureCreate,
    termFindFirst,
    studentFindMany,
    feeUpsert,
    logAudit,
  ])
    m.mockReset();
  termFindFirst.mockResolvedValue({ id: 'term-1' });
  structureCreate.mockImplementation(async ({ data }: { data: object }) => ({
    id: 'fs-1',
    ...data,
  }));
  structureFindFirst.mockResolvedValue({
    id: 'fs-1',
    termId: 'term-1',
    feeItems: [
      { id: 'fi-1', amount: 25000 },
      { id: 'fi-2', amount: 6000 },
    ],
  });
  studentFindMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
  feeUpsert.mockResolvedValue({ id: 'sf' });
  structureFindMany.mockResolvedValue([]);
});

describe.each([
  ['assign', () => doAssign({ structureId: 'fs-1', studentIds: ['s1'] })],
  ['structure POST', () => doCreate(validStructure())],
  ['structure GET', () => listStructures(new Request('http://x/api/fees/structure') as never)],
] as const)('fees %s: who may call it', (_n, run) => {
  it('401 anonymous; 403 deactivated (SEC-21)', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await run()).status).toBe(401);
    signedInAs('bursar', { isActive: false });
    expect((await run()).status).toBe(403);
  });
  it.each(['parent', 'teacher', 'deputy', 'it_admin'])(
    '403 for role %s (GET used to be open to every role)',
    async (role) => {
      signedInAs(role);
      expect((await run()).status).toBe(403);
      expect(feeUpsert).not.toHaveBeenCalled();
      expect(structureCreate).not.toHaveBeenCalled();
      expect(structureFindMany).not.toHaveBeenCalled();
    }
  );
  it.each(['admin', 'bursar'])('%s is allowed', async (role) => {
    signedInAs(role);
    expect((await run()).status).toBeLessThan(300);
  });
});

describe('POST /api/fees/assign (SEC-11)', () => {
  it("looks the structure up inside the caller's school (404 otherwise, nothing assigned)", async () => {
    signedInAs('bursar');
    structureFindFirst.mockResolvedValue(null);
    expect((await doAssign({ structureId: 'fs-B', studentIds: ['s1'] })).status).toBe(404);
    expect(structureFindFirst.mock.calls[0]![0]!.where).toEqual({
      id: 'fs-B',
      schoolId: 'school-A',
    });
    expect(feeUpsert).not.toHaveBeenCalled();
  });

  it('400 when any student is not an ACTIVE student of this school: nothing at all is assigned', async () => {
    signedInAs('bursar');
    studentFindMany.mockResolvedValue([{ id: 's1' }]); // s-other-school was not found
    const res = await doAssign({ structureId: 'fs-1', studentIds: ['s1', 's-other-school'] });
    expect(res.status).toBe(400);
    expect(feeUpsert).not.toHaveBeenCalled();
    expect(studentFindMany.mock.calls[0]![0]!.where).toMatchObject({
      schoolId: 'school-A',
      deletedAt: null,
      status: 'active',
    });
    expect(studentFindMany.mock.calls[0]![0]!.where.id.in.sort()).toEqual(['s-other-school', 's1']);
  });

  it("assigns every fee item to every student, in the caller's school and the structure's term", async () => {
    signedInAs('bursar');
    const res = await doAssign({ structureId: 'fs-1', studentIds: ['s1', 's2'] });
    expect(res.status).toBe(200);
    expect((await res.json()).assigned).toBe(4);
    expect(feeUpsert.mock.calls[0]![0]!.create).toMatchObject({
      schoolId: 'school-A',
      studentId: 's1',
      termId: 'term-1',
      feeItemId: 'fi-1',
    });
  });

  it('can assign a whole class, using only active students of that class in the school', async () => {
    signedInAs('admin');
    const res = await doAssign({ structureId: 'fs-1', streamId: 'st-1' });
    expect(res.status).toBe(200);
    expect(studentFindMany.mock.calls[0]![0]!.where).toMatchObject({
      streamId: 'st-1',
      schoolId: 'school-A',
      deletedAt: null,
      status: 'active',
    });
  });

  it('400 for malformed JSON, no target, an empty class, or an absurd list', async () => {
    signedInAs('bursar');
    expect((await assign(new Request('http://x', json('{nope')) as never)).status).toBe(400);
    expect((await doAssign({ structureId: 'fs-1' })).status).toBe(400);
    expect((await doAssign({ studentIds: ['s1'] })).status).toBe(400);
    expect((await doAssign({ structureId: 'fs-1', studentIds: 'nope' })).status).toBe(400);
    expect(
      (
        await doAssign({
          structureId: 'fs-1',
          studentIds: Array.from({ length: 2001 }, (_, i) => `s${i}`),
        })
      ).status
    ).toBe(400);
    studentFindMany.mockResolvedValue([]);
    expect((await doAssign({ structureId: 'fs-1', streamId: 'st-empty' })).status).toBe(400);
    expect(feeUpsert).not.toHaveBeenCalled();
  });

  it('audits the assignment (who, how many students, which structure)', async () => {
    signedInAs('bursar');
    await doAssign({ structureId: 'fs-1', studentIds: ['s1', 's2'] });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'fees.assigned',
        newData: expect.objectContaining({ structureId: 'fs-1', studentCount: 2 }),
      })
    );
  });
});

describe('POST /api/fees/structure (SEC-11, mass assignment)', () => {
  it("creates a structure in the caller's school with ONLY whitelisted item fields", async () => {
    signedInAs('bursar');
    const res = await doCreate(
      validStructure({
        schoolId: 'school-EVIL',
        items: [{ ...items[0], id: 'forced-id', feeStructureId: 'other-structure', evil: true }],
      })
    );
    expect(res.status).toBe(201);
    const data = structureCreate.mock.calls[0]![0]!.data;
    expect(data).toMatchObject({
      schoolId: 'school-A',
      termId: 'term-1',
      name: 'Term 1 2026',
      appliesTo: 'all',
    });
    const item = data.feeItems.create[0];
    expect(item).toEqual({
      name: 'Tuition',
      amount: 25000,
      isMandatory: true,
      isOptionalActivity: false,
      priorityOrder: 1,
      orderIndex: 0,
    });
  });

  it("400 when the term is not in the caller's school", async () => {
    signedInAs('bursar');
    termFindFirst.mockResolvedValue(null);
    expect((await doCreate(validStructure())).status).toBe(400);
    expect(termFindFirst.mock.calls[0]![0]!.where).toEqual({ id: 'term-1', schoolId: 'school-A' });
    expect(structureCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['no items', { items: [] }],
    ['negative amount', { items: [{ ...items[0], amount: -1 }] }],
    ['absurd amount', { items: [{ ...items[0], amount: 99999999999 }] }],
    ['text amount', { items: [{ ...items[0], amount: 'lots' }] }],
    ['empty item name', { items: [{ ...items[0], name: '' }] }],
    ['unknown appliesTo', { appliesTo: 'everyone-free' }],
    ['no name', { name: '' }],
    ['too many items', { items: Array.from({ length: 51 }, () => items[0]) }],
  ])('400 for %s', async (_n, over) => {
    signedInAs('bursar');
    expect((await doCreate(validStructure(over))).status).toBe(400);
    expect(structureCreate).not.toHaveBeenCalled();
  });

  it('accepts a free (0) item, as the form allows', async () => {
    signedInAs('bursar');
    expect((await doCreate(validStructure({ items: [{ ...items[0], amount: 0 }] }))).status).toBe(
      201
    );
  });

  it('400 for malformed JSON; audits creation', async () => {
    signedInAs('bursar');
    expect((await createStructure(new Request('http://x', json('{nope')) as never)).status).toBe(
      400
    );
    await doCreate(validStructure());
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'fees.structure_created',
        tableName: 'fee_structures',
      })
    );
  });
});

describe('GET /api/fees/structure', () => {
  it("lists only the caller's school, optionally by term", async () => {
    signedInAs('bursar');
    await listStructures(new Request('http://x/api/fees/structure?termId=term-1') as never);
    expect(structureFindMany.mock.calls[0]![0]!.where).toEqual({
      schoolId: 'school-A',
      termId: 'term-1',
    });
  });
});
