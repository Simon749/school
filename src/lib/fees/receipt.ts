import { Prisma } from '@prisma/client';

// Prisma's generated TransactionClient type is missing the custom receiptSequence model
// in some generated clients; cast here so the runtime call remains valid and TypeScript
// stops flagging the property as absent.
type ReceiptSequenceTx = Prisma.TransactionClient & {
  receiptSequence: {
    upsert(args: any): Promise<{ lastNumber: number }>;
  };
};

/**
 * ✅ PAY-09: Generates a unique, sequential receipt number per school and year.
 * Eliminates Redis INCR collisions, provisional receipt sequence burning, and cross-school prefix clashes.
 */
export async function generateReceiptNumber(schoolId: string, tx: Prisma.TransactionClient): Promise<string> {
  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: { name: true, knecCode: true },
  });

  if (!school) {
    throw new Error('School not found');
  }

  // Use KNEC code if available, otherwise first 4 alphanumeric chars of name
  const rawPrefix = school.knecCode || school.name;
  const prefix = rawPrefix.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const year = new Date().getFullYear();

  const receiptSequenceTx = tx as ReceiptSequenceTx;

  // Atomically increment the sequence for this school and year
  const sequence = await receiptSequenceTx.receiptSequence.upsert({
    where: {
      schoolId_year: { schoolId, year },
    },
    update: {
      lastNumber: { increment: 1 },
    },
    create: {
      schoolId,
      year,
      lastNumber: 1,
    },
  });

  return `${prefix}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
}