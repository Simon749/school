import { auth } from '@clerk/nextjs/server';
import type { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';

/**
 * THE way to identify the caller (REMEDIATION_PLAN D1, R1-13).
 *
 * - Identity = Clerk proves WHO; our own `users` row decides WHAT (role, school, active).
 * - A person who is signed in to Clerk but has no usable row in our DB is refused.
 * - Deactivated (`isActive = false`) and soft-deleted users are refused immediately (SEC-21),
 *   even though their Clerk session may still be valid.
 * - Every refusal after authentication looks identical ("Forbidden"), so callers cannot probe
 *   which accounts exist or why access was denied.
 *
 * Role/school here is only the first gate. Resource-level checks (is this child yours? is this
 * record in your school?) still belong in the route, using `user.schoolId`.
 */
export interface CurrentUser {
  id: string;
  clerkId: string;
  role: UserRole;
  schoolId: string;
}

export type UserLookup =
  { status: 'ok'; user: CurrentUser } | { status: 'unauthenticated' } | { status: 'forbidden' };

export async function resolveUser(allowedRoles?: readonly UserRole[]): Promise<UserLookup> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { status: 'unauthenticated' };

  const row = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      id: true,
      clerkId: true,
      role: true,
      schoolId: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!row || !row.isActive || row.deletedAt || !row.schoolId) return { status: 'forbidden' };
  if (allowedRoles && !allowedRoles.includes(row.role)) return { status: 'forbidden' };

  return {
    status: 'ok',
    user: { id: row.id, clerkId: clerkId, role: row.role, schoolId: row.schoolId },
  };
}

export type GuardResult = { ok: true; user: CurrentUser } | { ok: false; response: NextResponse };

/** For API route handlers: `const g = await requireUser(['admin']); if (!g.ok) return g.response;` */
export async function requireUser(allowedRoles?: readonly UserRole[]): Promise<GuardResult> {
  const result = await resolveUser(allowedRoles);
  if (result.status === 'ok') return { ok: true, user: result.user };
  if (result.status === 'unauthenticated') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }
  return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

/** For server components / server actions: redirects instead of returning a response. */
export async function requirePageUser(allowedRoles?: readonly UserRole[]): Promise<CurrentUser> {
  const result = await resolveUser(allowedRoles);
  if (result.status === 'ok') return result.user;
  redirect(result.status === 'unauthenticated' ? '/login' : '/unauthorized');
}

/** The signed-in teacher's own record, found by the INTERNAL user id (never the Clerk id: FEAT-01). */
export interface CurrentTeacher {
  id: string;
  schoolId: string;
  isClassTeacher: boolean;
  classTeacherStreamId: string | null;
}

async function loadTeacher(user: CurrentUser): Promise<CurrentTeacher | null> {
  return prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
    select: { id: true, schoolId: true, isClassTeacher: true, classTeacherStreamId: true },
  });
}

export type TeacherGuardResult =
  { ok: true; user: CurrentUser; teacher: CurrentTeacher } | { ok: false; response: NextResponse };

/** For API routes that act on the caller's own teacher record. */
export async function requireTeacher(): Promise<TeacherGuardResult> {
  const guard = await requireUser(['teacher']);
  if (!guard.ok) return guard;
  const teacher = await loadTeacher(guard.user);
  if (!teacher) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, user: guard.user, teacher };
}

/** For server components: redirects instead of returning a response. */
export async function requirePageTeacher(): Promise<{
  user: CurrentUser;
  teacher: CurrentTeacher;
}> {
  const user = await requirePageUser(['teacher']);
  const teacher = await loadTeacher(user);
  if (!teacher) redirect('/unauthorized');
  return { user, teacher };
}
