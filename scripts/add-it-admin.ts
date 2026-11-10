import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Usage: IT_ADMIN_CLERK_ID=user_xxx IT_ADMIN_EMAIL=you+it@example.com pnpm tsx scripts/add-it-admin.ts
function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`❌ Set ${name} (see header of this script).`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const clerkId = need('IT_ADMIN_CLERK_ID');
  const email = need('IT_ADMIN_EMAIL');

  // 1. Get the schoolId from an existing user (e.g., the admin)
  const existingUser = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { schoolId: true },
  });

  if (!existingUser) {
    console.error('❌ No school found. Please ensure your test school and admin user exist first.');
    return;
  }

  // 2. Create or update the IT Admin user
  const itAdmin = await prisma.user.upsert({
    where: { clerkId },
    update: {
      role: 'it_admin',
      email: email,
      firstName: 'Test',
      lastName: 'IT Admin',
      isActive: true,
    },
    create: {
      clerkId,
      schoolId: existingUser.schoolId,
      email: email,
      role: 'it_admin',
      firstName: 'Test',
      lastName: 'IT Admin',
      isActive: true,
    },
  });

  console.log('✅ Success! IT Admin user is ready:');
  console.log(`   ID: ${itAdmin.id}`);
  console.log(`   Clerk ID: ${itAdmin.clerkId}`);
  console.log(`   Role: ${itAdmin.role}`);
  console.log(`   School ID: ${itAdmin.schoolId}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
