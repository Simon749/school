import { prisma } from "@/lib/db";

/**
 * Generate a sequential receipt number per school.
 * Format: {PREFIX}-{SEQUENCE}  e.g. "TSK-001247"
 * Uses a simple counter stored in Redis; falls back to DB MAX+1.
 */
export async function generateReceiptNumber(schoolId: string): Promise<string> {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  });
  // Derive prefix from school name (first 3 chars uppercase)
  const prefix = school?.name?.slice(0, 3).toUpperCase() || "RCPT";

  // Use Redis atomic INCR for the sequence
  const { redis } = await import("@/lib/redis");
  const key = `receipt_seq:${schoolId}`;
  let seq = await redis.incr(key);

  // If key didn't exist, seed from DB max
  if (seq === 1) {
    const max = await prisma.feePayment.aggregate({
      where: { schoolId },
      _max: { receiptNumber: true },
    });
    if (max._max.receiptNumber) {
      const match = max._max.receiptNumber.match(/-(\d+)$/);
      const dbSeq = match ? parseInt(match[1], 10) : 0;
      seq = dbSeq + 1;
      await redis.set(key, seq.toString());
    }
  }

  return `${prefix}-${String(seq).padStart(6, "0")}`;
}