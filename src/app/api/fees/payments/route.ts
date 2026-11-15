import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { allocatePayment } from '@/lib/fees/allocation';
import { generateReceiptNumber } from '@/lib/fees/receipt';
import { notificationQueue } from '@/lib/queue';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { Prisma } from '@prisma/client';

// ✅ PAY-06 & PAY-10: amount accepts number or string, validates max limit and 2 decimals, then transforms to string for Decimal
const paymentSchema = z.object({
  studentId: z.string().min(1).max(64),
  amount: z
    .union([
      z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a valid decimal string'),
      z
        .number()
        .positive()
        .max(100_000_000, 'Amount is too large')
        .refine((n) => Math.round(n * 100) / 100 === n, 'At most 2 decimal places'),
    ])
    .transform((val) => String(val)),
  paymentMethod: z.enum(['cash', 'bank', 'cheque', 'mpesa']),
  mpesaCode: z.string().trim().max(20).optional().nullable(),
  reference: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

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
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message || 'Invalid payment' }, { status: 400 });
  }
  const { studentId, amount: amountStr, paymentMethod, reference, notes, mpesaCode } = parsed.data;
  const actualReference = reference || mpesaCode;

  // ✅ PAY-06: Use Prisma.Decimal for money math (no JS float precision loss)
  const amount = new Prisma.Decimal(amountStr);
  if (amount.lte(0)) {
    return NextResponse.json({ error: 'Amount must be greater than zero' }, { status: 400 });
  }

  // ✅ PAY-10: The student must be an active student of THIS school (Cross-tenant IDOR prevention)
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId, deletedAt: null, status: 'active' },
    select: { id: true, firstName: true },
  });
  if (!student) {
    return NextResponse.json({ error: 'Student not found in this school' }, { status: 400 }); // 400 reveals nothing about IDs in other schools (kept; see tests)
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) {
    return NextResponse.json({ error: 'No current term' }, { status: 400 });
  }

  // ✅ PAY-10: Idempotency check for reference (prevent duplicate manual entries of same code)
  if (actualReference) {
    const existing = await prisma.feePayment.findFirst({
      where: {
        schoolId: user.schoolId,
        OR: [{ mpesaCode: actualReference }, { bankReference: actualReference }],
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'A payment with this reference code already exists' },
        { status: 409 }
      );
    }
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);

  // ✅ PAY-09 & PAY-10: Atomic DB update + Audit + Receipt Generation
  const payment = await prisma.$transaction(async (tx) => {
    const allocation = await allocatePayment({
      studentId: student.id,
      termId: currentTerm.id,
      amount: amount, // Pass the Prisma.Decimal directly
      tx, // ✅ Pass the transaction client for locking
    });
    // Generate receipt number atomically within the transaction
    const receiptNumber = await generateReceiptNumber(user.schoolId, tx);

    const newPayment = await tx.feePayment.create({
      data: {
        schoolId: user.schoolId,
        studentId: student.id,
        termId: currentTerm.id,
        receiptNumber,
        amount, // ✅ PAY-06: Prisma.Decimal
        paymentMethod,
        mpesaCode: paymentMethod === 'mpesa' ? actualReference || null : null,
        bankReference: paymentMethod !== 'mpesa' ? actualReference || null : null,
        paidAt: new Date(),
        recordedBy: user.id, // ✅ FIXED: Schema uses 'recordedBy', not 'recordedById'
        notes: notes || null,
        allocations: allocation.allocations,
        overpaymentAmount: new Prisma.Decimal(allocation.overpayment || 0),
        overpaymentAction: allocation.overpayment > 0 ? 'carry_forward' : null,
      },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'MANUAL_PAYMENT_RECORDED',
        tableName: 'fee_payments',
        recordId: newPayment.id,
        newData: {
          amount: amount.toFixed(2), // canonical 2dp string; Decimal.toString() would log 1500.5
          paymentMethod: newPayment.paymentMethod,
          mpesaCode: newPayment.mpesaCode,
          studentId: newPayment.studentId,
        },
        ipAddress,
        userAgent,
      },
      tx
    );

    return newPayment;
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
      body: `KES ${amount.toFixed(2)} received for ${student.firstName || 'your student'}. Receipt: ${payment.receiptNumber}`,
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
