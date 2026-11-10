'use server';

import { z } from 'zod';
import { resolveUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { prisma } from '@/lib/db';

/**
 * IT-admin user management (SEC-11, SEC-12; decision D7).
 *
 * - The school ALWAYS comes from the signed-in IT admin's session, never from the browser.
 * - An IT admin manages deputy, teacher and parent accounts ONLY. admin, bursar and it_admin
 *   accounts (money, school ownership, platform access) cannot be created, edited, promoted or
 *   demoted here. (D7 recommendation applied; relax deliberately if you decide otherwise.)
 * - People created here cannot sign in until they are linked to a Clerk account (R1-23).
 */
const MANAGEABLE_ROLES = ['deputy', 'teacher', 'parent'] as const;
type ManageableRole = (typeof MANAGEABLE_ROLES)[number];
const isManageable = (role: string): role is ManageableRole =>
  (MANAGEABLE_ROLES as readonly string[]).includes(role);

const userSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(10).optional().or(z.literal('')),
  role: z.string(),
  nationalId: z.string().optional().or(z.literal('')),
});

export type ActionResult = { success?: boolean; error?: string };

const NOT_ALLOWED: ActionResult = { error: 'You are not allowed to do this.' };
const ROLE_NOT_ALLOWED: ActionResult = {
  error: 'You cannot assign that role. IT admins can manage deputy, teacher and parent roles only.',
};
const ACCOUNT_NOT_EDITABLE: ActionResult = {
  error:
    'This account cannot be changed here. Admin, bursar and IT-admin accounts are managed by the school admin.',
};

async function itAdmin() {
  const result = await resolveUser(['it_admin']);
  return result.status === 'ok' ? result.user : null;
}

function describeFailure(error: unknown, fallback: string): ActionResult {
  if ((error as { code?: string })?.code === 'P2002') {
    return { error: 'Email, Phone, or National ID already exists.' };
  }
  console.error(fallback, error);
  return { error: fallback };
}

export async function createUserAction(data: z.input<typeof userSchema>): Promise<ActionResult> {
  const actor = await itAdmin();
  if (!actor) return NOT_ALLOWED;

  const parsed = userSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid details' };
  const input = parsed.data;
  if (!isManageable(input.role)) return ROLE_NOT_ALLOWED;

  try {
    const created = await prisma.user.create({
      data: {
        schoolId: actor.schoolId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        role: input.role,
        nationalId: input.nationalId || null,
      },
      select: { id: true },
    });

    await logAudit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: 'user.created',
      tableName: 'users',
      recordId: created.id,
      newData: { role: input.role },
    });
    return { success: true };
  } catch (error) {
    return describeFailure(error, 'Failed to create user');
  }
}

export async function updateUserAction(
  userId: string,
  data: z.input<typeof userSchema>
): Promise<ActionResult> {
  const actor = await itAdmin();
  if (!actor) return NOT_ALLOWED;

  const parsed = userSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid details' };
  const input = parsed.data;
  if (!isManageable(input.role)) return ROLE_NOT_ALLOWED;

  try {
    // The person being edited must be in the caller's school, and not a privileged account.
    const target = await prisma.user.findFirst({
      where: { id: userId, schoolId: actor.schoolId, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!target) return { error: 'User not found.' };
    if (!isManageable(target.role)) return ACCOUNT_NOT_EDITABLE;

    await prisma.user.update({
      where: { id: target.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        role: input.role,
        nationalId: input.nationalId || null,
      },
    });

    await logAudit({
      schoolId: actor.schoolId,
      actorId: actor.id,
      action: 'user.updated',
      tableName: 'users',
      recordId: target.id,
      oldData: { role: target.role },
      newData: { role: input.role },
    });
    return { success: true };
  } catch (error) {
    return describeFailure(error, 'Failed to update user');
  }
}

/**
 * NOT IMPLEMENTED. This used to return a fake success (`count: rows.length`) without importing
 * anything (FEAT-04). It now says so plainly. The real student import is R6-05.
 */
export async function importStudentsAction(
  _validRows: unknown[]
): Promise<ActionResult & { count?: number }> {
  const actor = await itAdmin();
  if (!actor) return NOT_ALLOWED;
  return {
    error: 'Student import from this page is not available yet. No students were imported.',
  };
}
