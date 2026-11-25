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
  if (assessment.status === 'published') {
    return NextResponse.json(
      { error: 'Published marks cannot be silently edited. Use the special exam endpoint.' },
      { status: 409 }
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
    if (results.some((r: any) => r.marksObtained != null && r.marksObtained !== '' && Number(r.marksObtained) > max)) {
      return NextResponse.json({ error: `Marks cannot be more than ${max}` }, { status: 400 });
    }
  }

  try {
    // Every student must be an active student of THIS assessment's class, in this school.
    const studentIds = results.map((r: any) => r.studentId);
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
    if (studentIds.some((id: string) => !found.has(id))) {
      return NextResponse.json(
        { error: "Some students are not in this assessment's class" },
        { status: 400 }
      );
    }

    // Every rubric sub-strand must belong to this assessment's learning area.
    const subStrandIds = [
      ...new Set(results.flatMap((r: any) => (r.rubricScores ?? []).map((s: any) => s.subStrandId))),
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
      const upserts = results.map((r: any) => {
        const isBlank =
          r.marksObtained === '' || r.marksObtained === null || r.marksObtained === undefined;
        const isExplicitlyAbsent = r.resultStatus === 'absent' || r.isAbsent === true;

        let dataPayload: any = {};

        if (isExplicitlyAbsent) {
          dataPayload = {
            isAbsent: true,
            marksObtained: null,
            resultStatus: 'absent',
            submittedAt: new Date(),
          };
        } else if (isBlank) {
          dataPayload = {
            isAbsent: false,
            marksObtained: null,
            resultStatus: 'not_entered',
            submittedAt: null,
          };
        } else {
          // Genuine score (including exactly 0)
          dataPayload = {
            isAbsent: false,
            marksObtained: Number(r.marksObtained),
            resultStatus: 'scored',
            submittedAt: new Date(),
          };
        }

        const commentFields =
          r.teacherComment !== undefined ? { teacherComment: r.teacherComment } : {};

        return {
          result: r,
          payload: {
            where: {
              // Adjust this unique constraint name to match your schema's @@unique definition
              assessmentId_studentId: {
                assessmentId: assessment.id,
                studentId: r.studentId,
              },
            },
            update: {
              ...dataPayload,
              ...commentFields,
              schoolId: user.schoolId,
            },
            create: {
              assessmentId: assessment.id,
              studentId: r.studentId,
              schoolId: user.schoolId,
              ...dataPayload,
              ...commentFields,
            },
          },
        };
      });

      const savedResults = await Promise.all(
        upserts.map(({ payload }) => tx.assessmentResult.upsert(payload))
      );

      // 2. Handle Rubric Scores if provided
      for (let i = 0; i < upserts.length; i++) {
        const upsert = upserts[i];
        if (!upsert) continue;

        const result = upsert.result;
        const assessmentResult = savedResults[i];

        if (!assessmentResult) continue;

        if (result.rubricScores && result.rubricScores.length > 0) {
          // Delete existing scores for this student/assessment to avoid duplicates
          await tx.rubricScore.deleteMany({ where: { resultId: assessmentResult.id } });

          await tx.rubricScore.createMany({
            data: result.rubricScores.map((score: any) => ({
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