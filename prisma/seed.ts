// EduTrack Kenya — Seed script
// Scope: Phase 0.2 tables only (School, User, AcademicYear).
// Phase 1 seeding (CBC learning areas, grades, timetable periods, test school
// with admin user) is intentionally NOT added yet — see PROGRESS_TRACKER.md 1.1.
// Do not pre-build later-phase seed data; add it when that phase starts
// (AGENTS.md §6 — No Product Scope Creep).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed script scaffolded but intentionally empty for Phase 0.');
  console.log('Phase 1.1 will add: test school, admin user, CBC learning areas, grades.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
