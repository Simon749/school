import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { sanitizeForRestrictedGuardian } from '@/lib/guardian/access';

export async function GET(req: NextRequest, { params }: { params: { studentId: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || user.role !== 'parent') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verify this parent is linked to the student
  const studentId = params.studentId;
  if (!studentId) {
    return NextResponse.json({ error: 'Missing student ID' }, { status: 400 });
  }

  const guardian = await prisma.guardian.findFirst({
    where: { userId: user.id, studentId, isActive: true },
  });
  if (!guardian) return NextResponse.json({ error: 'Not your child' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!dateParam) {
    return NextResponse.json({ error: 'Missing date' }, { status: 400 });
  }
  const targetDate = new Date(dateParam);

  const [daily, lessons, student] = await Promise.all([
    prisma.studentDailyAttendance.findUnique({
      where: { studentId_date: { studentId, date: targetDate } },
    }),
    prisma.studentLessonAttendance.findMany({
      where: { studentId, date: targetDate },
      include: { slot: { include: { learningArea: true, period: true } } },
      orderBy: { slot: { period: { orderIndex: 'asc' } } },
    }),
    prisma.student.findUnique({
      where: { id: studentId },
      include: { stream: { include: { grade: true } } },
    }),
  ]);

  const sanitizedStudent = student ? sanitizeForRestrictedGuardian(guardian, student as Record<string, any>) : null;
  const sanitizedDaily = daily ? sanitizeForRestrictedGuardian(guardian, daily as Record<string, any>) : null;
  const sanitizedLessons = lessons.map((lesson) =>
    sanitizeForRestrictedGuardian(guardian, lesson as Record<string, any>),
  );

  return NextResponse.json({
    student: sanitizedStudent,
    date: dateParam,
    daily: sanitizedDaily,
    lessons: sanitizedLessons,
  });
}