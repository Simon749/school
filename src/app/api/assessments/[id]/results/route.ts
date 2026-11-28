// src/app/api/assessments/[id]/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTeacher } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { bulkUpsertResultsSchema } from '@/lib/validations/results.schema';

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

  const parsed = bulkUpsertResultsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const assessment = await prisma.assessment.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id },
    include: {
      learningArea: { include: { strands: { include: { subStrands: { select: { id: true } } } } } },
    },
  });
  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found or access denied' }, { status: 404 });
  }
  if (assessment.status === 'locked') {
    return NextResponse.json(
      { error: 'Assessment is locked and cannot be edited' },
      { status: 403 }
    );
  }
  if (assessment.status === 'published') {
    return NextResponse.json(
      { error: 'Published assessment results cannot be edited' },
      { status: 409 }
    );
  }

  const { results } = parsed.data;
  const maxMarks = assessment.maxMarks === null ? null : Number(assessment.maxMarks);
  const hasRubric = assessment.learningArea.strands.some((strand) => strand.subStrands.length > 0);
  if (
    maxMarks !== null &&
    results.some((result) => result.marksObtained != null && result.marksObtained > maxMarks)
  ) {
    return NextResponse.json({ error: `Marks cannot be more than ${maxMarks}` }, { status: 400 });
  }

  for (const result of results) {
    const hasRubricScores = (result.rubricScores?.length ?? 0) > 0;
    const status =
      result.resultStatus ??
      (result.marksObtained != null || hasRubricScores ? 'scored' : 'not_entered');

    if (status === 'absent' && result.marksObtained != null && result.marksObtained !== 0) {
      return NextResponse.json(
        { error: 'An absent learner must have a score of zero' },
        { status: 400 }
      );
    }
    if (status === 'scored' && !hasRubric && result.marksObtained == null) {
      return NextResponse.json(
        { error: 'A scored numerical result must include marks' },
        { status: 400 }
      );
    }
    if (status === 'scored' && hasRubric && !hasRubricScores) {
      return NextResponse.json(
        { error: 'A scored CBC result must include at least one rubric score' },
        { status: 400 }
      );
    }
  }

  try {
    const studentIds = results.map((result) => result.studentId);
    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        streamId: assessment.streamId,
        schoolId: user.schoolId,
        status: 'active',
        deletedAt: null,
      },
      select: { id: true },
    });
    const foundStudents = new Set(students.map((student) => student.id));
    if (studentIds.some((id) => !foundStudents.has(id))) {
      return NextResponse.json(
        { error: "Some students are not active members of this assessment's class" },
        { status: 400 }
      );
    }

    const subStrandIds = [
      ...new Set(
        results.flatMap((result) =>
          (result.rubricScores ?? []).map((score) => score.subStrandId)
        )
      ),
    ];
    if (subStrandIds.length > 0) {
      const validSubStrands = assessment.learningArea.strands.flatMap((strand) =>
        strand.subStrands.map((subStrand) => subStrand.id)
      );
      if (subStrandIds.some((id) => !validSubStrands.includes(id))) {
        return NextResponse.json(
          { error: 'Some rubric items do not belong to this assessment learning area' },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // Claim a row lock before writing. Publication uses the same conditional
      // update, so a save and publish request cannot pass each other's status check.
      const editable = await tx.assessment.updateMany({
        where: {
          id: assessment.id,
          schoolId: user.schoolId,
          teacherId: teacher.id,
          status: { notIn: ['published', 'locked'] },
        },
        data: { updatedAt: new Date() },
      });
      if (editable.count !== 1) {
        throw new Error('ASSESSMENT_NOT_EDITABLE');
      }

      for (const result of results) {
        const status =
          result.resultStatus ??
          (result.marksObtained != null || (result.rubricScores?.length ?? 0) > 0
            ? 'scored'
            : 'not_entered');
        const marksObtained =
          status === 'absent' ? 0 : status === 'not_entered' ? null : result.marksObtained ?? null;
        const assessmentResult = await tx.assessmentResult.upsert({
          where: {
            assessmentId_studentId: { assessmentId: assessment.id, studentId: result.studentId },
          },
          update: {
            resultStatus: status,
            marksObtained,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
            schoolId: user.schoolId,
          },
          create: {
            assessmentId: assessment.id,
            studentId: result.studentId,
            schoolId: user.schoolId,
            resultStatus: status,
            marksObtained,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
          },
        });

        // When rubricScores is supplied, replace the set even when it is empty.
        // This allows switching a result to ABSENT / NOT_ENTERED to clear stale scores.
        if (result.rubricScores !== undefined) {
          await tx.rubricScore.deleteMany({ where: { resultId: assessmentResult.id } });
          if (status === 'scored' && result.rubricScores.length > 0) {
            await tx.rubricScore.createMany({
              data: result.rubricScores.map((score) => ({
                resultId: assessmentResult.id,
                subStrandId: score.subStrandId,
                score: score.score,
                comment: score.comment,
              })),
            });
          }
        }
      }
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'assessment.results_saved',
      tableName: 'assessment_results',
      recordId: assessment.id,
      newData: { studentCount: results.length, assessmentStatus: assessment.status },
    });

    return NextResponse.json({ success: true, saved: results.length });
  } catch (error) {
    if (error instanceof Error && error.message === 'ASSESSMENT_NOT_EDITABLE') {
      return NextResponse.json(
        { error: 'Published or locked assessment results cannot be edited' },
        { status: 409 }
      );
    }
    console.error('Bulk upsert results error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
