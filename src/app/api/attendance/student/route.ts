import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { attendanceQueue } from "@/lib/queue";

// GET: fetch register for a slot
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get("slotId");
  const dateParam = searchParams.get("date") || new Date().toISOString().split("T")[0];
  if (!slotId) return NextResponse.json({ error: "slotId required" }, { status: 400 });

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId },
    include: {
      stream: { include: { students: { where: { deletedAt: null, status: "active" }, orderBy: { firstName: "asc" } } } },
      learningArea: true,
      period: true,
    },
  });
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  const attendances = await prisma.studentLessonAttendance.findMany({
    where: { slotId, date: new Date(dateParam), schoolId: user.schoolId },
  });

  const register = slot.stream.students.map((student) => {
    const att = attendances.find((a) => a.studentId === student.id);
    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      status: att?.status || null,
      absenceReason: att?.absenceReason || null,
      marked: !!att,
    };
  });

  return NextResponse.json({ slot, date: dateParam, register });
}

// POST: submit register
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { slotId, date, entries } = body as {
    slotId: string;
    date: string;
    entries: { studentId: string; status: "present" | "absent" | "late" | "excused"; absenceReason?: string }[];
  };

  if (!slotId || !date || !Array.isArray(entries)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: slotId, schoolId: user.schoolId },
    include: { stream: { include: { students: { where: { deletedAt: null, status: "active" } } } } },
  });
  if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });

  const validStudentIds = new Set(slot.stream.students.map((s) => s.id));
  const invalid = entries.find((e) => !validStudentIds.has(e.studentId));
  if (invalid) return NextResponse.json({ error: "Invalid student in register" }, { status: 400 });

  // Sanity check: >80% absent requires confirmation (client should pass confirmed=true)
  const absentCount = entries.filter((e) => e.status === "absent").length;
  if (absentCount / entries.length > 0.8 && !body.confirmed) {
    return NextResponse.json({
      requiresConfirmation: true,
      message: `You are marking ${absentCount} of ${entries.length} students absent. Is this correct?`,
    });
  }

  const job = await attendanceQueue.add(
    "student-register",
    {
      type: "student-register",
      payload: {
        schoolId: user.schoolId,
        slotId,
        date,
        markedBy: user.id,
        entries,
      },
    },
    { attempts: 3, backoff: { type: "exponential", delay: 2000 } }
  );

  return NextResponse.json({ success: true, jobId: job.id }, { status: 202 });
}