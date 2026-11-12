import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

export interface AuditLogData {
  schoolId?: string;
  actorId?: string;
  action: string;
  tableName: string;
  recordId?: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * R5-01: Transactional audit helper.
 * 
 * @param data - The audit log payload
 * @param tx - (Optional) The Prisma transaction client. If provided, the audit 
 *             log is written atomically with the main DB operation. If the audit 
 *             write fails, the entire transaction rolls back.
 */
export async function logAudit(
  data: AuditLogData,
  tx?: Omit<Prisma.TransactionClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
) {
  // 1. Resolve IP and User Agent (fallback to headers if not explicitly provided)
  let ipAddress = data.ipAddress || 'unknown';
  let userAgent = data.userAgent || 'unknown';

  if (ipAddress === 'unknown' || userAgent === 'unknown') {
    try {
      // headers() only works in App Router server components/routes, not background workers
      const headersList = headers();
      if (ipAddress === 'unknown') {
        ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      }
      if (userAgent === 'unknown') {
        userAgent = headersList.get('user-agent') || 'unknown';
      }
    } catch {
      // Safely ignore if called from a background worker (e.g., BullMQ) where headers() throws
    }
  }

  // 2. Resolve the database client (use transaction if provided, otherwise global prisma)
  const client = tx || prisma;

  // 3. Execute the audit write. 
  // R5-01: We do NOT wrap this in a try/catch that swallows the error. 
  // If this throws, the calling transaction will roll back, ensuring no "ghost" actions.
  await client.auditLog.create({
    data: {
      schoolId: data.schoolId || null,
      actorId: data.actorId || null,
      action: data.action,
      tableName: data.tableName,
      recordId: data.recordId || null,
      oldData: data.oldData === undefined ? undefined : (data.oldData as Prisma.InputJsonValue),
      newData: data.newData === undefined ? undefined : (data.newData as Prisma.InputJsonValue),
      ipAddress,
      userAgent,
    },
  });
}

/**
 * Helper to extract request metadata for audit logging.
 * Use this in API routes and pass the result to logAudit.
 */
export function getRequestMetadata(req?: Request) {
  let ipAddress = 'unknown';
  let userAgent = 'unknown';

  if (req) {
    const headersList = headers();
    const forwarded = headersList.get('x-forwarded-for');
    const firstForwardedIp = forwarded?.split(',')[0]?.trim();
    ipAddress = firstForwardedIp || 'unknown';
    userAgent = req.headers.get('user-agent') || 'unknown';
  }

  return { ipAddress, userAgent };
}