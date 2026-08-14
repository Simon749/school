import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!admin?.schoolId || admin.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id: existingId, termId, streamId, periodId, dayOfWeek, learningAreaId, teacherId, room, isDoubleLesson, secondPeriodId } = body;

  if (!termId || !streamId || !periodId || !dayOfWeek || !learningAreaId || !teacherId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify ownership
  const [stream, teacher, period, learningArea] = await Promise.all([
    prisma.stream.findFirst({ where: { id: streamId, schoolId: admin.schoolId } }),
    prisma.teacher.findFirst({ where: { id: teacherId, schoolId: admin.schoolId } }),
    prisma.timetablePeriod.findFirst({ where: { id: periodId, schoolId: admin.schoolId } }),
    prisma.learningArea.findFirst({ where: { id: learningAreaId, schoolId: admin.schoolId } }),
  ]);

  if (!stream || !teacher || !period || !learningArea) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  }

  // Conflict checks
  const conflictWhere = existingId ? { NOT: { id: existingId } } : {};

  const [teacherConflict, streamConflict] = await Promise.all([
    prisma.timetableSlot.findFirst({
      where: {
        teacherId,
        periodId,
        dayOfWeek,
        termId,
        ...conflictWhere,
      },
      include: { stream: { include: { grade: true } }, learningArea: true },
    }),
    prisma.timetableSlot.findFirst({
      where: {
        streamId,
        periodId,
        dayOfWeek,
        termId,
        ...conflictWhere,
      },
      include: { teacher: { include: { user: true } }, learningArea: true },
    }),
  ]);

  if (teacherConflict) {
    return NextResponse.json(
      {
        error: "Teacher conflict",
        conflict: {
          type: "teacher",
          message: `${teacher.user.firstName} ${teacher.user.lastName} is already assigned to ${teacherConflict.learningArea.name} for ${teacherConflict.stream.grade.name} ${teacherConflict.stream.name} at this time.`,
        },
      },
      { status: 409 }
    );
  }

  if (streamConflict) {
    return NextResponse.json(
      {
        error: "Stream conflict",
        conflict: {
          type: "stream",
          message: `${stream.grade.name} ${stream.name} already has ${streamConflict.learningArea.name} with ${streamConflict.teacher.user.firstName} ${streamConflict.teacher.user.lastName} at this time.`,
        },
      },
      { status: 409 }
    );
  }

  // Check second period if double lesson
  if (isDoubleLesson && secondPeriodId) {
    const [teacherConflict2, streamConflict2] = await Promise.all([
      prisma.timetableSlot.findFirst({
        where: { teacherId, periodId: secondPeriodId, dayOfWeek, termId, ...conflictWhere },
      }),
      prisma.timetableSlot.findFirst({
        where: { streamId, periodId: secondPeriodId, dayOfWeek, termId, ...conflictWhere },
      }),
    ]);
    if (teacherConflict2) {
      return NextResponse.json({ error: "Teacher conflict", conflict: { type: "teacher", message: "Teacher is already booked during the second period." } }, { status: 409 });
    }
    if (streamConflict2) {
      return NextResponse.json({ error: "Stream conflict", conflict: { type: "stream", message: "Stream already has a lesson during the second period." } }, { status: 409 });
    }
  }

  const data = {
    schoolId: admin.schoolId,
    termId,
    streamId,
    periodId,
    dayOfWeek,
    learningAreaId,
    teacherId,
    room: room || null,
    isDoubleLesson: isDoubleLesson || false,
    secondPeriodId: isDoubleLesson ? secondPeriodId || null : null,
  };

  let slot;
  if (existingId) {
    slot = await prisma.timetableSlot.update({
      where: { id: existingId },
      data,
      include: {
        learningArea: { select: { id: true, name: true, color: true } },
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        stream: { include: { grade: { select: { name: true } } } },
        period: true,
      },
    });
  } else {
    slot = await prisma.timetableSlot.create({
      data,
      include: {
        learningArea: { select: { id: true, name: true, color: true } },
        teacher: { include: { user: { select: { firstName: true, lastName: true } } } },
        stream: { include: { grade: { select: { name: true } } } },
        period: true,
      },
    });
  }

  return NextResponse.json({ success: true, slot }, { status: existingId ? 200 : 201 });
}