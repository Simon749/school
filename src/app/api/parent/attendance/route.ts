import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';

export async function GET() {
  const guard = await requireUser(['parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  // Only this parent's ACTIVE guardian links to students in their school, with an explicit
  // field whitelist (never whole student rows).
  const guardians = await prisma.guardian.findMany({
    where: {
      userId: user.id,
      isActive: true,
      student: { schoolId: user.schoolId, deletedAt: null },
    },
    select: {
      hasRestrictedAccess: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          stream: { select: { name: true, grade: { select: { name: true } } } },
        },
      },
    },
  });

  // Get attendance data for each child
  const children = await Promise.all(
    guardians.map(async (guardian) => {
      const student = guardian.student;
      const restricted = guardian.hasRestrictedAccess; // design §7: no arrival/departure times

      // Get last 20 days of daily attendance
      const dailyAttendance = await prisma.studentDailyAttendance.findMany({
        where: { studentId: student.id, schoolId: user.schoolId },
        orderBy: { date: 'desc' },
        take: 20,
      });

      // Get lesson attendance for recent days
      const lessonAttendance = await prisma.studentLessonAttendance.findMany({
        where: { studentId: student.id, schoolId: user.schoolId },
        include: {
          slot: {
            include: {
              learningArea: { select: { name: true } },
              period: { select: { startTime: true, endTime: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        take: 100,
      });

      // Calculate statistics
      const totalPresent = dailyAttendance.filter((d) => d.status === 'present').length;
      const totalAbsent = dailyAttendance.filter((d) => d.status === 'absent').length;
      const totalLate = dailyAttendance.filter((d) => d.status === 'late').length;
      const totalDays = dailyAttendance.length;
      const overallRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

      // Group lesson attendance by date for recentDays
      const attendanceByDate = new Map<string, typeof lessonAttendance>();
      lessonAttendance.forEach((lesson) => {
        const dateIso = lesson.date.toISOString().split('T')[0];
        if (!dateIso) return;
        const dateStr = dateIso;
        if (!dateStr) return;
        if (!attendanceByDate.has(dateStr)) {
          attendanceByDate.set(dateStr, []);
        }
        attendanceByDate.get(dateStr)!.push(lesson);
      });

      const recentDays = Array.from(attendanceByDate.entries())
        .slice(0, 5)
        .map(([date, lessons]) => {
          const daily = dailyAttendance.find((d) => d.date.toISOString().split('T')[0] === date);
          const presentLessons = lessons.filter((l) => l.status === 'present').length;

          return {
            date,
            arrivedAt: restricted ? undefined : daily?.arrivedAt?.toISOString(),
            departedAt: restricted ? undefined : daily?.departedAt?.toISOString(),
            dailyStatus: daily?.status || 'absent',
            lessons: lessons.map((l) => {
              const startIso = l.slot?.period?.startTime.toISOString();
              const endIso = l.slot?.period?.endTime.toISOString();
              const startTimeStr = startIso ? startIso.split('T')[1]?.slice(0, 5) ?? '00:00' : '00:00';
              const endTimeStr = endIso ? endIso.split('T')[1]?.slice(0, 5) ?? '00:00' : '00:00';

              return {
                id: l.id,
                slot: l.slot
                  ? {
                      learningArea: { name: l.slot.learningArea.name },
                      period: {
                        startTime: startTimeStr,
                        endTime: endTimeStr,
                      },
                    }
                  : null,
                status: l.status,
                absenceReason: l.absenceReason || undefined,
                markedAt: l.createdAt.toISOString(),
              };
            }),
            presentLessons,
            totalLessons: lessons.length,
            attendanceRate:
              lessons.length > 0 ? Math.round((presentLessons / lessons.length) * 100) : 100,
          };
        });

      // Weekly trend (last 5 school days)
      const weeklyTrend = recentDays.slice(0, 5).map((day) => ({
        day: new Date(day.date).toLocaleDateString('en-KE', { weekday: 'short' }),
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
        lastArrival: restricted ? undefined : dailyAttendance[0]?.arrivedAt?.toISOString(),
        recentDays,
        weeklyTrend,
      };
    })
  );

  return NextResponse.json({ children });
}