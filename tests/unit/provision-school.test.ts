import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provisionSchool } from '@/lib/provisioning/school';

const userFindFirst = vi.fn();
const schoolCreate = vi.fn();
const userCreate = vi.fn();
const auditCreate = vi.fn();

const db = {
  user: {
    findFirst: (...a: unknown[]) => userFindFirst(...a),
    create: (...a: unknown[]) => userCreate(...a),
  },
  school: { create: (...a: unknown[]) => schoolCreate(...a) },
  auditLog: { create: (...a: unknown[]) => auditCreate(...a) },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
} as never;

const valid = {
  schoolName: 'Kilimani Academy',
  adminClerkId: 'user_2abcDEF',
  adminEmail: 'Director@Kilimani.ke',
  adminFirstName: 'Wanjiru',
  adminLastName: 'Kamau',
};

beforeEach(() => {
  for (const m of [userFindFirst, schoolCreate, userCreate, auditCreate]) m.mockReset();
  userFindFirst.mockResolvedValue(null);
  schoolCreate.mockResolvedValue({ id: 'school-new', name: 'Kilimani Academy' });
  userCreate.mockResolvedValue({ id: 'user-new' });
});

describe('provisionSchool (D15/D16: only a platform super admin creates schools)', () => {
  it('creates the school and its first admin together, in the new school', async () => {
    const out = await provisionSchool(db, valid);
    expect(out).toEqual({ schoolId: 'school-new', adminUserId: 'user-new' });
    expect(schoolCreate.mock.calls[0][0].data).toMatchObject({
      name: 'Kilimani Academy',
      onboardingCompleted: false,
      onboardingStep: 0,
    });
    expect(userCreate.mock.calls[0][0].data).toMatchObject({
      clerkId: 'user_2abcDEF',
      schoolId: 'school-new',
      role: 'admin',
      email: 'director@kilimani.ke', // normalised to lower case
      firstName: 'Wanjiru',
      lastName: 'Kamau',
      isActive: true,
    });
  });

  it('REFUSES when the Clerk user already exists in our database: it must never move an existing user into a new school', async () => {
    userFindFirst.mockResolvedValue({ id: 'existing', schoolId: 'school-A' });
    await expect(provisionSchool(db, valid)).rejects.toThrow(/already/i);
    expect(schoolCreate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    // it looks for the Clerk id OR the e-mail (both are unique)
    expect(JSON.stringify(userFindFirst.mock.calls[0][0].where)).toContain('user_2abcDEF');
    expect(JSON.stringify(userFindFirst.mock.calls[0][0].where)).toContain('director@kilimani.ke');
  });

  it.each([
    ['empty school name', { schoolName: ' ' }],
    ['one-letter school name', { schoolName: 'A' }],
    ['clerk id not starting user_', { adminClerkId: 'abc123' }],
    ['invalid e-mail', { adminEmail: 'not-an-email' }],
    ['missing first name', { adminFirstName: '' }],
    ['missing last name', { adminLastName: '' }],
  ])('rejects %s without writing anything', async (_n, over) => {
    await expect(provisionSchool(db, { ...valid, ...over })).rejects.toThrow();
    expect(schoolCreate).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('records the provisioning in the audit log (no human actor: it is a platform operation)', async () => {
    await provisionSchool(db, valid);
    expect(auditCreate.mock.calls[0][0].data).toMatchObject({
      schoolId: 'school-new',
      action: 'school.provisioned',
      tableName: 'schools',
      recordId: 'school-new',
    });
    expect(auditCreate.mock.calls[0][0].data.actorId).toBeUndefined();
  });
});
