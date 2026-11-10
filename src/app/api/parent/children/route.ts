import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';

/**
 * Today's snapshot for each of the parent's children (SEC-03).
 * A guardian with restricted access (court order etc., design §7) still sees the attendance
 * picture but NOT the arrival time.
 */
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

  const today = new Date().toISOString().split('T')[0];
  const children = await Promise.all(
    guardians.map(async (g) => {
      const [daily, lessons] = await Promise.all([
        prisma.studentDailyAttendance.findUnique({
          where: { studentId_date: { studentId: g.student.id, date: new Date(today) } },
          select: { status: true, arrivedAt: true },
        }),
        prisma.studentLessonAttendance.findMany({
          where: { studentId: g.student.id, schoolId: user.schoolId, date: new Date(today) },
          select: {
            status: true,
            absenceReason: true,
            slot: { select: { learningArea: { select: { name: true } } } },
          },
        }),
      ]);
      return {
        student: g.student,
        daily: daily
          ? g.hasRestrictedAccess
            ? { status: daily.status }
            : { status: daily.status, arrivedAt: daily.arrivedAt }
          : null,
        // Explicit mapping: the response shape never depends on what the query layer returns.
        lessons: lessons.map((l) => ({
          status: l.status,
          absenceReason: l.absenceReason,
          slot: { learningArea: { name: l.slot?.learningArea.name } },
        })),
      };
    })
  );

  return NextResponse.json({ children });
}
