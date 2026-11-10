import type { UserRole } from '@prisma/client';
import type { CurrentUser } from '@/lib/auth/current-user';
import { exportQueue } from '@/lib/export/queue';

/**
 * Export access rules (SEC-06). Design RBAC: it_admin = export:read, bursar = fees only,
 * admin = everything. Teachers have an exports page but the API has always refused them;
 * kept refused until decision D19 says otherwise.
 */
export const EXPORT_ROLES = ['admin', 'it_admin', 'bursar'] as const satisfies readonly UserRole[];

export const EXPORT_TYPES = [
  'attendance-class',
  'attendance-student',
  'attendance-teacher',
  'fees-daily',
  'fees-term',
  'fees-defaulters',
  'results-markbook',
  'results-portfolio',
  'students',
] as const;
export type ExportRequestType = (typeof EXPORT_TYPES)[number];

const FEE_TYPES: readonly string[] = ['fees-daily', 'fees-term', 'fees-defaulters'];

export function mayRequestExport(role: UserRole, type: string): boolean {
  if (role === 'admin' || role === 'it_admin') return true;
  if (role === 'bursar') return FEE_TYPES.includes(type);
  return false;
}

/**
 * Job IDs are sequential counters, so they are guessable. Return the job only if the caller
 * requested it themselves, in their own school; otherwise act as if it does not exist.
 */
export async function getOwnedExportJob(jobId: string, user: CurrentUser) {
  if (!jobId || jobId.length > 64) return null;
  const job = await exportQueue.getJob(jobId);
  if (!job) return null;
  const data = job.data as { schoolId?: string; userId?: string };
  if (data.schoolId !== user.schoolId || data.userId !== user.id) return null;
  return job;
}

/** What the browser is told about a failed job: never the raw worker error (SEC-19). */
export const GENERIC_EXPORT_FAILURE = 'The export could not be generated. Please try again.';
