/**
 * Create a school and its first admin (platform super admin only — decisions D15/D16).
 *
 * 1. In the Clerk dashboard, INVITE the school's admin by e-mail and let them accept, so a Clerk
 *    user exists. Copy their user id (user_xxxxx).
 * 2. Run (the database URL must be the one you mean to change):
 *
 *    SCHOOL_NAME="Kilimani Academy" ADMIN_CLERK_ID=user_xxx ADMIN_EMAIL=director@school.ke \
 *    ADMIN_FIRST_NAME=Wanjiru ADMIN_LAST_NAME=Kamau pnpm provision-school
 *
 * It refuses if that Clerk user or e-mail already exists (it never moves an existing user).
 */
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { provisionSchool } from '../src/lib/provisioning/school';

const prisma = new PrismaClient();

async function main() {
  const result = await provisionSchool(prisma, {
    schoolName: process.env.SCHOOL_NAME ?? '',
    adminClerkId: process.env.ADMIN_CLERK_ID ?? '',
    adminEmail: process.env.ADMIN_EMAIL ?? '',
    adminFirstName: process.env.ADMIN_FIRST_NAME ?? '',
    adminLastName: process.env.ADMIN_LAST_NAME ?? '',
  });
  console.log('✅ School provisioned.');
  console.log(`   School id : ${result.schoolId}`);
  console.log(`   Admin user: ${result.adminUserId}`);
  console.log('Next: the admin signs in and completes the onboarding wizard.');
}

main()
  .catch((e) => {
    if (e instanceof ZodError) {
      console.error('❌ Missing or invalid input:');
      for (const issue of e.issues) console.error(`   - ${issue.message}`);
    } else {
      console.error('❌', e instanceof Error ? e.message : e);
    }
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
