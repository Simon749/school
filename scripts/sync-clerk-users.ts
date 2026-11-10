import { readFileSync } from 'node:fs';
import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// Usage: pnpm tsx scripts/sync-clerk-users.ts [path/to/clerk-users.local.json]
// Default path: scripts/clerk-users.local.json (git-ignored). Copy clerk-users.example.json to start.
interface TestUser {
  email: string;
  clerkId: string;
  role: keyof typeof UserRole;
  firstName: string;
  lastName: string;
}

function loadUsers(): TestUser[] {
  const path = process.argv[2] ?? 'scripts/clerk-users.local.json';
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`❌ Cannot read ${path}. Copy scripts/clerk-users.example.json and fill it in.`);
    process.exit(1);
  }
  const parsed = JSON.parse(raw) as TestUser[];
  for (const u of parsed) {
    if (!u.email || !u.clerkId || !(u.role in UserRole)) {
      throw new Error(`Invalid entry in ${path}: ${JSON.stringify(u)}`);
    }
  }
  return parsed;
}

async function main() {
  const school = await prisma.school.findFirst();
  if (!school) throw new Error('Run prisma db seed first — no school found.');

  for (const u of loadUsers()) {
    const role = UserRole[u.role];
    await prisma.user.upsert({
      where: { email: u.email },
      update: { clerkId: u.clerkId, role, schoolId: school.id, isActive: true },
      create: { ...u, role, schoolId: school.id, isActive: true },
    });
    console.log(`✓ Synced ${u.email} → ${u.role}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
