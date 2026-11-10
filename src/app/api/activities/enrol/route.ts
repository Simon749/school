import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';

export async function POST(req: NextRequest) {
  // 1. Only admin, deputy, or bursar can enrol students in activities
  const guard = await requireUser(['admin', 'deputy', 'bursar']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const { studentId, activityId, termId } = body as { studentId?: string; activityId?: string; termId?: string };
  if (!studentId || !activityId || !termId) {
    return NextResponse.json({ error: 'studentId, activityId, and termId are required' }, { status: 400 });
  }

  // 2. Verify all entities belong to the caller's school (SEC-11)
  const [student, activity, term] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId, schoolId: user.schoolId, status: 'active' } }),
    prisma.activity.findUnique({ where: { id: activityId, schoolId: user.schoolId } }),
    prisma.term.findUnique({ where: { id: termId, schoolId: user.schoolId } }),
  ]);

  if (!student || !activity || !term) {
    return NextResponse.json({ error: 'Invalid student, activity, or term for your school' }, { status: 400 });
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);

  // 3. Atomic enrolment + Audit (R5-01)
  const enrolment = await prisma.$transaction(async (tx) => {
    const record = await tx.studentActivity.upsert({
      where: { studentId_activityId_termId: { studentId, activityId, termId } },
      update: {}, // Already enrolled
      create: {
        schoolId: user.schoolId, // ➕ R5-04: Strict tenancy
        studentId,
        activityId,
        termId,
        enrolledBy: user.id,
      },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'STUDENT_ACTIVITY_ENROLLED',
      tableName: 'student_activities',
      recordId: record.id,
      newData: { studentId, activityId, termId },
      ipAddress,
      userAgent,
    }, tx);

    return record;
  });

  return NextResponse.json({ success: true, enrolment }, { status: 201 });
}