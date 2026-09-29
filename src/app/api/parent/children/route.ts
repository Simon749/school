import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || user.role !== "parent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const guardians = await prisma.guardian.findMany({
    where: { userId: user.id, isActive: true },
    include: {
      student: {
        include: { stream: { include: { grade: true } } },
      },
    },
  });

  const today = new Date().toISOString().split("T")[0];
  const children = await Promise.all(
    guardians.map(async (g) => {
      const [daily, lessons] = await Promise.all([
        prisma.studentDailyAttendance.findUnique({
          where: { studentId_date: { studentId: g.student.id, date: new Date(today) } },
        }),
        prisma.studentLessonAttendance.findMany({
          where: { studentId: g.student.id, date: new Date(today) },
          include: { slot: { include: { learningArea: true } } },
        }),
      ]);
      return { student: g.student, daily, lessons };
    })
  );

  return NextResponse.json({ children });
}