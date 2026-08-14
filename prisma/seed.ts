// EduTrack Kenya — Seed script (Phase 1.1)
// Creates: 1 test school, 1 academic year, 3 terms, grades PP1→Grade 9,
// 1 stream per grade, default timetable periods, CBC learning areas.
//
// NOTE: The placeholder admin user has clerkId="seed_admin_replace_me".
// After you sign up via Clerk, replace this with your real Clerk user ID
// or delete the placeholder and create your admin via the app.

import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {

  // ── CLEAR EXISTING DATA (reverse dependency order) ──
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.studentLessonAttendance.deleteMany(),
    prisma.studentDailyAttendance.deleteMany(),
    prisma.teacherAttendance.deleteMany(),
    prisma.classroomQrToken.deleteMany(),
    prisma.timetableSlot.deleteMany(),
    prisma.timetablePeriod.deleteMany(),
    prisma.guardian.deleteMany(),
    prisma.student.deleteMany(),
    prisma.teacher.deleteMany(),
    prisma.user.deleteMany(),
    prisma.stream.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.learningArea.deleteMany(),
    prisma.term.deleteMany(),
    prisma.academicYear.deleteMany(),
    prisma.schoolCalendarDay.deleteMany(),
    prisma.school.deleteMany(),
  ]);
  console.log("🧹 Cleared existing seed data\n");
  console.log("🌱 Seeding EduTrack Kenya (Phase 1.1)...\n");

  // ── 1. TEST SCHOOL ─────────────────────────────────────────
  const school = await prisma.school.create({
    data: {
      name: "Test School — Nairobi",
      county: "Nairobi",
      subCounty: "Westlands",
      phone: "254712345678",
      email: "admin@testschool.edu",
      onboardingCompleted: true,
      onboardingStep: 6,
    },
  });
  console.log(`✓ School created: ${school.name} (${school.id})`);

  // ── 2. ACADEMIC YEAR & TERMS ───────────────────────────────
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId: school.id,
      name: "2025",
      isCurrent: true,
    },
  });
  console.log(`✓ Academic year: ${academicYear.name}`);

  const terms = await prisma.term.createMany({
    data: [
      {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termNumber: 1,
        name: "Term 1 2025",
        startDate: new Date("2025-01-06"),
        endDate: new Date("2025-04-04"),
        midTermStart: new Date("2025-02-17"),
        midTermEnd: new Date("2025-02-21"),
        isCurrent: true,
      },
      {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termNumber: 2,
        name: "Term 2 2025",
        startDate: new Date("2025-04-28"),
        endDate: new Date("2025-08-01"),
        midTermStart: new Date("2025-06-16"),
        midTermEnd: new Date("2025-06-20"),
        isCurrent: false,
      },
      {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termNumber: 3,
        name: "Term 3 2025",
        startDate: new Date("2025-09-01"),
        endDate: new Date("2025-11-07"),
        midTermStart: new Date("2025-10-06"),
        midTermEnd: new Date("2025-10-10"),
        isCurrent: false,
      },
    ],
  });
  console.log(`✓ Terms created: ${terms.count}`);

  // ── 3. GRADES & STREAMS ────────────────────────────────────
  const gradeData = [
    { name: "PP1", level: 0, cbcStage: "lower_primary" },
    { name: "PP2", level: 1, cbcStage: "lower_primary" },
    { name: "Grade 1", level: 2, cbcStage: "lower_primary" },
    { name: "Grade 2", level: 3, cbcStage: "lower_primary" },
    { name: "Grade 3", level: 4, cbcStage: "lower_primary" },
    { name: "Grade 4", level: 5, cbcStage: "upper_primary" },
    { name: "Grade 5", level: 6, cbcStage: "upper_primary" },
    { name: "Grade 6", level: 7, cbcStage: "upper_primary" },
    { name: "Grade 7", level: 8, cbcStage: "jss" },
    { name: "Grade 8", level: 9, cbcStage: "jss" },
    { name: "Grade 9", level: 10, cbcStage: "jss" },
  ];

  for (const g of gradeData) {
    const grade = await prisma.grade.create({
      data: {
        schoolId: school.id,
        ...g,
      },
    });
    await prisma.stream.create({
      data: {
        schoolId: school.id,
        gradeId: grade.id,
        name: "A",
        capacity: 40,
      },
    });
  }
  console.log(`✓ Grades & streams: ${gradeData.length} grades, 1 stream each`);

  // ── 4. TIMETABLE PERIODS ───────────────────────────────────
  const periodData = [
    { name: "Period 1", startTime: new Date("1970-01-01T08:00:00Z"), endTime: new Date("1970-01-01T08:45:00Z"), isBreak: false, orderIndex: 1 },
    { name: "Period 2", startTime: new Date("1970-01-01T08:45:00Z"), endTime: new Date("1970-01-01T09:30:00Z"), isBreak: false, orderIndex: 2 },
    { name: "Period 3", startTime: new Date("1970-01-01T09:30:00Z"), endTime: new Date("1970-01-01T10:15:00Z"), isBreak: false, orderIndex: 3 },
    { name: "Break",    startTime: new Date("1970-01-01T10:15:00Z"), endTime: new Date("1970-01-01T10:45:00Z"), isBreak: true,  orderIndex: 4 },
    { name: "Period 4", startTime: new Date("1970-01-01T10:45:00Z"), endTime: new Date("1970-01-01T11:30:00Z"), isBreak: false, orderIndex: 5 },
    { name: "Period 5", startTime: new Date("1970-01-01T11:30:00Z"), endTime: new Date("1970-01-01T12:15:00Z"), isBreak: false, orderIndex: 6 },
    { name: "Period 6", startTime: new Date("1970-01-01T12:15:00Z"), endTime: new Date("1970-01-01T13:00:00Z"), isBreak: false, orderIndex: 7 },
    { name: "Lunch",    startTime: new Date("1970-01-01T13:00:00Z"), endTime: new Date("1970-01-01T14:00:00Z"), isBreak: true,  orderIndex: 8 },
    { name: "Period 7", startTime: new Date("1970-01-01T14:00:00Z"), endTime: new Date("1970-01-01T14:45:00Z"), isBreak: false, orderIndex: 9 },
    { name: "Period 8", startTime: new Date("1970-01-01T14:45:00Z"), endTime: new Date("1970-01-01T15:30:00Z"), isBreak: false, orderIndex: 10 },
  ];

  for (const p of periodData) {
    await prisma.timetablePeriod.create({
      data: { schoolId: school.id, ...p },
    });
  }
  console.log(`✓ Timetable periods: ${periodData.length} (8 teaching + 2 breaks)`);

  // ── 5. CBC LEARNING AREAS ──────────────────────────────────
  const learningAreaSeed = [
    // Lower Primary
    { name: "Literacy", cbcStage: "lower_primary", isJssArea: false },
    { name: "Numeracy", cbcStage: "lower_primary", isJssArea: false },
    { name: "Environmental Activities", cbcStage: "lower_primary", isJssArea: false },
    { name: "Hygiene and Nutrition", cbcStage: "lower_primary", isJssArea: false },
    { name: "Religious Education", cbcStage: "lower_primary", isJssArea: false },
    { name: "Creative Arts", cbcStage: "lower_primary", isJssArea: false },
    { name: "Movement and Creative Activities", cbcStage: "lower_primary", isJssArea: false },
    // Upper Primary
    { name: "English", cbcStage: "upper_primary", isJssArea: false },
    { name: "Kiswahili", cbcStage: "upper_primary", isJssArea: false },
    { name: "Mathematics", cbcStage: "upper_primary", isJssArea: false },
    { name: "Science and Technology", cbcStage: "upper_primary", isJssArea: false },
    { name: "Social Studies", cbcStage: "upper_primary", isJssArea: false },
    { name: "Agriculture", cbcStage: "upper_primary", isJssArea: false },
    { name: "Home Science", cbcStage: "upper_primary", isJssArea: false },
    { name: "Physical and Health Education", cbcStage: "upper_primary", isJssArea: false },
    // JSS
    { name: "English", cbcStage: "jss", isJssArea: true },
    { name: "Kiswahili", cbcStage: "jss", isJssArea: true },
    { name: "Mathematics", cbcStage: "jss", isJssArea: true },
    { name: "Integrated Science", cbcStage: "jss", isJssArea: true },
    { name: "Social Studies", cbcStage: "jss", isJssArea: true },
    { name: "Pre-Technical Studies", cbcStage: "jss", isJssArea: true },
    { name: "Agriculture", cbcStage: "jss", isJssArea: true },
    { name: "Business Studies", cbcStage: "jss", isJssArea: true },
    { name: "Home Science", cbcStage: "jss", isJssArea: true },
    { name: "Creative Arts and Sports", cbcStage: "jss", isJssArea: true },
    { name: "Life Skills", cbcStage: "jss", isJssArea: true },
  ];

  for (const la of learningAreaSeed) {
    await prisma.learningArea.create({
      data: { schoolId: school.id, ...la },
    });
  }
  console.log(`✓ Learning areas: ${learningAreaSeed.length}`);

  // ── 6. PLACEHOLDER ADMIN USER ──────────────────────────────
  // ⚠️  Replace clerkId with your real Clerk user ID before using auth.
  await prisma.user.create({
    data: {
      clerkId: "seed_admin_replace_me",
      schoolId: school.id,
      email: "admin@edutrack.test",
      role: UserRole.admin,
      firstName: "System",
      lastName: "Admin",
    },
  });
  console.log(`✓ Placeholder admin user created (clerkId: seed_admin_replace_me)`);
  console.log(`  ⚠️  IMPORTANT: Replace this clerkId with your actual Clerk user ID!`);

  console.log("\n Phase 1.1 seed complete.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });