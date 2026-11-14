import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { z } from 'zod';

const marksEntrySchema = z.object({
  assessmentId: z.string().uuid(),
  results: z.array(
    z.object({
      studentId: z.string().uuid(),
      marksObtained: z.number().min(0).optional(),
      teacherComment: z.string().max(500).optional(),
    })
  ),
});

export async function POST(req: NextRequest) {
  // 1. Only teachers (for their own assessments) or admins can enter marks
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

  // 2. Verify assessment belongs to caller's school and is not locked
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId, schoolId: user.schoolId },
    include: { stream: { select: { id: true, schoolId: true } } },
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

  // 3. Verify teacher owns this assessment (unless admin)
  if (user.role !== 'admin' && assessment.teacherId !== user.id) {
    // Check if they are a valid substitute (simplified for brevity)
    return NextResponse.json({ error: 'You are not assigned to this assessment' }, { status: 403 });
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);

  // 4. Atomic upsert + Audit (R5-01)
  await prisma.$transaction(async (tx) => {
    const upsertPromises = results.map(async (r) => {
      // Verify student belongs to the assessment's stream and school
      const student = await tx.student.findUnique({
        where: { id: r.studentId, schoolId: user.schoolId, streamId: assessment.streamId },
      });
      if (!student) {
        throw new Error(`Student ${r.studentId} is not in this assessment's class`);
      }

      return tx.assessmentResult.upsert({
        where: { assessmentId_studentId: { assessmentId, studentId: r.studentId } },
        update: {
          marksObtained: r.marksObtained !== undefined ? r.marksObtained : undefined,
          teacherComment: r.teacherComment !== undefined ? r.teacherComment : undefined,
          submittedAt: new Date(),
        },
        create: {
          schoolId: user.schoolId, // ➕ R5-04: Strict tenancy
          assessmentId,
          studentId: r.studentId,
          marksObtained: r.marksObtained ?? null,
          teacherComment: r.teacherComment ?? null,
          submittedAt: new Date(),
        },
      });
    });

    await Promise.all(upsertPromises);

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
}
