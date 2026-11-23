import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { z } from 'zod';

// Compatibility endpoint for older clients. New markbook code uses
// /api/assessments/[id]/results as the canonical results API.
const marksEntrySchema = z.object({
  assessmentId: z.string().uuid(),
  results: z.array(
    z.object({
      studentId: z.string().uuid(),
      marksObtained: z.number().finite().min(0).nullable().optional(),
      teacherComment: z.string().max(1000).nullable().optional(),
    })
  ).max(500),
});

export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin', 'teacher']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = marksEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { assessmentId, results } = parsed.data;
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, schoolId: user.schoolId },
  });
  if (!assessment) {
    return NextResponse.json(
      { error: 'Assessment not found or not in your school' },
      { status: 404 }
    );
  }
  if (assessment.status === 'locked' || assessment.status === 'published') {
    return NextResponse.json(
      { error: 'Cannot modify marks for a locked or published assessment' },
      { status: 409 }
    );
  }

  if (user.role === 'teacher') {
    const teacher = await prisma.teacher.findFirst({
      where: { userId: user.id, schoolId: user.schoolId },
      select: { id: true },
    });
    if (!teacher || assessment.teacherId !== teacher.id) {
      return NextResponse.json({ error: 'You are not assigned to this assessment' }, { status: 403 });
    }
  }

  const maxMarks = assessment.maxMarks === null ? null : Number(assessment.maxMarks);
  if (
    maxMarks !== null &&
    results.some((result) => result.marksObtained != null && result.marksObtained > maxMarks)
  ) {
    return NextResponse.json({ error: `Marks cannot be more than ${maxMarks}` }, { status: 400 });
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);
  try {
    await prisma.$transaction(async (tx) => {
      const currentAssessment = await tx.assessment.findFirst({
        where: { id: assessmentId, schoolId: user.schoolId },
        select: { status: true },
      });
      if (
        !currentAssessment ||
        currentAssessment.status === 'locked' ||
        currentAssessment.status === 'published'
      ) {
        throw new Error('ASSESSMENT_NOT_EDITABLE');
      }

      for (const result of results) {
        const student = await tx.student.findFirst({
          where: {
            id: result.studentId,
            schoolId: user.schoolId,
            streamId: assessment.streamId,
            status: 'active',
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!student) {
          throw new Error('STUDENT_NOT_IN_ASSESSMENT');
        }

        const resultStatus = result.marksObtained == null ? 'not_entered' : 'scored';
        await tx.assessmentResult.upsert({
          where: { assessmentId_studentId: { assessmentId, studentId: result.studentId } },
          update: {
            marksObtained: result.marksObtained ?? null,
            resultStatus,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
          },
          create: {
            schoolId: user.schoolId,
            assessmentId,
            studentId: result.studentId,
            marksObtained: result.marksObtained ?? null,
            resultStatus,
            teacherComment: result.teacherComment ?? null,
            submittedAt: new Date(),
          },
        });
      }

      await logAudit(
        {
          schoolId: user.schoolId,
          actorId: user.id,
          action: 'ASSESSMENT_MARKS_ENTERED',
          tableName: 'assessment_results',
          recordId: assessmentId,
          newData: { resultCount: results.length },
          ipAddress,
          userAgent,
        },
        tx
      );
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'ASSESSMENT_NOT_EDITABLE') {
      return NextResponse.json(
        { error: 'Cannot modify a published or locked assessment' },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === 'STUDENT_NOT_IN_ASSESSMENT') {
      return NextResponse.json(
        { error: 'A student is not an active member of this assessment class' },
        { status: 400 }
      );
    }
    console.error('Legacy marks entry error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
