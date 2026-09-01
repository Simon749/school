import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, id: true, role: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Find teacher record for this user
  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher record not found" }, { status: 404 });

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  
  // Only Mon-Fri (1-5)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ slots: [], dayOfWeek, isWeekend: true });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });

  if (!currentTerm) return NextResponse.json({ error: "No current term" }, { status: 400 });

  const periods = await prisma.timetablePeriod.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { orderIndex: "asc" },
  });

  const slots = await prisma.timetableSlot.findMany({
    where: {
      schoolId: user.schoolId,
      termId: currentTerm.id,
      teacherId: teacher.id,
      dayOfWeek,
      isPublished: true,
    },
    include: {
      learningArea: { select: { name: true, color: true } },
      stream: { include: { grade: { select: { name: true } } } },
      period: true,
      secondPeriod: true,
    },
    orderBy: { period: { orderIndex: "asc" } },
  });

  return NextResponse.json({ slots, periods, dayOfWeek, date: today.toISOString().split("T")[0] });
}