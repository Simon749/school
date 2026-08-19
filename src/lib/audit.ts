import { prisma } from "@/lib/db";

export interface AuditLogEntry {
  schoolId: string;
  actorId?: string; // User ID who performed the action
  action: string; // e.g., "student.import", "fee.payment.recorded"
  tableName: string; // e.g., "students", "fee_payments"
  recordId?: string; // UUID of the affected record
  oldData?: Record<string, any>;
  newData?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        schoolId: entry.schoolId,
        actorId: entry.actorId,
        action: entry.action,
        tableName: entry.tableName,
        recordId: entry.recordId,
        oldData: entry.oldData || undefined,
        newData: entry.newData || undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Audit logging should never break the main flow
    console.error("Failed to write audit log:", error);
  }
}

// Helper to extract request metadata
export function getRequestMetadata(req: Request): {
  ipAddress?: string;
  userAgent?: string;
} {
  const ipAddress =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  
  const userAgent = req.headers.get("user-agent") || undefined;

  return { ipAddress, userAgent };
}