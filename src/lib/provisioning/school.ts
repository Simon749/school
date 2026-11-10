import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

/**
 * Creating a school (decisions D15 + D16): ONLY a platform super admin may do it, from the
 * command line (`pnpm provision-school`) — there is deliberately no HTTP route that creates a
 * school. A web page behind a `SUPER_ADMIN_CLERK_IDS` allow-list is postponed until the
 * platform serves more than one school.
 *
 * The first admin is an existing Clerk account (invited by email in the Clerk dashboard,
 * decision D2). The school's own admin then completes the onboarding wizard.
 */
export const provisionSchoolSchema = z.object({
  schoolName: z.string().trim().min(2, 'School name must be at least 2 characters').max(200),
  adminClerkId: z
    .string()
    .trim()
    .regex(/^user_[A-Za-z0-9]+$/, 'Clerk user id must look like user_xxxxx'),
  adminEmail: z.string().trim().toLowerCase().email('A valid admin e-mail is required'),
  adminFirstName: z.string().trim().min(1, 'First name is required').max(100),
  adminLastName: z.string().trim().min(1, 'Last name is required').max(100),
});

export type ProvisionSchoolInput = z.input<typeof provisionSchoolSchema>;

export async function provisionSchool(
  db: PrismaClient,
  input: ProvisionSchoolInput
): Promise<{ schoolId: string; adminUserId: string }> {
  const data = provisionSchoolSchema.parse(input);

  return db.$transaction(async (tx) => {
    // Never re-home an existing user: both the Clerk id and the e-mail are unique identities.
    const existing = await tx.user.findFirst({
      where: { OR: [{ clerkId: data.adminClerkId }, { email: data.adminEmail }] },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        'A user with this Clerk id or e-mail already exists. Refusing to move an existing user into a new school.'
      );
    }

    const school = await tx.school.create({
      data: { name: data.schoolName, onboardingCompleted: false, onboardingStep: 0 },
      select: { id: true },
    });

    const admin = await tx.user.create({
      data: {
        clerkId: data.adminClerkId,
        schoolId: school.id,
        email: data.adminEmail,
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
        role: 'admin',
        isActive: true,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        schoolId: school.id,
        action: 'school.provisioned',
        tableName: 'schools',
        recordId: school.id,
        newData: { schoolName: data.schoolName, adminUserId: admin.id },
      },
    });

    return { schoolId: school.id, adminUserId: admin.id };
  });
}
