import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const clerkId = 'user_3IleJUU1vDvt8zFooZtQNxfD2iW';
  const email = 'simonmwangi749+it@gmail.com';

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