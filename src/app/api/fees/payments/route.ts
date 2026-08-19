import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { allocatePayment } from "@/lib/fees/allocation";
import { generateReceiptNumber } from "@/lib/fees/receipt";
import { notificationQueue } from "@/lib/queue"; // Added notificationQueue import

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || !["admin", "bursar"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { studentId, amount, paymentMethod, reference, notes } = body;
  if (!studentId || !amount || !paymentMethod) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) return NextResponse.json({ error: "No current term" }, { status: 400 });

  const allocation = await allocatePayment({
    studentId,
    termId: currentTerm.id,
    amount,
  });

  const receiptNumber = await generateReceiptNumber(user.schoolId);

  const payment = await prisma.feePayment.create({
    data: {
      schoolId: user.schoolId,
      studentId,
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
      overpaymentAction: allocation.overpayment > 0 ? "carry_forward" : null,
    },
  });

  // Fetch student details to get firstName for the notification
  const student = await prisma.student.findUnique({
    where: { id: payment.studentId },
    select: { firstName: true },
  });

  // Send payment confirmation notification to the primary guardian
  const parent = await prisma.user.findFirst({
    where: {
      guardians: {
        some: {
          studentId: payment.studentId,
          isPrimary: true,
        },
      },
    },
  });

  if (parent) {
    await notificationQueue.add("payment-confirmation", {
      userId: parent.id,
      type: "payment",
      title: "Payment Received",
      body: `KES ${payment.amount.toLocaleString()} received for ${student?.firstName || "your student"}. Receipt: ${payment.receiptNumber}`,
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
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!user?.schoolId || !["admin", "bursar"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get("studentId");
  const termId = searchParams.get("termId");
  const dateFrom = searchParams.get("from");
  const dateTo = searchParams.get("to");

  const where: any = { schoolId: user.schoolId, isReversed: false };
  if (studentId) where.studentId = studentId;
  if (termId) where.termId = termId;
  if (dateFrom || dateTo) {
    where.paidAt = {};
    if (dateFrom) where.paidAt.gte = new Date(dateFrom);
    if (dateTo) where.paidAt.lte = new Date(dateTo);
  }

  const payments = await prisma.feePayment.findMany({
    where,
    include: {
      student: { select: { firstName: true, lastName: true, admissionNumber: true } },
      term: { select: { name: true } },
    },
    orderBy: { paidAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ payments });
}