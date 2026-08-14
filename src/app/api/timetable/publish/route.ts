import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { termId } = body;
  if (!termId) return NextResponse.json({ error: "termId required" }, { status: 400 });

  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId: user.schoolId },
  });
  if (!term) return NextResponse.json({ error: "Invalid term" }, { status: 400 });

  const { count } = await prisma.timetableSlot.updateMany({
    where: { termId, schoolId: user.schoolId, isPublished: false },
    data: { isPublished: true },
  });

  return NextResponse.json({ success: true, publishedCount: count });
}