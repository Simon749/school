import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTeacher } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { notificationQueue } from '@/lib/queue';

/**
 * Publish only after every active learner has an explicitly completed result.
 * An absence is a completed result with zero; a missing entry blocks publication.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  const assessment = await prisma.assessment.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id },
    include: {
      learningArea: {
        include: { strands: { include: { subStrands: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found or access denied' }, { status: 404 });
  }
  if (assessment.status === 'locked') {
    return NextResponse.json({ error: 'Assessment is locked' }, { status: 403 });
  }
  if (assessment.status === 'published') {
    return NextResponse.json({ error: 'Assessment is already published' }, { status: 409 });
  }

  const [students, results] = await Promise.all([
    prisma.student.findMany({
      where: {
        schoolId: user.schoolId,
        streamId: assessment.streamId,
        status: 'active',
        deletedAt: null,
      },
      select: { id: true, firstName: true },
    }),
    prisma.assessmentResult.findMany({
      where: { schoolId: user.schoolId, assessmentId: assessment.id },
      include: { rubricScores: { select: { subStrandId: true } } },
    }),
  ]);

  if (students.length === 0) {
    return NextResponse.json({ error: 'There are no active learners in this class to publish results for' }, { status: 422 });
  }

  const resultByStudent = new Map(results.map((result) => [result.studentId, result]));
  const requiredSubStrandIds = assessment.learningArea.strands.flatMap((strand) =>
    strand.subStrands.map((subStrand) => subStrand.id)
  );
  const incomplete: string[] = [];

  for (const student of students) {
    const result = resultByStudent.get(student.id);
    if (!result || result.resultStatus === 'not_entered') {
      incomplete.push(student.firstName);
      continue;
    }
    if (result.resultStatus !== 'scored' && result.resultStatus !== 'absent') {
      incomplete.push(student.firstName);
      continue;
    }
    if (result.resultStatus === 'absent') {
      if (result.marksObtained === null || Number(result.marksObtained) !== 0) incomplete.push(student.firstName);
      continue;
    }

    if (requiredSubStrandIds.length > 0) {
      const recorded = new Set(result.rubricScores.map((score) => score.subStrandId));
      if (requiredSubStrandIds.some((id) => !recorded.has(id))) incomplete.push(student.firstName);
    } else if (result.marksObtained === null) {
      incomplete.push(student.firstName);
    }
  }

  if (incomplete.length > 0) {
    const preview = incomplete.slice(0, 5).join(', ');
    const suffix = incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : '';
    return NextResponse.json(
      {
        error: `Cannot publish: ${incomplete.length} learner(s) have missing or incomplete results: ${preview}${suffix}. Enter a score or explicitly mark each learner absent.`,
        incompleteCount: incomplete.length,
      },
      { status: 422 }
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Optimistic state check prevents two simultaneous publish requests.
      const changed = await tx.assessment.updateMany({
        where: { id: assessment.id, schoolId: user.schoolId, status: assessment.status },
        data: { status: 'published', publishedAt: new Date() },
      });
      if (changed.count !== 1) {
        throw new Error('ASSESSMENT_STATE_CHANGED');
      }

      const published = await tx.assessment.findFirstOrThrow({
        where: { id: assessment.id, schoolId: user.schoolId },
      });
      await logAudit(
        {
          schoolId: user.schoolId,
          actorId: user.id,
          action: 'ASSESSMENT_PUBLISHED',
          tableName: 'assessments',
          recordId: assessment.id,
          oldData: { status: assessment.status },
          newData: { status: 'published', resultCount: students.length },
        },
        tx
      );
      return published;
    });

    // Notify only the active primary guardian for learners with a completed result.
    for (const student of students) {
      const guardians = await prisma.guardian.findMany({
        where: {
          studentId: student.id,
          isPrimary: true,
          isActive: true,
          user: { isActive: true, deletedAt: null, schoolId: user.schoolId },
        },
        select: { userId: true },
        take: 1,
      });
      const parent = guardians[0];
      if (!parent) continue;

      try {
        await notificationQueue.add('notification-queue', {
          schoolId: user.schoolId,
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
      } catch (notificationError) {
        // Publication is already committed. A queue outage must not report that
        // the assessment itself failed to publish.
        console.error('Could not queue result-published notification', {
          assessmentId: assessment.id,
          studentId: student.id,
          notificationError,
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'ASSESSMENT_STATE_CHANGED') {
      return NextResponse.json({ error: 'Assessment status changed. Refresh and try again.' }, { status: 409 });
    }
    console.error('Publish assessment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
