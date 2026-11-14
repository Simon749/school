import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { stkPush } from '@/lib/mpesa/daraja';
import { mpesaQueue } from '@/lib/queue';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAppUrl } from '@/lib/env';

export async function POST(req: NextRequest) {
  const prismaAny = prisma as any;
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const headersList = headers();
  const forwarded = headersList.get('x-forwarded-for');
  const ip = forwarded ? (forwarded.split(',')[0]?.trim() ?? 'unknown-ip') : 'unknown-ip';

  const rateLimit = await checkRateLimit({
    uniqueKey: `stk-push:${ip}`,
    limit: 3,
    windowInSeconds: 60,
  });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Too many payment requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true, phone: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { studentId, amount, phone: overridePhone } = body;

  if (!studentId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'studentId and positive amount required' }, { status: 400 });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
  });
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const phone = overridePhone || user.phone;
  if (!phone) {
    return NextResponse.json({ error: 'No phone number available for STK Push' }, { status: 400 });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) return NextResponse.json({ error: 'No current term' }, { status: 400 });

  // R3-02 / PAY-04: Check for pending PAYMENT ATTEMPT, not FeePayment
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentPending = await prismaAny.paymentAttempt.findFirst({
    where: {
      studentId,
      termId: currentTerm.id,
      status: 'pending',
      createdAt: { gte: fiveMinAgo },
    },
  });
  if (recentPending) {
    return NextResponse.json(
      { error: 'A payment is already in progress. Please wait 5 minutes or check your phone.' },
      { status: 429 }
    );
  }

  const accountReference = `${student.admissionNumber || student.nemisNumber}`.slice(0, 12);
  const callbackUrl = `${getAppUrl()}/api/webhooks/mpesa`;

  let darajaRes;
  try {
    darajaRes = await stkPush({
      phone,
      amount: Math.round(amount),
      accountReference,
      transactionDesc: 'School Fees',
      callbackUrl,
    });
  } catch (error: any) {
    console.error('STK Push error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'MPesa request failed' },
      { status: 502 }
    );
  }

  if (darajaRes.ResponseCode !== '0') {
    return NextResponse.json(
      { error: darajaRes.ResponseDescription || 'MPesa rejected the request' },
      { status: 502 }
    );
  }

  // R3-02: Create PaymentAttempt record, NOT FeePayment
  const attempt = await prismaAny.paymentAttempt.create({
    data: {
      schoolId: user.schoolId,
      studentId,
      termId: currentTerm.id,
      checkoutRequestId: darajaRes.CheckoutRequestID,
      merchantRequestId: darajaRes.MerchantRequestID,
      amount,
      phone: phone.replace(/\D/g, ''),
      status: 'pending',
    },
  });

  // Schedule a recovery job in case callback never arrives (15 min later)
  await mpesaQueue.add(
    'mpesa-recovery',
    {
      attemptId: attempt.id,
      checkoutRequestId: darajaRes.CheckoutRequestID,
    },
    { delay: 15 * 60 * 1000, attempts: 3 }
  );

  return NextResponse.json({
    success: true,
    message: 'Check your phone for the MPesa prompt',
    checkoutRequestId: darajaRes.CheckoutRequestID,
    merchantRequestId: darajaRes.MerchantRequestID,
    attemptId: attempt.id,
  });
}
