import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { schoolIdentitySchema } from '@/lib/validations/onboarding';

/**
 * Wizard step 1: edit the signed-in ADMIN'S OWN school's identity (SEC-22).
 *
 * Decisions D15/D16: nobody creates a school by signing in. Schools are provisioned by a
 * platform super admin (`pnpm provision-school`), who also creates the school's first admin.
 * So this route never creates a school, never links a user to one, and never trusts a
 * `schoolId` from the request — the school always comes from the caller's own session.
 */
export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  // Unknown keys (including any `schoolId` the wizard still sends) are stripped by the schema.
  const parsed = schoolIdentitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const data = parsed.data;

  try {
    const before = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: {
        name: true,
        knecCode: true,
        county: true,
        subCounty: true,
        phone: true,
        email: true,
        logoUrl: true,
        onboardingStep: true,
      },
    });
    if (!before) return NextResponse.json({ error: 'School not found' }, { status: 404 });

    const next = {
      name: data.name,
      knecCode: data.knecCode || null,
      county: data.county,
      subCounty: data.subCounty,
      phone: data.phone,
      email: data.email,
      logoUrl: data.logoUrl || null,
    };

    const school = await prisma.school.update({
      where: { id: user.schoolId },
      // Editing step 1 later must not push the wizard's saved progress backwards.
      data: { ...next, onboardingStep: Math.max(before.onboardingStep ?? 0, 1) },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'school.identity_updated',
      tableName: 'schools',
      recordId: user.schoolId,
      oldData: {
        name: before.name,
        knecCode: before.knecCode,
        county: before.county,
        subCounty: before.subCounty,
        phone: before.phone,
        email: before.email,
        logoUrl: before.logoUrl,
      },
      newData: next,
    });

    return NextResponse.json({
      success: true,
      school: { id: school.id, name: school.name, onboardingStep: school.onboardingStep },
    });
  } catch (error) {
    console.error('Onboarding step 1 error:', error);
    return NextResponse.json({ error: 'Failed to save school' }, { status: 500 });
  }
}
