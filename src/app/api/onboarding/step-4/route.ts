import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { gradeStreamSchema } from '@/lib/validations/onboarding';

/**
 * Wizard step 4: the admin's grades and streams (SEC-23).
 * Admin only, always the caller's own school, and SAFE TO REPEAT: an existing grade is reused
 * and streams are upserted, so re-running the wizard never creates duplicates.
 * (A database unique key on grade name per school is planned in R5-04.)
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;
  const schoolId = user.schoolId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = gradeStreamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { grades } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      for (const grade of grades) {
        const existing = await tx.grade.findFirst({
          where: { schoolId, name: grade.name },
          select: { id: true },
        });
        const gradeId =
          existing?.id ??
          (
            await tx.grade.create({
              data: {
                schoolId,
                name: grade.name,
                level: grade.level,
                cbcStage: grade.cbcStage,
              },
              select: { id: true },
            })
          ).id;

        for (const stream of grade.streams) {
          await tx.stream.upsert({
            where: { gradeId_name: { gradeId, name: stream.name } },
            update: { capacity: stream.capacity },
            create: { schoolId, gradeId, name: stream.name, capacity: stream.capacity },
          });
        }
      }

      await tx.school.update({
        where: { id: schoolId },
        data: { onboardingStep: 4 },
      });
    });

    await logAudit({
      schoolId,
      actorId: user.id,
      action: 'school.grades_configured',
      tableName: 'grades',
      newData: {
        gradeCount: grades.length,
        streamCount: grades.reduce((n, g) => n + g.streams.length, 0),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Onboarding step 4 error:', error);
    return NextResponse.json({ error: 'Failed to save grades and streams' }, { status: 500 });
  }
}
