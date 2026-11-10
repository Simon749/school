import { prisma } from '@/lib/db';
import { allocatePayment } from '@/lib/fees/allocation';
import { generateReceiptNumber } from '@/lib/fees/receipt';

interface MpesaCallbackData {
  checkoutRequestId: string;
  resultCode: number;
  resultDesc?: string;
  callbackMetadata?: {
    Item?: Array<{ Name: string; Value: string | number }>;
  } | null;
  sourceIp?: string;
}

export async function processMpesaCallback(data: MpesaCallbackData) {
  const {
    checkoutRequestId,
    resultCode,
    resultDesc,
    callbackMetadata,
    sourceIp,
  } = data;

  const attempt = await prisma.paymentAttempt.findUnique({
    where: { checkoutRequestId },
  });

  if (!attempt) {
    console.warn(`[MpesaWorker] Callback received for unknown checkoutRequestId: ${checkoutRequestId}`);
    return { missing: true };
  }

  if (attempt.status === 'completed') {
    console.log(`[MpesaWorker] Already processed: ${checkoutRequestId}`);
    return { alreadyProcessed: true };
  }

  if (resultCode !== 0) {
    await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'failed',
        failureReason: resultDesc ?? 'M-Pesa payment failed',
        callbackPayload: data as any,
      },
    });
    console.log(`[MpesaWorker] Payment failed: ${resultDesc}`);
    return { failed: true, reason: resultDesc };
  }

  const items = callbackMetadata?.Item ?? [];
  const callbackAmount = Number(items.find((item) => item.Name === 'Amount')?.Value ?? 0);
  const mpesaCode = String(items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value ?? '');
  const callbackPhone = String(items.find((item) => item.Name === 'PhoneNumber')?.Value ?? '');
  const mpesaName = String(items.find((item) => item.Name === 'FullName')?.Value ?? 'Unknown');

  if (!mpesaCode || !Number.isFinite(callbackAmount) || callbackAmount <= 0) {
    throw new Error(`Missing or invalid callback data: ${JSON.stringify(callbackMetadata)}`);
  }

  if (Math.abs(callbackAmount - Number(attempt.amount)) > 0.01) {
    throw new Error(`Amount mismatch: expected ${attempt.amount}, got ${callbackAmount}`);
  }

  const cleanAttemptPhone = String(attempt.phone).replace(/\D/g, '');
  const cleanCallbackPhone = callbackPhone.replace(/\D/g, '');

  if (cleanAttemptPhone.length < 9 || cleanCallbackPhone.length < 9 || !cleanCallbackPhone.endsWith(cleanAttemptPhone.slice(-9))) {
    throw new Error(`Phone mismatch: expected ${cleanAttemptPhone}, got ${cleanCallbackPhone}`);
  }

  await prisma.$transaction(async (tx: any) => {
    const allocation = await allocatePayment({
      studentId: attempt.studentId,
      termId: attempt.termId,
      amount: callbackAmount,
      tx,
    });

    const receiptNumber = await generateReceiptNumber(attempt.schoolId, tx);

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
        overpaymentAction: allocation.overpayment > 0 ? 'carry_forward' : null,
        paidAt: new Date(),
        notes: `Verified via Daraja Callback. IP: ${sourceIp || 'unknown'}`,
      },
    });

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
  });

  console.log(`[MpesaWorker] Payment recorded: KES ${callbackAmount} / ${mpesaCode}`);
  return { success: true, mpesaCode };
}