import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slotId, date } = await req.json();
  if (!slotId || !date) return NextResponse.json({ error: "slotId and date required" }, { status: 400 });

  const register = await prisma.lessonRegister.upsert({
    where: { slotId_date: { slotId, date: new Date(date) } },
    update: { isLocked: false, unlockedAt: new Date(), unlockedBy: user.id },
    create: {
      schoolId: user.schoolId,
      slotId,
      date: new Date(date),
      isLocked: false,
      unlockedAt: new Date(),
      unlockedBy: user.id,
    },
  });

  return NextResponse.json({ success: true, register });
}
