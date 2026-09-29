import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { generateQrToken } from "@/lib/qr/token";

export async function GET(_req: NextRequest, { params }: { params: { slotId: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true, id: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: params.slotId, schoolId: user.schoolId },
    include: { period: true, school: true },
  });
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  const today = new Date().toISOString().split("T")[0];

  // Look for existing valid token
  let tokenRecord = await prisma.classroomQrToken.findFirst({
    where: {
      slotId: params.slotId,
      validFrom: { lte: new Date() },
      validUntil: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  // Generate new one if none exists
  if (!tokenRecord) {
    const periodStart = new Date(`${today}T${slot.period.startTime}`);
    const validFrom = new Date(periodStart.getTime() - 5 * 60 * 1000); // 5 min before
    const validUntil = new Date(periodStart.getTime() + 10 * 60 * 1000); // 10 min after

    const token = generateQrToken(params.slotId, today);

    tokenRecord = await prisma.classroomQrToken.create({
      data: {
        schoolId: user.schoolId,
        slotId: params.slotId,
        token,
        validFrom,
        validUntil,
      },
    });
  }

  return NextResponse.json({
    token: tokenRecord.token,
    validFrom: tokenRecord.validFrom,
    validUntil: tokenRecord.validUntil,
    slotName: slot.period.name,
  });
}