import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db";
import { allocatePayment } from "@/lib/fees/allocation";
import { generateReceiptNumber } from "@/lib/fees/receipt";
import { queryStkStatus } from "@/lib/mpesa/daraja";

export const mpesaWorker = new Worker(
  "mpesa",
  async (job) => {
    const { name } = job;

    if (name === "mpesa-callback") {
      return await handleCallback(job.data);
    }
    if (name === "mpesa-recovery") {
      return await handleRecovery(job.data);
    }
    throw new Error(`Unknown mpesa job: ${name}`);
  },
  { connection, concurrency: 3 }
);

async function handleCallback(data: any) {
  const { checkoutRequestId, resultCode, resultDesc, callbackMetadata } = data;

  // Idempotency: have we already processed this checkout?
  const existing = await prisma.feePayment.findFirst({
    where: { notes: { contains: checkoutRequestId } },
  });
  if (!existing) {
    console.error(`[MpesaWorker] Payment record missing for ${checkoutRequestId}`);
    return { missing: true };
  }
  if (existing.mpesaCode) {
    console.log(`[MpesaWorker] Already processed: ${checkoutRequestId}`);
    return { alreadyProcessed: true };
  }

  // Payment failed on user's phone
  if (resultCode !== 0) {
    await prisma.feePayment.update({
      where: { id: existing.id },
      data: {
        notes: `${existing.notes}|FAILED:${resultCode}:${resultDesc}`,
      },
    });
    console.log(`[MpesaWorker] ❌ Payment failed: ${resultDesc}`);
    return { failed: true, reason: resultDesc };
  }

  // Extract metadata
  const items = callbackMetadata?.Item || [];
  const amount = Number(items.find((i: any) => i.Name === "Amount")?.Value || 0);
  const mpesaCode = items.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value as string;
  const phone = String(items.find((i: any) => i.Name === "PhoneNumber")?.Value || "");

  if (!mpesaCode || !amount) {
    throw new Error(`Missing critical callback data: ${JSON.stringify(callbackMetadata)}`);
  }

  // Run allocation
  const allocation = await allocatePayment({
    studentId: existing.studentId,
    termId: existing.termId,
    amount,
    existingPaymentId: existing.id,
  });

  // Generate real receipt number
  const receiptNumber = await generateReceiptNumber(existing.schoolId);

  // Update payment record
  await prisma.feePayment.update({
    where: { id: existing.id },
    data: {
      receiptNumber,
      amount,
      mpesaCode,
      mpesaPhone: phone,
      mpesaName: phone, // We don't get name from callback; use phone as placeholder
      allocations: allocation.allocations,
      overpaymentAmount: allocation.overpayment,
      overpaymentAction: allocation.overpayment > 0 ? "carry_forward" : null,
      notes: `${existing.notes}|SUCCESS:${mpesaCode}`,
    },
  });

  // TODO: Queue notification to parent
  // await notificationQueue.add("payment-confirmation", { ... });

  console.log(`[MpesaWorker]  Payment recorded: ${receiptNumber} / ${mpesaCode} / KES ${amount}`);
  return { receiptNumber, mpesaCode, allocated: allocation.allocations };
}

async function handleRecovery(data: any) {
  const { paymentId, checkoutRequestId } = data;

  const payment = await prisma.feePayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.mpesaCode) {
    return { alreadyResolved: true }; // Either missing or already succeeded
  }

  // Query Daraja directly
  const status = await queryStkStatus(checkoutRequestId);
  console.log(`[MpesaWorker] Recovery query for ${checkoutRequestId}:`, status);

  if (status.ResultCode === "0" && status.CallbackMetadata) {
    // Re-process as if it were a callback
    return handleCallback({
      checkoutRequestId,
      resultCode: 0,
      resultDesc: "Recovered via query",
      callbackMetadata: status.CallbackMetadata,
    });
  }

  // Still pending or failed — leave for manual review
  return { status: "pending_or_failed", queryResult: status };
}

mpesaWorker.on("completed", (job) => {
  console.log(`[MpesaWorker] ${job.name} #${job.id} completed`);
});

mpesaWorker.on("failed", (job, err) => {
  console.error(`[MpesaWorker] ${job?.name} #${job?.id} failed:`, err.message);
});