import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTeacher } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { notificationQueue } from '@/lib/queue';

/**
 * Publish only after every active learner has an explicitly completed result.
 * The assessment row is claimed inside the transaction before validating results.
 * The save endpoint claims the same row, preventing a save/publish race.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  const assessment = await prisma.assessment.findFirst({
    where: { id: params.id, schoolId: user.schoolId, teacherId: teacher.id },
    include: {
      learningArea: {
        include: { strands: { include: { subStrands: { select: { id: true } } } } },
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

  try {
    const { published, students } = await prisma.$transaction(async (tx) => {
      // Claim and lock the assessment row first. The results-save endpoint uses
      // the same conditional update, so concurrent writes are serialized here.
      const claimed = await tx.assessment.updateMany({
        where: {
          id: assessment.id,
          schoolId: user.schoolId,
          teacherId: teacher.id,
          status: assessment.status,
        },
        data: { status: 'published', publishedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new Error('ASSESSMENT_STATE_CHANGED');
      }

      // Read the roster and results only after acquiring the assessment lock.
      const [activeStudents, results] = await Promise.all([
        tx.student.findMany({
          where: {
            schoolId: user.schoolId,
            streamId: assessment.streamId,
            status: 'active',
            deletedAt: null,
          },
          select: { id: true, firstName: true },
        }),
        tx.assessmentResult.findMany({
          where: { schoolId: user.schoolId, assessmentId: assessment.id },
          include: { rubricScores: { select: { subStrandId: true } } },
        }),
      ]);

      if (activeStudents.length === 0) {
        throw new Error('ASSESSMENT_NO_ACTIVE_STUDENTS');
      }

      const resultByStudent = new Map(results.map((result) => [result.studentId, result]));
      const requiredSubStrandIds = assessment.learningArea.strands.flatMap((strand) =>
        strand.subStrands.map((subStrand) => subStrand.id)
      );
      const incomplete: string[] = [];

      for (const student of activeStudents) {
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
          if (result.marksObtained === null || Number(result.marksObtained) !== 0) {
            incomplete.push(student.firstName);
          }
          continue;
        }

        if (requiredSubStrandIds.length > 0) {
          const recorded = new Set(result.rubricScores.map((score) => score.subStrandId));
          if (requiredSubStrandIds.some((id) => !recorded.has(id))) {
            incomplete.push(student.firstName);
          }
        } else if (result.marksObtained === null) {
          incomplete.push(student.firstName);
        }
      }

      if (incomplete.length > 0) {
        const preview = incomplete.slice(0, 5).join(', ');
        const suffix = incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : '';
        throw new Error(
          `ASSESSMENT_RESULTS_INCOMPLETE|${incomplete.length}|${preview}${suffix}`
        );
      }

      const publishedAssessment = await tx.assessment.findFirstOrThrow({
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
          newData: { status: 'published', resultCount: activeStudents.length },
        },
        tx
      );

      return { published: publishedAssessment, students: activeStudents };
    });

    // Publication is committed. Queue failures must not roll it back or report
    // that publishing itself failed.
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
        console.error('Could not queue result-published notification', {
          assessmentId: assessment.id,
          studentId: student.id,
          notificationError,
        });
      }
    }

    return NextResponse.json(published);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ASSESSMENT_STATE_CHANGED') {
        return NextResponse.json(
          { error: 'Assessment status changed. Refresh and try again.' },
          { status: 409 }
        );
      }
      if (error.message === 'ASSESSMENT_NO_ACTIVE_STUDENTS') {
        return NextResponse.json(
          { error: 'There are no active learners in this class to publish results for' },
          { status: 422 }
        );
      }
      if (error.message.startsWith('ASSESSMENT_RESULTS_INCOMPLETE|')) {
        const [, count, names] = error.message.split('|');
        return NextResponse.json(
          {
            error:
              `Cannot publish: ${count} learner(s) have missing or incomplete results: ${names}. ` +
              'Enter a score or explicitly mark each learner absent.',
            incompleteCount: Number(count),
          },
          { status: 422 }
        );
      }
    }
    console.error('Publish assessment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
