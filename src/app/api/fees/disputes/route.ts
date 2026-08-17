import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { queryStkStatus } from "@/lib/mpesa/daraja";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { studentId, mpesaCodeClaimed, amountClaimed, screenshotUrl } = body;

  const dispute = await prisma.paymentDispute.create({
    data: {
      schoolId: user.schoolId,
      studentId,
      raisedBy: user.id,
      mpesaCodeClaimed,
      amountClaimed,
      screenshotUrl,
    },
  });

  // Auto-attempt resolution if MPesa code exists locally
  if (mpesaCodeClaimed) {
    const localPayment = await prisma.feePayment.findFirst({
      where: { mpesaCode: mpesaCodeClaimed, schoolId: user.schoolId },
    });

    if (localPayment) {
      await prisma.paymentDispute.update({
        where: { id: dispute.id },
        data: {
          status: "resolved",
          resolvedBy: user.id,
          resolvedAt: new Date(),
          resolutionNote: "Auto-resolved: payment found in system",
          paymentId: localPayment.id,
        },
      });
      return NextResponse.json({ resolved: true, dispute: { ...dispute, status: "resolved" } });
    }
  }

  return NextResponse.json({ dispute }, { status: 201 });
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

  const disputes = await prisma.paymentDispute.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { createdAt: "desc" },
  });

  const studentIds = Array.from(new Set(disputes.map((d) => d.studentId).filter(Boolean)));
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, firstName: true, lastName: true },
  });

  const studentMap = new Map(students.map((s) => [s.id, s]));

  // Fetch raiser names separately (since raisedBy is not a relation)
  const raiserIds = Array.from(
    new Set(disputes.map((d) => d.raisedBy).filter(Boolean))
  );
  const raisers = await prisma.user.findMany({
    where: { id: { in: raiserIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const raiserMap = new Map(raisers.map((r) => [r.id, r]));

  const enriched = disputes.map((d) => ({
    ...d,
    raisedByName: raiserMap.get(d.raisedBy)
      ? `${raiserMap.get(d.raisedBy)!.firstName} ${raiserMap.get(d.raisedBy)!.lastName}`
      : "Unknown",
    studentName: studentMap.get(d.studentId)
      ? `${studentMap.get(d.studentId)!.firstName} ${studentMap.get(d.studentId)!.lastName}`
      : "Unknown",
  }));

  return NextResponse.json({ disputes: enriched });
}