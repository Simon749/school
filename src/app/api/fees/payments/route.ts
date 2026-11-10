import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { allocatePayment } from '@/lib/fees/allocation';
import { generateReceiptNumber } from '@/lib/fees/receipt';
import { notificationQueue } from '@/lib/queue';
import { logAudit, getRequestMetadata } from '@/lib/audit';

const paymentSchema = z.object({
  studentId: z.string().min(1).max(64),
  // Positive, at most 2 decimals (the column is DECIMAL(12,2)); the ceiling is a typo guard.
  amount: z
    .number()
    .positive()
    .max(100_000_000)
    .refine((n) => Math.round(n * 100) / 100 === n, 'At most 2 decimal places'),
  paymentMethod: z.enum(['cash', 'bank', 'cheque', 'mpesa']),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

/**
 * Manual payment entry (bursar/admin). This change only closes the access and input holes
 * (SEC-11, PAY-10 partly). Allocation, receipt numbering, idempotency and reversals are
 * rebuilt in R3 (PAY-08/09/10) — they are deliberately untouched here.
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payment', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { studentId, amount, paymentMethod, reference, notes } = parsed.data;

  // The student must be an active student of THIS school.
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId, deletedAt: null, status: 'active' },
    select: { id: true, firstName: true },
  });
  if (!student) {
    return NextResponse.json({ error: 'Student not found in this school' }, { status: 400 });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) {
    return NextResponse.json({ error: 'No current term' }, { status: 400 });
  }

  const allocation = await allocatePayment({
    studentId: student.id,
    termId: currentTerm.id,
    amount,
  });

  const receiptNumber = await generateReceiptNumber(user.schoolId, prisma as any);

  const payment = await prisma.feePayment.create({
    data: {
      schoolId: user.schoolId,
      studentId: student.id,
      termId: currentTerm.id,
      receiptNumber,
      amount,
      paymentMethod,
      bankReference: reference || null,
      paidAt: new Date(),
      recordedBy: user.id,
      notes: notes || null,
      allocations: allocation.allocations,
      overpaymentAmount: allocation.overpayment,
      overpaymentAction: allocation.overpayment > 0 ? 'carry_forward' : null,
    },
  });

  const { ipAddress, userAgent } = getRequestMetadata(req);

  await logAudit({
    schoolId: payment.schoolId,
    actorId: user.id,
    action: 'fee.payment.recorded',
    tableName: 'fee_payments',
    recordId: payment.id,
    newData: {
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      mpesaCode: payment.mpesaCode,
      studentId: payment.studentId,
    },
    ipAddress,
    userAgent,
  });

  // Confirmation goes to the primary guardian — only if that guardian link and account are active.
  const parent = await prisma.user.findFirst({
    where: {
      isActive: true,
      deletedAt: null,
      guardians: { some: { studentId: payment.studentId, isPrimary: true, isActive: true } },
    },
    select: { id: true },
  });

  if (parent) {
    await notificationQueue.add('payment-confirmation', {
      userId: parent.id,
      type: 'payment',
      title: 'Payment Received',
      body: `KES ${payment.amount.toLocaleString()} received for ${
        student.firstName || 'your student'
      }. Receipt: ${payment.receiptNumber}`,
      data: {
        studentId: payment.studentId,
        paymentId: payment.id,
        url: `/parent/${payment.studentId}/fees`,
      },
    });
  }

  return NextResponse.json({ success: true, payment }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('studentId');
  const termId = searchParams.get('termId');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  const parseDate = (value: string | null): Date | null | 'invalid' => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 'invalid' : d;
  };
  const from = parseDate(dateFrom);
  const to = parseDate(dateTo);
  if (from === 'invalid' || to === 'invalid') {
    return NextResponse.json({ error: 'Invalid date filter' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    schoolId: user.schoolId,
    isReversed: false,
  };

  if (studentId) where.studentId = studentId;
  if (termId) where.termId = termId;

  if (from || to) {
    where.paidAt = {};
    if (from) where.paidAt.gte = from;
    if (to) where.paidAt.lte = to;
  }

  const payments = await prisma.feePayment.findMany({
    where,
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          admissionNumber: true,
          stream: { select: { name: true } },
        },
      },
      term: { select: { name: true } },
    },
    orderBy: { paidAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ payments });
}
