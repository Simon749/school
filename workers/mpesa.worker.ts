import { Worker, Job } from 'bullmq';
import { connection } from '@/lib/queue/connection';
import { prisma } from '@/lib/db';
import { allocatePayment } from '@/lib/fees/allocation';
import { generateReceiptNumber } from '@/lib/fees/receipt';
import { queryStkStatus } from '@/lib/mpesa/daraja';
import { logAudit } from '@/lib/audit';

export const mpesaWorker = new Worker(
  'mpesa-queue', // Ensure this matches the queue name in src/lib/queue/index.ts
  async (job: Job) => {
    const { name } = job;

    if (name === 'mpesa-callback') {
      return await handleCallback(job.data);
    }

    if (name === 'mpesa-recovery') {
      return await handleRecovery(job.data);
    }

    throw new Error(`Unknown mpesa job: ${name}`);
  },
  { connection, concurrency: 3 }
);

async function handleCallback(data: any) {
  const {
    checkoutRequestId,
    resultCode,
    resultDesc,
    callbackMetadata,
    sourceIp,
  } = data;

  // R3-02: Look up the PaymentAttempt, NOT the FeePayment
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { checkoutRequestId },
  });

  if (!attempt) {
    console.warn(
      `[MpesaWorker] Callback received for unknown checkoutRequestId: ${checkoutRequestId}`
    );

    return { missing: true }; // Idempotent: job is done, no need to retry
  }

  // If already completed, skip (idempotency)
  if (attempt.status === 'completed') {
    console.log(`[MpesaWorker] Already processed: ${checkoutRequestId}`);
    return { alreadyProcessed: true };
  }

  // Payment failed on user's phone (e.g., cancelled, insufficient funds)
  if (resultCode !== 0) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'failed',
        failureReason: resultDesc,
        callbackPayload: data,
      },
    });

    console.log(`[MpesaWorker] ❌ Payment failed: ${resultDesc}`);
    return { failed: true, reason: resultDesc };
  }

  // Extract metadata
  const items = callbackMetadata?.Item || [];

  const callbackAmount = Number(
    items.find((i: any) => i.Name === 'Amount')?.Value || 0
  );

  const mpesaCode = items.find(
    (i: any) => i.Name === 'MpesaReceiptNumber'
  )?.Value as string;

  const callbackPhone = String(
    items.find((i: any) => i.Name === 'PhoneNumber')?.Value || ''
  );

  const mpesaName =
    (items.find((i: any) => i.Name === 'FullName')?.Value as string) ||
    'Unknown';

  if (!mpesaCode || !callbackAmount) {
    throw new Error(
      `Missing critical callback data: ${JSON.stringify(callbackMetadata)}`
    );
  }

  // R3-04: Reconcile amount and phone to prevent fraud
  if (Math.abs(callbackAmount - Number(attempt.amount)) > 0.01) {
    throw new Error(
      `Amount mismatch: expected ${attempt.amount}, got ${callbackAmount}`
    );
  }

  const cleanAttemptPhone = attempt.phone.replace(/\D/g, '');
  const cleanCallbackPhone = callbackPhone.replace(/\D/g, '');

  if (!cleanCallbackPhone.endsWith(cleanAttemptPhone.slice(-9))) {
    throw new Error(
      `Phone mismatch: expected ${cleanAttemptPhone}, got ${cleanCallbackPhone}`
    );
  }

  // R5-01: Transactional insert (Atomic: either both succeed, or both fail)
  await prisma.$transaction(async (tx) => {
    // 1. Run allocation logic
    const allocation = await allocatePayment({
      studentId: attempt.studentId,
      termId: attempt.termId,
      amount: callbackAmount,
      tx, // Pass tx to allocation if it supports it
    });

    // 2. Generate real receipt number
    const receiptNumber = await generateReceiptNumber(attempt.schoolId, tx);

    // 3. Create the OFFICIAL FeePayment record ONLY NOW
    const payment = await tx.feePayment.create({
      data: {
        schoolId: attempt.schoolId,
        studentId: attempt.studentId,
        termId: attempt.termId,
        receiptNumber,
        amount: callbackAmount,
        paymentMethod: 'mpesa',
        mpesaCode,
        mpesaPhone: cleanCallbackPhone,
        mpesaName,
        allocations: allocation.allocations,
        overpaymentAmount: allocation.overpayment,
        overpaymentAction:
          allocation.overpayment > 0 ? 'carry_forward' : null,
        paidAt: new Date(),
        notes: `Verified via Daraja Callback. IP: ${sourceIp || 'unknown'}`,
      },
    });

    // 4. Mark the attempt as completed and link it
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'completed',
        mpesaCode,
        mpesaName,
        callbackPayload: data,
        paymentId: payment.id,
      },
    });

    // ✅ 5. R5-01: Log the audit INSIDE the transaction.
    // If this fails, the payment creation rolls back, preventing un-audited money movements.
    await logAudit(
      {
        schoolId: attempt.schoolId,
        actorId: 'system:mpesa-callback', // System action, not a human user
        action: 'payment.confirmed',
        tableName: 'fee_payments',
        recordId: payment.id,
        newData: {
          receiptNumber,
          amount: callbackAmount,
          mpesaCode,
          studentId: attempt.studentId,
        },
        ipAddress: sourceIp || 'unknown',
      },
      tx // <-- PASS THE TRANSACTION CLIENT HERE
    );
  });

  // TODO: Queue notification to parent
  // await notificationQueue.add("payment-confirmation", { ... });

  console.log(
    `[MpesaWorker] ✅ Payment recorded: KES ${callbackAmount} / ${mpesaCode}`
  );

  return { success: true, mpesaCode };
}

async function handleRecovery(data: any) {
  const { attemptId, checkoutRequestId } = data;

  // R3-05: Query the PaymentAttempt, not FeePayment
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: attemptId },
  });

  if (!attempt || attempt.status !== 'pending') {
    return { alreadyResolved: true }; // Either missing or already succeeded/failed
  }

  // Query Daraja directly
  const status = await queryStkStatus(checkoutRequestId);

  console.log(
    `[MpesaWorker] Recovery query for ${checkoutRequestId}:`,
    status
  );

  // If Daraja says it succeeded, process it as a callback
  if (status.ResultCode === '0' && status.CallbackMetadata) {
    return handleCallback({
      checkoutRequestId,
      resultCode: 0,
      resultDesc: 'Recovered via Daraja STK Query',
      callbackMetadata: status.CallbackMetadata,
      sourceIp: 'recovery-worker',
    });
  }

  // Still pending or failed — flag for manual review so it doesn't hang forever
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'needs_manual_review',
      failureReason: `Callback not received. Daraja query status: ${
        status.ResultCode || 'Unknown'
      }`,
      callbackPayload: status,
    },
  });

  console.log(
    `[MpesaWorker] ⚠️ Payment ${checkoutRequestId} flagged for manual review.`
  );

  return {
    status: 'needs_manual_review',
    queryResult: status,
  };
}

mpesaWorker.on('completed', (job) => {
  console.log(`[MpesaWorker] ${job.name} #${job.id} completed`);
});

mpesaWorker.on('failed', (job, err) => {
  console.error(
    `[MpesaWorker] ${job?.name} #${job?.id} failed:`,
    err.message
  );
});