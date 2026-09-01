import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const TEST_USERS = [
  { email: "simonmwangi749+admin@gmail.com",   clerkId: "user_3IAsHPaDeNE4bFTbbg5PKmyD6aH", role: UserRole.admin,   firstName: "Admin",   lastName: "User" },
  { email: "simonmwangi749+deputy@gmail.com",  clerkId: "user_3IAsNAQbBn6wDoY5v2QVo022TVV", role: UserRole.deputy,  firstName: "Deputy",  lastName: "User" },
  { email: "simonmwangi749+teacher@gmail.com", clerkId: "user_3IAsctpuzldhH66boPLW9tZvQfj", role: UserRole.teacher, firstName: "Teacher", lastName: "User" },
  { email: "simonmwangi749+parent@gmail.com",  clerkId: "user_3IAsgGGmLDxt4Sjg238VN0Dl68m", role: UserRole.parent,  firstName: "Parent",  lastName: "User" },
  { email: "simonmwangi749+bursar@gmail.com",  clerkId: "user_3IAsjGBhMbzWHeRzB3jSdrgaIdS", role: UserRole.bursar,  firstName: "Bursar",  lastName: "User" },
];

async function main() {
  const school = await prisma.school.findFirst();
  if (!school) throw new Error("Run prisma db seed first — no school found.");

  for (const u of TEST_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { clerkId: u.clerkId, role: u.role, schoolId: school.id, isActive: true },
      create:  { ...u, schoolId: school.id, isActive: true },
    });
    console.log(`✓ Synced ${u.email} → ${u.role}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());