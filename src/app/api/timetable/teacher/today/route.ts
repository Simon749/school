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

  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher record not found" }, { status: 404 });

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...

  // ── Class-teacher panel (attendance only — see AGENTS.md §36 on why
  // marks/ranking data isn't included here without the approved model) ──
  let classTeacherPanel: {
    stream: { id: string; name: string; grade: string };
    studentCount: number;
    attendanceTrend: { date: string; pct: number | null }[];
    flaggedStudents: { studentId: string; name: string; absences: number }[];
  } | null = null;

  // NOTE: assumes `teacher.isClassTeacher` / `teacher.classTeacherStreamId`
  // and a `studentDailyAttendance` model — inferred from your existing
  // naming convention (teacherAttendance, timetableSlot, etc.), not
  // verified against your actual schema.prisma. Flag if these differ.
  if (teacher.isClassTeacher && teacher.classTeacherStreamId) {
    const stream = await prisma.stream.findUnique({
      where: { id: teacher.classTeacherStreamId },
      include: { grade: { select: { name: true } } },
    });

    if (stream) {
      const students = await prisma.student.findMany({
        where: { streamId: stream.id, schoolId: user.schoolId, status: "active", deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      });
      const studentIds = students.map((s) => s.id);

      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - 7);
      windowStart.setHours(0, 0, 0, 0);

      const attendanceRecords = studentIds.length
        ? await prisma.studentDailyAttendance.findMany({
            where: { studentId: { in: studentIds }, date: { gte: windowStart } },
            select: { studentId: true, date: true, status: true },
          })
        : [];

      // Daily attendance %, last 5 dates that have any records
      const byDate = new Map<string, { present: number; total: number }>();
      for (const r of attendanceRecords) {
        const key = r.date.toISOString().split("T")[0];
        const bucket = byDate.get(key) || { present: 0, total: 0 };
        bucket.total += 1;
        if (r.status === "present" || r.status === "late") bucket.present += 1;
        byDate.set(key, bucket);
      }
      const attendanceTrend = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-5)
        .map(([date, v]) => ({
          date,
          pct: v.total > 0 ? Math.round((v.present / v.total) * 100) : null,
        }));

      // Students with 2+ absences in the last 7 days
      const absenceCounts = new Map<string, number>();
      for (const r of attendanceRecords) {
        if (r.status === "absent") {
          absenceCounts.set(r.studentId, (absenceCounts.get(r.studentId) || 0) + 1);
        }
      }
      const flaggedStudents = students
        .filter((s) => (absenceCounts.get(s.id) || 0) >= 2)
        .map((s) => ({
          studentId: s.id,
          name: `${s.firstName} ${s.lastName}`,
          absences: absenceCounts.get(s.id) || 0,
        }))
        .sort((a, b) => b.absences - a.absences);

      classTeacherPanel = {
        stream: { id: stream.id, name: stream.name, grade: stream.grade.name },
        studentCount: students.length,
        attendanceTrend,
        flaggedStudents,
      };
    }
  }

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ slots: [], dayOfWeek, isWeekend: true, classTeacherPanel });
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

  return NextResponse.json({
    slots,
    periods,
    dayOfWeek,
    date: today.toISOString().split("T")[0],
    classTeacherPanel,
  });
}