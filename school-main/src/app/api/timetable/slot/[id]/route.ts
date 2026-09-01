import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });
  if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.timetableSlot.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}