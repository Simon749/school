import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { stkPush } from "@/lib/mpesa/daraja";
import { mpesaQueue } from "@/lib/queue";
import { generateReceiptNumber } from "@/lib/fees/receipt";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true, phone: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { studentId, amount, phone: overridePhone } = body;

  if (!studentId || !amount || amount <= 0) {
    return NextResponse.json({ error: "studentId and positive amount required" }, { status: 400 });
  }

  // Verify student belongs to school
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
    include: { stream: { include: { grade: true } } },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Determine phone: parent's registered phone, or override
  const phone = overridePhone || user.phone;
  if (!phone) {
    return NextResponse.json({ error: "No phone number available for STK Push" }, { status: 400 });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) return NextResponse.json({ error: "No current term" }, { status: 400 });

  // Idempotency: check for pending payment in last 5 minutes to prevent double-push
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentPending = await prisma.feePayment.findFirst({
    where: {
      studentId,
      termId: currentTerm.id,
      paymentMethod: "mpesa",
      paidAt: { gte: fiveMinAgo },
      isReversed: false,
    },
  });
  if (recentPending) {
    return NextResponse.json(
      { error: "A payment is already in progress. Please wait 5 minutes." },
      { status: 429 }
    );
  }

  // Generate a provisional receipt number (will be replaced by real MPesa code on callback)
  const provisionalReceipt = await generateReceiptNumber(user.schoolId);

  const accountReference = `${student.admissionNumber || student.nemisNumber}`.slice(0, 12);
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mpesa`;

  let darajaRes;
  try {
    darajaRes = await stkPush({
      phone,
      amount: Math.round(amount),
      accountReference,
      transactionDesc: "School Fees",
      callbackUrl,
    });
  } catch (err: any) {
    console.error("STK Push error:", err);
    return NextResponse.json({ error: err.message || "MPesa request failed" }, { status: 502 });
  }

  if (darajaRes.ResponseCode !== "0") {
    return NextResponse.json(
      { error: darajaRes.ResponseDescription || "MPesa rejected the request" },
      { status: 502 }
    );
  }

  // Create pending payment record
  const payment = await prisma.feePayment.create({
    data: {
      schoolId: user.schoolId,
      studentId,
      termId: currentTerm.id,
      receiptNumber: provisionalReceipt,
      amount,
      paymentMethod: "mpesa",
      paidAt: new Date(),
      mpesaPhone: phone.replace(/\D/g, ""),
      notes: `CheckoutRequestID:${darajaRes.CheckoutRequestID}|MerchantRequestID:${darajaRes.MerchantRequestID}`,
    },
  });

  // Schedule a recovery job in case callback never arrives (15 min later)
  await mpesaQueue.add(
    "mpesa-recovery",
    {
      paymentId: payment.id,
      checkoutRequestId: darajaRes.CheckoutRequestID,
    },
    { delay: 15 * 60 * 1000, attempts: 3 }
  );

  return NextResponse.json({
    success: true,
    message: "Check your phone for the MPesa prompt",
    checkoutRequestId: darajaRes.CheckoutRequestID,
    merchantRequestId: darajaRes.MerchantRequestID,
    paymentId: payment.id,
  });
}