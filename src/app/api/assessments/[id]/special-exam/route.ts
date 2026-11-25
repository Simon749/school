// src/app/api/assessments/[id]/special-exam/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTeacher } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { specialExamSchema } from '@/lib/validations/results.schema';

/**
 * Record a special exam for a learner who was ABSENT when the assessment was sat.
 *
 * This is the ONLY change permitted to a published assessment (decision: a learner marked
 * absent counts as zero in rankings; if they later sit a special exam, that is the one edit).
 *
 *  - only the teacher who owns the assessment, in the caller's school (decision: subject teacher
 *    alone, fully audited - no second approver)
 *  - only a published, not locked, assessment (drafts use the normal markbook save)
 *  - only a learner whose result_status is currently 'absent': an existing score can never be
 *    overwritten here. The change is ONE conditional UPDATE, so two simultaneous requests cannot
 *    both succeed.
 *  - a reason is mandatory and, with the old and new value, goes into the audit trail
 *  - rankings are computed from the stored results when viewed, so they update by themselves
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = specialExamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.errors },
      { status: 400 }
    );
  }
  const { studentId, marksObtained, reason } = parsed.data;

  // Ownership and school isolation in one query.
  const assessment = await prisma.assessment.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id },
  });
  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found or access denied' }, { status: 404 });
  }
  if (assessment.status === 'locked') {
    return NextResponse.json({ error: 'Assessment is locked and cannot be edited' }, { status: 403 });
  }
  if (assessment.status !== 'published') {
    return NextResponse.json(
      {
        error:
          'This assessment is not published yet. Enter the marks in the markbook as normal instead.',
      },
      { status: 409 }
    );
  }
  if (assessment.maxMarks === null) {
    return NextResponse.json(
      { error: 'This assessment has no maximum mark, so it has no marks to record.' },
      { status: 409 }
    );
  }
  if (marksObtained > Number(assessment.maxMarks)) {
    return NextResponse.json(
      { error: `Marks cannot be more than ${Number(assessment.maxMarks)}` },
      { status: 400 }
    );
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // The learner must be an active learner of THIS assessment's class, in this school.
      const existing = await tx.assessmentResult.findFirst({
        where: {
          assessmentId: assessment.id,
          studentId,
          schoolId: user.schoolId,
          student: { streamId: assessment.streamId, schoolId: user.schoolId, deletedAt: null },
        },
        select: { id: true },
      });
      if (!existing) return { kind: 'not_found' as const };

      // Atomic compare-and-set: only an ABSENT result can become SCORED.
      const changed = await tx.assessmentResult.updateMany({
        where: { id: existing.id, schoolId: user.schoolId, resultStatus: 'absent' },
        data: { resultStatus: 'scored', marksObtained, submittedAt: new Date() },
      });
      if (changed.count !== 1) return { kind: 'not_absent' as const };

      // Corrections to published results must be traceable: who, why, old value, new value.
      await logAudit(
        {
          schoolId: user.schoolId,
          actorId: user.id,
          action: 'ASSESSMENT_SPECIAL_EXAM_RECORDED',
          tableName: 'assessment_results',
          recordId: existing.id,
          oldData: { resultStatus: 'absent', marksObtained: 0 },
          newData: {
            resultStatus: 'scored',
            marksObtained,
            reason,
            assessmentId: assessment.id,
            studentId,
          },
        },
        tx
      );
      return { kind: 'ok' as const };
    });

    if (outcome.kind === 'not_found') {
      return NextResponse.json(
        { error: 'That learner has no result on this assessment, or is not in its class' },
        { status: 404 }
      );
    }
    if (outcome.kind === 'not_absent') {
      return NextResponse.json(
        {
          error:
            'Only a learner marked Absent can be changed this way. Published marks cannot be edited.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Special exam error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
