import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get the parent user
  const parent = await prisma.user.findUnique({
    where: { clerkId },
    include: {
      guardians: {
        include: {
          student: {
            include: {
              stream: {
                include: {
                  grade: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!parent) return NextResponse.json({ error: "Parent not found" }, { status: 404 });

  // Get attendance data for each child
  const children = await Promise.all(
    parent.guardians.map(async (guardian) => {
      const student = guardian.student;
      
      // Get last 20 days of daily attendance
      const dailyAttendance = await prisma.studentDailyAttendance.findMany({
        where: { studentId: student.id },
        orderBy: { date: "desc" },
        take: 20,
      });

      // Get lesson attendance for recent days
      const lessonAttendance = await prisma.studentLessonAttendance.findMany({
        where: { studentId: student.id },
        include: {
          slot: {
            include: {
              learningArea: { select: { name: true } },
              period: { select: { startTime: true, endTime: true } },
            },
          },
        },
        orderBy: { date: "desc" },
        take: 100,
      });

      // Calculate statistics
      const totalPresent = dailyAttendance.filter((d) => d.status === "present").length;
      const totalAbsent = dailyAttendance.filter((d) => d.status === "absent").length;
      const totalLate = dailyAttendance.filter((d) => d.status === "late").length;
      const totalDays = dailyAttendance.length;
      const overallRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

      // Group lesson attendance by date for recentDays
      const attendanceByDate = new Map<string, typeof lessonAttendance>();
      lessonAttendance.forEach((lesson) => {
        const dateStr = lesson.date.toISOString().split("T")[0];
        if (!attendanceByDate.has(dateStr)) {
          attendanceByDate.set(dateStr, []);
        }
        attendanceByDate.get(dateStr)!.push(lesson);
      });

      const recentDays = Array.from(attendanceByDate.entries())
        .slice(0, 5)
        .map(([date, lessons]) => {
          const daily = dailyAttendance.find((d) => d.date.toISOString().split("T")[0] === date);
          const presentLessons = lessons.filter((l) => l.status === "present").length;
          
          return {
            date,
            arrivedAt: daily?.arrivedAt?.toISOString(),
            departedAt: daily?.departedAt?.toISOString(),
            dailyStatus: daily?.status || "absent",
            lessons: lessons.map((l) => ({
              id: l.id,
              slot: l.slot ? {
                learningArea: { name: l.slot.learningArea.name },
                period: {
                  startTime: l.slot.period.startTime.toISOString().split("T")[1].slice(0, 5),
                  endTime: l.slot.period.endTime.toISOString().split("T")[1].slice(0, 5),
                },
              } : null,
              status: l.status,
              absenceReason: l.absenceReason || undefined,
              markedAt: l.createdAt.toISOString(),
            })),
            presentLessons,
            totalLessons: lessons.length,
            attendanceRate: lessons.length > 0 ? Math.round((presentLessons / lessons.length) * 100) : 100,
          };
        });

      // Weekly trend (last 5 school days)
      const weeklyTrend = recentDays.slice(0, 5).map((day) => ({
        day: new Date(day.date).toLocaleDateString("en-KE", { weekday: "short" }),
        rate: day.attendanceRate,
      }));

      return {
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.stream.grade.name,
        stream: student.stream.name,
        overallRate,
        totalPresent,
        totalAbsent,
        totalLate,
        lastArrival: dailyAttendance[0]?.arrivedAt?.toISOString(),
        recentDays,
        weeklyTrend,
      };
    })
  );

  return NextResponse.json({ children });
}