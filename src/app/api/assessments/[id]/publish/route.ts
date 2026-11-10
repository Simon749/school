import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTeacher } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { notificationQueue } from '@/lib/queue';

/**
 * Publish an assessment's results to parents. Today this is a single teacher action; the full
 * draft → review → published → locked workflow with HoD review is R6-01 (AUD-04).
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  // 1. Verify assessment belongs to caller's school and teacher
  const assessment = await prisma.assessment.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id },
  });
  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found or access denied' }, { status: 404 });
  }
  if (assessment.status === 'locked') {
    return NextResponse.json({ error: 'Assessment is locked' }, { status: 403 });
  }
  if (assessment.status === 'published') {
    // Publishing twice would notify every parent a second time.
    return NextResponse.json({ error: 'Assessment is already published' }, { status: 409 });
  }

  try {
    // 2. Atomic update + Audit (R5-01)
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.assessment.update({
        where: { id: assessment.id, schoolId: user.schoolId }, // ➕ Defense in depth
        data: { status: 'published', publishedAt: new Date() },
      });

      await logAudit({
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'ASSESSMENT_PUBLISHED',
        tableName: 'assessments',
        recordId: assessment.id,
        oldData: { status: assessment.status },
        newData: { status: 'published' },
      }, tx);

      return result;
    });

    // 3. Notify the primary, active guardian of each student who actually HAS a result.
    const results = await prisma.assessmentResult.findMany({
      where: {
        schoolId: user.schoolId, // ➕ R5-04: Strict tenancy scoping on the new column
        assessmentId: assessment.id,
        student: { deletedAt: null, status: 'active' },
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            guardians: {
              where: {
                isPrimary: true,
                isActive: true,
                user: { isActive: true, deletedAt: null },
              },
              select: { userId: true },
            },
          },
        },
      },
    });

    for (const { student } of results) {
      const parent = student.guardians[0];
      if (!parent) continue;
      
      await notificationQueue.add('notification-queue', {
        schoolId: user.schoolId, // ➕ R5-04: Required by hardened notification worker
        userId: parent.userId,
        type: 'result-published',
        title: 'Results Published',
        body: `${student.firstName}'s ${assessment.title} results are now available`,
        data: {
          studentId: student.id,
          assessmentId: assessment.id,
          url: `/parent/${student.id}/results`,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Publish assessment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}