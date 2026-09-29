import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

// GET /api/attendance/teacher/history?days=14
// Scoped strictly to the logged-in teacher's own records — this is the
// counterpart to the admin-only GET in /api/attendance/teacher/route.ts,
// which a teacher cannot call (role !== "admin" → 403). Kept as a
// separate route/file rather than branching inside that one, so the
// admin (school-wide) and teacher (self-only) authorization paths never
// share a code path — deliberate, per AGENTS.md §9/§59 (don't let an
// admin-scoped query accidentally become reachable by a non-admin).
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, id: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
  });
  if (!teacher) return NextResponse.json({ error: "Teacher record not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 14, 1), 60);

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - days);
  windowStart.setHours(0, 0, 0, 0);

  const records = await prisma.teacherAttendance.findMany({
    where: {
      teacherId: teacher.id, // hard scope — never omit this
      schoolId: user.schoolId,
      date: { gte: windowStart },
    },
    include: {
      slot: {
        include: {
          period: true,
          learningArea: { select: { name: true } },
          stream: { include: { grade: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ date: "desc" }],
  });

  const summary = {
    present: records.filter((r) => r.status === "present").length,
    late: records.filter((r) => r.status === "late").length,
    covered: records.filter((r) => r.status === "covered").length,
  };

  return NextResponse.json({
    days,
    summary,
    // Note: this only lists lessons where a check-in record actually
    // exists. It does not synthesize "absent" rows for slots you never
    // checked into — that would require cross-referencing the full
    // timetable for each past date, which this endpoint doesn't do.
    // Flagging so nothing here looks more complete than it is (AGENTS.md §4).
    records: records.map((r) => ({
      id: r.id,
      date: r.date.toISOString().split("T")[0],
      status: r.status,
      minutesLate: r.minutesLate,
      checkedInAt: r.checkedInAt,
      lessonNotes: r.lessonNotes,
      learningArea: r.slot?.learningArea?.name ?? null,
      stream: r.slot ? `${r.slot.stream.grade.name} ${r.slot.stream.name}` : null,
      period: r.slot?.period?.name ?? null,
    })),
  });
}