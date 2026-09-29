import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, schoolId: true, role: true },
    });

    if (!user?.schoolId || !["admin", "bursar"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { status, resolutionNote, paymentId } = body;

    if (!["resolved", "rejected", "investigating"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatedDispute = await prisma.paymentDispute.update({
      where: { id: params.id },
      data: {
        status,
        resolutionNote,
        paymentId: paymentId || null,
        resolvedBy: status === "resolved" || status === "rejected" ? user.id : null,
        resolvedAt: status === "resolved" || status === "rejected" ? new Date() : null,
      },
      include: {
        student: { select: { firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ dispute: updatedDispute });
  } catch (error) {
    console.error("Dispute resolution error:", error);
    return NextResponse.json(
      { error: "Failed to update dispute" },
      { status: 500 }
    );
  }
}