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

  const assessmentId = params.id;

  // Ownership and school isolation in one query.
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, schoolId: user.schoolId, teacherId: teacher.id },
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
  const { results } = parsed.data;

  // No mark may exceed the assessment's maximum.
  if (assessment.maxMarks !== null) {
    const max = Number(assessment.maxMarks);
    if (results.some((r) => r.marksObtained != null && r.marksObtained > max)) {
      return NextResponse.json({ error: `Marks cannot be more than ${max}` }, { status: 400 });
    }
  }

  try {
    // Every student must be an active student of THIS assessment's class, in this school.
    const studentIds = results.map((r) => r.studentId);
    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        streamId: assessment.streamId,
        schoolId: user.schoolId,
        deletedAt: null,
      },
      select: { id: true },
    });
    const found = new Set(students.map((s) => s.id));
    if (studentIds.some((id) => !found.has(id))) {
      return NextResponse.json(
        { error: "Some students are not in this assessment's class" },
        { status: 400 }
      );
    }

    // Every rubric sub-strand must belong to this assessment's learning area.
    const subStrandIds = [
      ...new Set(results.flatMap((r) => (r.rubricScores ?? []).map((s) => s.subStrandId))),
    ];
    if (subStrandIds.length > 0) {
      const valid = await prisma.subStrand.findMany({
        where: {
          id: { in: subStrandIds },
          strand: { learningAreaId: assessment.learningAreaId },
        },
        select: { id: true },
      });
      if (valid.length !== subStrandIds.length) {
        return NextResponse.json(
          { error: 'Some rubric items do not belong to this learning area' },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const result of results) {
        // 1. Upsert the main AssessmentResult
        const assessmentResult = await tx.assessmentResult.upsert({
          where: {
            assessmentId_studentId: { assessmentId, studentId: result.studentId },
          },
          update: {
            marksObtained: result.marksObtained,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
          },
          create: {
            assessmentId,
            studentId: result.studentId,
            marksObtained: result.marksObtained,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
          },
        });

        // 2. Handle Rubric Scores if provided
        if (result.rubricScores && result.rubricScores.length > 0) {
          // Delete existing scores for this student/assessment to avoid duplicates
          await tx.rubricScore.deleteMany({ where: { resultId: assessmentResult.id } });

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
    });

    // Counts only: no student marks or comments go into the audit log.
    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'assessment.results_saved',
      tableName: 'assessment_results',
      recordId: assessmentId,
      newData: { studentCount: results.length, assessmentStatus: assessment.status },
    });

    return NextResponse.json({ success: true, saved: results.length });
  } catch (error) {
    console.error('Bulk upsert results error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
