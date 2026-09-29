import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { attendanceQueue, notificationQueue } from "@/lib/queue";
import { logAudit, getRequestMetadata } from "@/lib/audit";

// GET: fetch register for a slot
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });

  if (!user?.schoolId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get("slotId");
  const dateParam =
    searchParams.get("date") || new Date().toISOString().split("T")[0];

  if (!slotId) {
    return NextResponse.json(
      { error: "slotId required" },
      { status: 400 }
    );
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: {
      id: slotId,
      schoolId: user.schoolId,
    },
    include: {
      stream: {
        include: {
          students: {
            where: {
              deletedAt: null,
              status: "active",
            },
            orderBy: {
              firstName: "asc",
            },
          },
        },
      },
      learningArea: true,
      period: true,
    },
  });

  if (!slot) {
    return NextResponse.json(
      { error: "Slot not found" },
      { status: 404 }
    );
  }

  const attendanceDate = new Date(dateParam);

  const [attendances, lessonRegister] = await Promise.all([
    prisma.studentLessonAttendance.findMany({
      where: {
        slotId,
        date: attendanceDate,
        schoolId: user.schoolId,
      },
    }),
    prisma.lessonRegister.findUnique({
      where: {
        slotId_date: {
          slotId,
          date: attendanceDate,
        },
      },
    }),
  ]);

  const register = slot.stream.students.map((student) => {
    const att = attendances.find(
      (attendance) => attendance.studentId === student.id
    );

    return {
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      status: att?.status || null,
      absenceReason: att?.absenceReason || null,
      marked: !!att,
    };
  });

  return NextResponse.json({
    slot,
    date: dateParam,
    register,
    isLocked: lessonRegister?.isLocked ?? false,
  });
}

// POST: submit register
export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });

  if (!user?.schoolId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  const {
    slotId,
    date,
    entries,
  } = body as {
    slotId: string;
    date: string;
    confirmed?: boolean;
    entries: {
      studentId: string;
      status: "present" | "absent" | "late" | "excused";
      absenceReason?: string;
    }[];
  };

  if (!slotId || !date || !Array.isArray(entries)) {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: {
      id: slotId,
      schoolId: user.schoolId,
    },
    include: {
      learningArea: true,
      stream: {
        include: {
          students: {
            where: {
              deletedAt: null,
              status: "active",
            },
          },
        },
      },
    },
  });

  if (!slot) {
    return NextResponse.json(
      { error: "Slot not found" },
      { status: 404 }
    );
  }

  const attendanceDate = new Date(date);

  const existingRegister = await prisma.lessonRegister.findUnique({
    where: {
      slotId_date: {
        slotId,
        date: attendanceDate,
      },
    },
  });

  if (existingRegister?.isLocked && user.role !== "admin") {
    return NextResponse.json(
      {
        error: "Register is locked. Contact admin to unlock.",
      },
      { status: 423 }
    );
  }

  const validStudentIds = new Set(
    slot.stream.students.map((student) => student.id)
  );

  const invalid = entries.find(
    (entry) => !validStudentIds.has(entry.studentId)
  );

  if (invalid) {
    return NextResponse.json(
      { error: "Invalid student in register" },
      { status: 400 }
    );
  }

  const absentCount = entries.filter(
    (entry) => entry.status === "absent"
  ).length;

  if (
    entries.length > 0 &&
    absentCount / entries.length > 0.8 &&
    !body.confirmed
  ) {
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
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    }
  );

  const { ipAddress, userAgent } = getRequestMetadata(req);

  await logAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    action: "attendance.student.mark",
    tableName: "student_lesson_attendance",
    newData: {
      slotId,
      date,
      totalStudents: entries.length,
      presentCount: entries.filter(
        (entry) => entry.status === "present"
      ).length,
      absentCount,
    },
    ipAddress,
    userAgent,
  });

  // Send absence notifications to primary guardians
  const lessonName = slot.learningArea?.name || "class";
  const parsedDate = new Date(date);

  for (const entry of entries) {
    if (entry.status !== "absent") continue;

    const student = slot.stream.students.find(
      (item) => item.id === entry.studentId
    );

    if (!student) continue;

    const parent = await prisma.user.findFirst({
      where: {
        guardians: {
          some: {
            studentId: entry.studentId,
            isPrimary: true,
          },
        },
      },
    });

    if (parent) {
      await notificationQueue.add(
        "absence-alert",
        {
          userId: parent.id,
          type: "attendance",
          title: "Absence Alert",
          body: `${student.firstName} was absent from ${lessonName}.${
            entry.absenceReason
              ? ` Reason: ${entry.absenceReason}`
              : ""
          }`,
          data: {
            studentId: entry.studentId,
            date: parsedDate.toISOString(),
            url: `/parent/${entry.studentId}/attendance`,
          },
        },
        {
          delay: 15 * 60 * 1000,
        }
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      jobId: job.id,
    },
    { status: 202 }
  );
}