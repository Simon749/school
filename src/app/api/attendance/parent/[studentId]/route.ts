import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || user.role !== "parent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify this parent is linked to the student
  const guardian = await prisma.guardian.findFirst({
    where: { userId: user.id, studentId: params.studentId, isActive: true },
  });
  if (!guardian) return NextResponse.json({ error: "Not your child" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [daily, lessons, student] = await Promise.all([
    prisma.studentDailyAttendance.findUnique({
      where: { studentId_date: { studentId: params.studentId, date: new Date(dateParam) } },
    }),
    prisma.studentLessonAttendance.findMany({
      where: { studentId: params.studentId, date: new Date(dateParam) },
      include: { slot: { include: { learningArea: true, period: true } } },
      orderBy: { slot: { period: { orderIndex: "asc" } } },
    }),
    prisma.student.findUnique({
      where: { id: params.studentId },
      include: { stream: { include: { grade: true } } },
    }),
  ]);

  return NextResponse.json({ student, date: dateParam, daily, lessons });
}