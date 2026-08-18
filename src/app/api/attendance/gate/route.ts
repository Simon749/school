import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

/** Gate arrival scan or manual receptionist entry */
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || !["admin", "teacher", "it_admin"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { studentId, arrivedAt } = body as { studentId: string; arrivedAt?: string };
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId: user.schoolId, deletedAt: null },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const today = new Date().toISOString().split("T")[0];
  const arrival = arrivedAt ? new Date(arrivedAt) : new Date();

  const record = await prisma.studentDailyAttendance.upsert({
    where: { studentId_date: { studentId, date: new Date(today) } },
    update: { arrivedAt: arrival, status: "present" },
    create: {
      schoolId: user.schoolId,
      studentId,
      date: new Date(today),
      arrivedAt: arrival,
      status: "present",
    },
  });

  return NextResponse.json({ success: true, record }, { status: 201 });
}
