// EduTrack Kenya — Stress-Test Seed Script
// =========================================
// Generates a realistically-sized SYNTHETIC dataset for end-to-end and load
// testing ahead of pilot. Nothing in here is real student, parent, teacher
// or payment data — every name is drawn from generic Kenyan name pools,
// every NEMIS number is prefixed "TS2025" so it can never be confused with
// a real government-issued number, and every M-Pesa code is random and
// will not validate against Safaricom.
//
// WHAT THIS SEEDS:
//   1 school, 1 academic year, 3 terms (current term dynamically bracketed
//   around "today" so calendar-awareness checks pass when you test live)
//   11 grades x 2 streams (22 streams), ~528 students, ~400 guardian
//   families (with siblings + some two-guardian households), ~30 teachers,
//   CBC learning areas, 10-period timetable structure, a full timetable
//   (880 slots) with no teacher/stream double-booking, a fee structure
//   with mandatory + optional items, per-student fees with sibling/bursary
//   discounts, a realistic spread of full/partial/zero payments (defaulters
//   included), and 10 school-days worth of teacher + student attendance
//   history (~42k lesson-attendance rows) for pagination/load testing.
//
// WHAT THIS DOES NOT SEED (honestly flagged, not silently skipped):
//   Assessments/CBC results, term reports, portfolio artefacts, messages,
//   activities, exam timetable, teacher duties, lesson-register locking,
//   payment disputes, audit logs, QR tokens (these are runtime-generated,
//   time-bound, and don't make sense as static seed data).
//   These are Phase 3/4 tracker items — add them when you actually build
//   those modules, per AGENTS.md §6 (no scope creep).
//
// BEFORE RUNNING:
//   1. Find-and-replace YOUR_EMAIL in this file with your real Gmail (or
//      provider) local part, e.g. "simon.otieno" — the script uses
//      plus-addressing so all 5 test accounts land in YOUR one inbox:
//        YOUR_EMAIL+admin@gmail.com
//        YOUR_EMAIL+deputy@gmail.com
//        YOUR_EMAIL+bursar@gmail.com
//        YOUR_EMAIL+teacher@gmail.com
//        YOUR_EMAIL+parent@gmail.com
//   2. Sign up through Clerk with each of those 5 addresses (5 separate
//      accounts — Clerk treats +aliases as distinct).
//   3. Run this seed, THEN go into the users table and replace each
//      "seed_<role>_replace_me" clerkId with the real Clerk user ID Clerk
//      assigned on signup (Clerk dashboard -> Users -> copy the ID).
//      Until you do that, those 5 accounts exist in Postgres but won't be
//      reachable by logging in.
//
// RUN:  npx prisma db seed   (or: npx tsx prisma/seed.ts)
// TIME: expect 1-3 minutes depending on your DB — this inserts ~55k rows.

import { PrismaClient, UserRole } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

// ── REPLACE ME ──────────────────────────────────────────────────────────
const EMAIL_LOCAL_PART = "simonmwangi749"; // e.g. "simon.otieno" — no @gmail.com
const EMAIL_DOMAIN = "gmail.com"; // change if you're not on Gmail
// ─────────────────────────────────────────────────────────────────────────

function heroEmail(role: string) {
  return `${EMAIL_LOCAL_PART}+${role}@${EMAIL_DOMAIN}`;
}

// ── Deterministic RNG so re-running gives the same dataset ───────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260820);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const chance = (p: number) => rand() < p;

async function createManyChunked<T>(
  label: string,
  fn: (data: T[]) => Promise<any>,
  rows: T[],
  chunkSize = 2000
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await fn(rows.slice(i, i + chunkSize));
  }
  console.log(`  ✓ ${label}: ${rows.length} rows`);
}

// ── Name pools (generic Kenyan first/last names — not real individuals) ──
const MALE_FIRST = [
  "Brian", "Kevin", "Dennis", "Collins", "Victor", "Felix", "Peter", "John",
  "Samuel", "Daniel", "Joseph", "James", "Paul", "Michael", "David", "Erick",
  "Emmanuel", "Anthony", "Stephen", "Patrick", "Josphat", "Elias", "Vincent",
  "Wycliffe", "Baraka", "Mutiso", "Kiprono", "Kiptoo", "Wafula", "Otieno",
  "Kamau", "Njoroge", "Mwangi", "Kariuki", "Omondi", "Odhiambo", "Barasa",
];
const FEMALE_FIRST = [
  "Mercy", "Grace", "Faith", "Joy", "Esther", "Ann", "Mary", "Winnie",
  "Beatrice", "Purity", "Caroline", "Diana", "Sharon", "Brenda", "Irene",
  "Lilian", "Nancy", "Agnes", "Susan", "Eunice", "Rose", "Catherine",
  "Wanjiru", "Achieng", "Chebet", "Nafula", "Akinyi", "Wambui", "Njeri",
  "Auma", "Cherop", "Moraa", "Nyambura", "Adhiambo", "Wairimu", "Kemunto",
];
const LAST_NAMES = [
  "Otieno", "Odhiambo", "Onyango", "Owino", "Ochieng", "Kamau", "Njoroge",
  "Mwangi", "Kariuki", "Maina", "Wanjiru", "Njeri", "Wambui", "Kiptoo",
  "Kiprono", "Chebet", "Cherop", "Rono", "Wafula", "Barasa", "Wekesa",
  "Nafula", "Nekesa", "Mutua", "Musyoka", "Kioko", "Ndunda", "Muthomi",
  "Gitau", "Muturi", "Kimani", "Wamalwa", "Simiyu", "Achieng", "Akinyi",
];

function fullName(gender: "M" | "F") {
  const first = gender === "M" ? pick(MALE_FIRST) : pick(FEMALE_FIRST);
  const last = pick(LAST_NAMES);
  return { first, last };
}

function fakePhone() {
  // Valid Safaricom-format 2547XXXXXXXX — synthetic, not an allocated number.
  return `2547${randInt(10000000, 99999999)}`;
}

function mpesaCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[randInt(0, chars.length - 1)];
  return out;
}

async function main() {
  console.log("🧹 Clearing existing data...");
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.studentLessonAttendance.deleteMany(),
    prisma.studentDailyAttendance.deleteMany(),
    prisma.teacherAttendance.deleteMany(),
    prisma.classroomQrToken.deleteMany(),
    prisma.feePayment.deleteMany(),
    prisma.paymentDispute.deleteMany(),
    prisma.studentFee.deleteMany(),
    prisma.feeItem.deleteMany(),
    prisma.feeStructure.deleteMany(),
    prisma.timetableSlot.deleteMany(),
    prisma.timetablePeriod.deleteMany(),
    prisma.guardian.deleteMany(),
    prisma.student.deleteMany(),
    prisma.teacher.deleteMany(),
    prisma.user.deleteMany(),
    prisma.stream.deleteMany(),
    prisma.grade.deleteMany(),
    prisma.learningArea.deleteMany(),
    prisma.schoolCalendarDay.deleteMany(),
    prisma.term.deleteMany(),
    prisma.academicYear.deleteMany(),
    prisma.school.deleteMany(),
  ]);
  console.log("✓ Cleared\n🌱 Seeding EduTrack Kenya — stress-test dataset...\n");

  // ── 1. SCHOOL ────────────────────────────────────────────────────────
  const school = await prisma.school.create({
    data: {
      name: "Test School — Nairobi",
      county: "Nairobi",
      subCounty: "Westlands",
      phone: "254712345678",
      email: "admin@testschool.edu",
      latitude: -1.2634,
      longitude: 36.8047,
      geofenceRadius: 150,
      onboardingCompleted: true,
      onboardingStep: 6,
      smsBalance: 5000,
    },
  });
  console.log(`✓ School: ${school.name} (${school.id})`);

  // ── 2. ACADEMIC YEAR & TERMS (current term bracketed around "today") ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const academicYear = await prisma.academicYear.create({
    data: { schoolId: school.id, name: String(today.getFullYear()), isCurrent: true },
  });

  const addDays = (d: Date, n: number) => {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + n);
    return nd;
  };
  const currentTerm = await prisma.term.create({
    data: {
      schoolId: school.id,
      academicYearId: academicYear.id,
      termNumber: 2,
      name: `Term 2 ${academicYear.name}`,
      startDate: addDays(today, -60),
      endDate: addDays(today, 40),
      midTermStart: addDays(today, -10),
      midTermEnd: addDays(today, -6),
      isCurrent: true,
    },
  });
  await prisma.term.createMany({
    data: [
      {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termNumber: 1,
        name: `Term 1 ${academicYear.name}`,
        startDate: addDays(today, -150),
        endDate: addDays(today, -65),
        isCurrent: false,
      },
      {
        schoolId: school.id,
        academicYearId: academicYear.id,
        termNumber: 3,
        name: `Term 3 ${academicYear.name}`,
        startDate: addDays(today, 45),
        endDate: addDays(today, 130),
        isCurrent: false,
      },
    ],
  });
  console.log(`✓ Academic year ${academicYear.name} + 3 terms (current term brackets today)`);

  // ── 3. CALENDAR DAYS — last 10 weekdays marked as normal school days ──
  const schoolDays: Date[] = [];
  {
    let cursor = new Date(today);
    while (schoolDays.length < 10) {
      const dow = cursor.getDay(); // 0=Sun..6=Sat
      if (dow !== 0 && dow !== 6) schoolDays.push(new Date(cursor));
      cursor = addDays(cursor, -1);
    }
    schoolDays.reverse();
  }
  await prisma.schoolCalendarDay.createMany({
    data: schoolDays.map((d) => ({
      schoolId: school.id,
      termId: currentTerm.id,
      date: d,
      dayType: "school_day",
      timetableType: "normal",
    })),
  });
  console.log(`✓ Calendar: ${schoolDays.length} school days marked (most recent weekdays)`);

  // ── 4. GRADES & STREAMS ────────────────────────────────────────────────
  const gradeDefs = [
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

  type StreamRow = { id: string; schoolId: string; gradeId: string; name: string; capacity: number };
  const streams: (StreamRow & { level: number; cbcStage: string; gradeName: string })[] = [];

  for (const g of gradeDefs) {
    const grade = await prisma.grade.create({ data: { schoolId: school.id, ...g } });
    for (const streamName of ["A", "B"]) {
      const s = await prisma.stream.create({
        data: { schoolId: school.id, gradeId: grade.id, name: streamName, capacity: 40 },
      });
      streams.push({ ...s, level: g.level, cbcStage: g.cbcStage, gradeName: g.name });
    }
  }
  console.log(`✓ Grades & streams: ${gradeDefs.length} grades x 2 streams = ${streams.length} streams`);

  // ── 5. TIMETABLE PERIODS ────────────────────────────────────────────────
  const t = (hh: number, mm: number) => new Date(Date.UTC(1970, 0, 1, hh, mm));
  const periodDefs = [
    { name: "Period 1", startTime: t(8, 0), endTime: t(8, 45), isBreak: false, orderIndex: 1 },
    { name: "Period 2", startTime: t(8, 45), endTime: t(9, 30), isBreak: false, orderIndex: 2 },
    { name: "Period 3", startTime: t(9, 30), endTime: t(10, 15), isBreak: false, orderIndex: 3 },
    { name: "Break", startTime: t(10, 15), endTime: t(10, 45), isBreak: true, orderIndex: 4 },
    { name: "Period 4", startTime: t(10, 45), endTime: t(11, 30), isBreak: false, orderIndex: 5 },
    { name: "Period 5", startTime: t(11, 30), endTime: t(12, 15), isBreak: false, orderIndex: 6 },
    { name: "Period 6", startTime: t(12, 15), endTime: t(13, 0), isBreak: false, orderIndex: 7 },
    { name: "Lunch", startTime: t(13, 0), endTime: t(14, 0), isBreak: true, orderIndex: 8 },
    { name: "Period 7", startTime: t(14, 0), endTime: t(14, 45), isBreak: false, orderIndex: 9 },
    { name: "Period 8", startTime: t(14, 45), endTime: t(15, 30), isBreak: false, orderIndex: 10 },
  ];
  const periods = [];
  for (const p of periodDefs) {
    periods.push(await prisma.timetablePeriod.create({ data: { schoolId: school.id, ...p } }));
  }
  const teachingPeriods = periods.filter((p) => !p.isBreak);
  console.log(`✓ Timetable periods: ${periods.length} (8 teaching + 2 breaks)`);

  // ── 6. CBC LEARNING AREAS ───────────────────────────────────────────────
  const learningAreaDefs = [
    { name: "Literacy", cbcStage: "lower_primary", isJssArea: false },
    { name: "Numeracy", cbcStage: "lower_primary", isJssArea: false },
    { name: "Environmental Activities", cbcStage: "lower_primary", isJssArea: false },
    { name: "Religious Education", cbcStage: "lower_primary", isJssArea: false },
    { name: "Creative Arts", cbcStage: "lower_primary", isJssArea: false },
    { name: "English", cbcStage: "upper_primary", isJssArea: false },
    { name: "Kiswahili", cbcStage: "upper_primary", isJssArea: false },
    { name: "Mathematics", cbcStage: "upper_primary", isJssArea: false },
    { name: "Science and Technology", cbcStage: "upper_primary", isJssArea: false },
    { name: "Social Studies", cbcStage: "upper_primary", isJssArea: false },
    { name: "Agriculture", cbcStage: "upper_primary", isJssArea: false },
    { name: "English", cbcStage: "jss", isJssArea: true },
    { name: "Kiswahili", cbcStage: "jss", isJssArea: true },
    { name: "Mathematics", cbcStage: "jss", isJssArea: true },
    { name: "Integrated Science", cbcStage: "jss", isJssArea: true },
    { name: "Social Studies", cbcStage: "jss", isJssArea: true },
    { name: "Pre-Technical Studies", cbcStage: "jss", isJssArea: true },
    { name: "Business Studies", cbcStage: "jss", isJssArea: true },
  ];
  const learningAreas: { id: string; name: string; createdAt: Date; schoolId: string; cbcStage: string | null; code: string | null; isJssArea: boolean; color: string | null; }[] = [];
  for (const la of learningAreaDefs) {
    learningAreas.push(await prisma.learningArea.create({ data: { schoolId: school.id, ...la } }));
  }
  const areasByStage = (stage: string) => learningAreas.filter((a) => a.cbcStage === stage);
  console.log(`✓ Learning areas: ${learningAreas.length}`);

  // ── 7. HERO TEST ACCOUNTS (admin, deputy, bursar, teacher, parent) ─────
  const adminUser = await prisma.user.create({
    data: {
      clerkId: "seed_admin_replace_me",
      schoolId: school.id,
      email: heroEmail("admin"),
      phone: fakePhone(),
      role: UserRole.admin,
      firstName: "Test",
      lastName: "Admin",
    },
  });
  const deputyUser = await prisma.user.create({
    data: {
      clerkId: "seed_deputy_replace_me",
      schoolId: school.id,
      email: heroEmail("deputy"),
      phone: fakePhone(),
      role: UserRole.deputy,
      firstName: "Test",
      lastName: "Deputy",
    },
  });
  const bursarUser = await prisma.user.create({
    data: {
      clerkId: "seed_bursar_replace_me",
      schoolId: school.id,
      email: heroEmail("bursar"),
      phone: fakePhone(),
      role: UserRole.bursar,
      firstName: "Test",
      lastName: "Bursar",
    },
  });
  console.log(`✓ Hero accounts (admin/deputy/bursar) created — clerkId placeholders need swapping after Clerk signup`);

  // ── 8. TEACHERS (30 total; hero teacher is #0) ──────────────────────────
  type TeacherRow = { userId: string; teacherId: string; specialisation: string };
  const teachers: TeacherRow[] = [];

  // Hero teacher — class teacher of Grade 5 Stream A
  {
    const gender = "F" as const;
    const heroTeacherUser = await prisma.user.create({
      data: {
        clerkId: "seed_teacher_replace_me",
        schoolId: school.id,
        email: heroEmail("teacher"),
        phone: fakePhone(),
        role: UserRole.teacher,
        firstName: "Test",
        lastName: "Teacher",
      },
    });
    const heroTeacher = await prisma.teacher.create({
      data: {
        userId: heroTeacherUser.id,
        schoolId: school.id,
        tscNumber: "TSC-000001",
        employmentType: "tsc",
        specialisation: "Mathematics",
        isClassTeacher: true,
      },
    });
    teachers.push({ userId: heroTeacherUser.id, teacherId: heroTeacher.id, specialisation: "Mathematics" });

    const grade5A = streams.find((s) => s.gradeName === "Grade 5" && s.name === "A")!;
    await prisma.teacher.update({
      where: { id: heroTeacher.id },
      data: { classTeacherStreamId: grade5A.id },
    });
  }

  const subjectPool = [
    "Mathematics", "English", "Kiswahili", "Science and Technology", "Integrated Science",
    "Social Studies", "Agriculture", "Business Studies", "Pre-Technical Studies",
    "Literacy", "Numeracy", "Creative Arts", "Environmental Activities", "Religious Education",
  ];
  for (let i = 1; i < 30; i++) {
    const gender = chance(0.5) ? "M" : "F";
    const { first, last } = fullName(gender);
    const specialisation = pick(subjectPool);
    const user = await prisma.user.create({
      data: {
        schoolId: school.id,
        email: null,
        phone: fakePhone(),
        role: UserRole.teacher,
        firstName: first,
        lastName: last,
      },
    });
    const teacher = await prisma.teacher.create({
      data: {
        userId: user.id,
        schoolId: school.id,
        tscNumber: `TSC-${String(100000 + i)}`,
        employmentType: chance(0.7) ? "tsc" : "bom",
        specialisation,
        isClassTeacher: false,
      },
    });
    teachers.push({ userId: user.id, teacherId: teacher.id, specialisation });
  }

  // Assign remaining 21 streams a class teacher (round-robin over the pool,
  // skipping the hero teacher who's already assigned to Grade 5A)
  {
    let ti = 1;
    for (const s of streams) {
      if (s.gradeName === "Grade 5" && s.name === "A") continue; // hero already assigned
      const teacherRow = teachers[ti % teachers.length];
      await prisma.teacher.update({
        where: { id: teacherRow.teacherId },
        data: { isClassTeacher: true, classTeacherStreamId: s.id },
      });
      ti++;
    }
  }
  console.log(`✓ Teachers: ${teachers.length} (1 hero + 29 generated), all 22 streams have a class teacher`);

  // ── 9. TIMETABLE — round-robin, collision-free ─────────────────────────
  type SlotRow = {
    id: string; schoolId: string; termId: string; streamId: string; learningAreaId: string;
    teacherId: string; periodId: string; dayOfWeek: number; isPublished: boolean;
  };
  const slotRows: SlotRow[] = [];
  const teacherBusy = new Set<string>(); // `${teacherId}-${day}-${periodId}`

  for (const stream of streams) {
    const stageAreas = areasByStage(stream.cbcStage);
    let subjectCursor = 0;
    for (let day = 1; day <= 5; day++) {
      for (const period of teachingPeriods) {
        const area = stageAreas[subjectCursor % stageAreas.length];
        subjectCursor++;

        // find a teacher whose specialisation roughly matches, else any free teacher
        let candidate = teachers.find(
          (tc) => tc.specialisation === area.name && !teacherBusy.has(`${tc.teacherId}-${day}-${period.id}`)
        );
        if (!candidate) {
          candidate = teachers.find((tc) => !teacherBusy.has(`${tc.teacherId}-${day}-${period.id}`));
        }
        if (!candidate) continue; // extremely unlikely with 30 teachers / 22 streams

        teacherBusy.add(`${candidate.teacherId}-${day}-${period.id}`);
        slotRows.push({
          id: randomUUID(),
          schoolId: school.id,
          termId: currentTerm.id,
          streamId: stream.id,
          learningAreaId: area.id,
          teacherId: candidate.teacherId,
          periodId: period.id,
          dayOfWeek: day,
          isPublished: true,
        });
      }
    }
  }
  await createManyChunked("Timetable slots", (d) => prisma.timetableSlot.createMany({ data: d }), slotRows);

  // ── 10. STUDENTS + GUARDIANS ────────────────────────────────────────────
  const STUDENTS_PER_STREAM = 24; // 22 streams x 24 = 528 students
  type StudentRow = {
    id: string; schoolId: string; nemisNumber: string; admissionNumber: string;
    firstName: string; lastName: string; dateOfBirth: Date; gender: string;
    streamId: string; status: string;
  };
  const studentRows: StudentRow[] = [];
  let nemisCounter = 1;

  for (const stream of streams) {
    const age = 4 + stream.level; // PP1 (level 0) ~ age 4 ... Grade 9 (level 10) ~ age 14
    for (let i = 0; i < STUDENTS_PER_STREAM; i++) {
      const gender = chance(0.5) ? "M" : "F";
      const { first, last } = fullName(gender);
      const dob = new Date(today.getFullYear() - age, randInt(0, 11), randInt(1, 28));
      studentRows.push({
        id: randomUUID(),
        schoolId: school.id,
        nemisNumber: `TS2025${String(nemisCounter).padStart(6, "0")}`,
        admissionNumber: `ADM${String(nemisCounter).padStart(5, "0")}`,
        firstName: first,
        lastName: last,
        dateOfBirth: dob,
        gender: gender === "M" ? "male" : "female",
        streamId: stream.id,
        status: "active",
      });
      nemisCounter++;
    }
  }
  await createManyChunked("Students", (d) => prisma.student.createMany({ data: d }), studentRows);
  console.log(`  (${studentRows.length} students across ${streams.length} streams)`);

  // Family clustering: group students into families of 1-3 siblings
  const shuffled = [...studentRows].sort(() => rand() - 0.5);
  const families: StudentRow[][] = [];
  {
    let idx = 0;
    while (idx < shuffled.length) {
      const size = chance(0.68) ? 1 : chance(0.75) ? 2 : 3;
      families.push(shuffled.slice(idx, idx + size));
      idx += size;
    }
  }

  type GuardianUserRow = {
    id: string; schoolId: string; email: string | null; phone: string; role: UserRole;
    firstName: string; lastName: string;
  };
  type GuardianLinkRow = {
    id: string; userId: string; studentId: string; relationship: string;
    isPrimary: boolean; canPickup: boolean; verified: boolean; isActive: boolean;
  };
  const guardianUsers: GuardianUserRow[] = [];
  const guardianLinks: GuardianLinkRow[] = [];

  // Reserve one family for the hero parent (2 children, different grades)
  const heroFamily = families.shift()!;
  while (heroFamily.length < 2) {
    heroFamily.push(families.pop()![0]); // borrow a single-child family's kid if needed
  }

  const heroParentUser = await prisma.user.create({
    data: {
      clerkId: "seed_parent_replace_me",
      schoolId: school.id,
      email: heroEmail("parent"),
      phone: fakePhone(),
      role: UserRole.parent,
      firstName: "Test",
      lastName: "Parent",
    },
  });
  for (const child of heroFamily.slice(0, 2)) {
    guardianLinks.push({
      id: randomUUID(),
      userId: heroParentUser.id,
      studentId: child.id,
      relationship: "mother",
      isPrimary: true,
      canPickup: true,
      verified: true,
      isActive: true,
    });
  }
  console.log(`✓ Hero parent linked to ${Math.min(2, heroFamily.length)} children (for child-switcher testing)`);

  for (const family of families) {
    const gender = chance(0.5) ? "M" : "F";
    const { first, last } = fullName(gender);
    const primaryId = randomUUID();
    guardianUsers.push({
      id: primaryId,
      schoolId: school.id,
      email: null,
      phone: fakePhone(),
      role: UserRole.parent,
      firstName: first,
      lastName: last,
    });
    for (const child of family) {
      guardianLinks.push({
        id: randomUUID(),
        userId: primaryId,
        studentId: child.id,
        relationship: gender === "M" ? "father" : "mother",
        isPrimary: true,
        canPickup: true,
        verified: true,
        isActive: true,
      });
    }
    // ~25% of families also get a second guardian (co-parent) — tests
    // multi-guardian access per AGENTS.md §11
    if (chance(0.25)) {
      const g2 = chance(0.5) ? "M" : "F";
      const n2 = fullName(g2);
      const secondaryId = randomUUID();
      guardianUsers.push({
        id: secondaryId,
        schoolId: school.id,
        email: null,
        phone: fakePhone(),
        role: UserRole.parent,
        firstName: n2.first,
        lastName: n2.last,
      });
      for (const child of family) {
        guardianLinks.push({
          id: randomUUID(),
          userId: secondaryId,
          studentId: child.id,
          relationship: g2 === "M" ? "father" : "mother",
          isPrimary: false,
          canPickup: true,
          verified: true,
          isActive: true,
        });
      }
    }
  }
  await createManyChunked("Guardian users", (d) => prisma.user.createMany({ data: d }), guardianUsers);
  await createManyChunked("Guardian links", (d) => prisma.guardian.createMany({ data: d }), guardianLinks);
  console.log(`  (${families.length + 1} families, ${guardianUsers.length + 1} guardian accounts total)`);

  // ── 11. FEE STRUCTURE — current term ────────────────────────────────────
  const feeStructure = await prisma.feeStructure.create({
    data: { schoolId: school.id, termId: currentTerm.id, name: `${currentTerm.name} Fees`, appliesTo: "all" },
  });
  const tuitionItem = await prisma.feeItem.create({
    data: { feeStructureId: feeStructure.id, name: "Tuition Fee", amount: 28000, isMandatory: true, priorityOrder: 1, orderIndex: 1 },
  });
  const lunchItem = await prisma.feeItem.create({
    data: { feeStructureId: feeStructure.id, name: "Lunch Fee", amount: 9000, isMandatory: true, priorityOrder: 2, orderIndex: 2 },
  });
  const activityItem = await prisma.feeItem.create({
    data: { feeStructureId: feeStructure.id, name: "Activity Fee", amount: 3500, isMandatory: false, isOptionalActivity: true, priorityOrder: 3, orderIndex: 3 },
  });
  const transportItem = await prisma.feeItem.create({
    data: { feeStructureId: feeStructure.id, name: "Transport Fee", amount: 6000, isMandatory: false, priorityOrder: 4, orderIndex: 4 },
  });
  console.log(`✓ Fee structure: ${feeStructure.name} (Tuition, Lunch, Activity*, Transport*)`);

  // Track which students are in a multi-child family (for sibling discount)
  const siblingStudentIds = new Set<string>();
  for (const family of [heroFamily, ...families]) {
    if (family.length > 1) family.forEach((s) => siblingStudentIds.add(s.id));
  }

  type StudentFeeRow = {
    id: string; schoolId: string; studentId: string; termId: string; feeItemId: string;
    amountDue: number; discount: number; discountReason: string | null; discountType: string | null;
  };
  const studentFeeRows: StudentFeeRow[] = [];

  for (const student of studentRows) {
    const isSibling = siblingStudentIds.has(student.id);
    const isBursary = chance(0.05);

    let tuitionDiscount = 0;
    let discountReason: string | null = null;
    let discountType: string | null = null;
    if (isBursary) {
      tuitionDiscount = 28000 * (chance(0.5) ? 1 : 0.5); // full or half bursary
      discountReason = "Bursary award";
      discountType = "bursary";
    } else if (isSibling) {
      tuitionDiscount = 28000 * 0.1;
      discountReason = "Sibling discount";
      discountType = "sibling";
    }

    studentFeeRows.push({
      id: randomUUID(), schoolId: school.id, studentId: student.id, termId: currentTerm.id,
      feeItemId: tuitionItem.id, amountDue: 28000, discount: tuitionDiscount, discountReason, discountType,
    });
    studentFeeRows.push({
      id: randomUUID(), schoolId: school.id, studentId: student.id, termId: currentTerm.id,
      feeItemId: lunchItem.id, amountDue: 9000, discount: 0, discountReason: null, discountType: null,
    });
    if (chance(0.4)) {
      studentFeeRows.push({
        id: randomUUID(), schoolId: school.id, studentId: student.id, termId: currentTerm.id,
        feeItemId: activityItem.id, amountDue: 3500, discount: 0, discountReason: null, discountType: null,
      });
    }
    if (chance(0.3)) {
      studentFeeRows.push({
        id: randomUUID(), schoolId: school.id, studentId: student.id, termId: currentTerm.id,
        feeItemId: transportItem.id, amountDue: 6000, discount: 0, discountReason: null, discountType: null,
      });
    }
  }
  await createManyChunked("Student fees", (d) => prisma.studentFee.createMany({ data: d }), studentFeeRows);

  // ── 12. FEE PAYMENTS — realistic full/partial/defaulter spread ─────────
  type PaymentRow = {
    id: string; schoolId: string; studentId: string; termId: string; receiptNumber: string;
    amount: number; paymentMethod: string; mpesaCode: string | null; mpesaPhone: string | null;
    mpesaName: string | null; paidAt: Date; recordedBy: string | null; notes: string | null;
  };
  const paymentRows: PaymentRow[] = [];
  let receiptCounter = 1000;

  const totalDueByStudent = new Map<string, number>();
  for (const row of studentFeeRows) {
    const due = Number(row.amountDue) - Number(row.discount);
    totalDueByStudent.set(row.studentId, (totalDueByStudent.get(row.studentId) ?? 0) + due);
  }

  for (const student of studentRows) {
    const totalDue = totalDueByStudent.get(student.id) ?? 0;
    const outcome = chance(0.55) ? "full" : chance(0.55) ? "partial" : "none"; // ~55/25/20 split
    if (outcome === "none") continue;

    const amountPaid = outcome === "full" ? totalDue : Math.round(totalDue * (0.3 + rand() * 0.4));
    const numInstalments = chance(0.6) ? 1 : 2;
    let remaining = amountPaid;

    for (let i = 0; i < numInstalments; i++) {
      const thisAmount = i === numInstalments - 1 ? remaining : Math.round(amountPaid / numInstalments);
      remaining -= thisAmount;
      if (thisAmount <= 0) continue;

      const method = chance(0.7) ? "mpesa" : chance(0.5) ? "cash" : "bank";
      const daysAgo = randInt(1, 55);
      paymentRows.push({
        id: randomUUID(),
        schoolId: school.id,
        studentId: student.id,
        termId: currentTerm.id,
        receiptNumber: `NKA-${String(receiptCounter++).padStart(6, "0")}`,
        amount: thisAmount,
        paymentMethod: method,
        mpesaCode: method === "mpesa" ? mpesaCode() : null,
        mpesaPhone: method === "mpesa" ? fakePhone() : null,
        mpesaName: method === "mpesa" ? `${student.firstName.toUpperCase()} ${student.lastName.toUpperCase()}` : null,
        paidAt: addDays(today, -daysAgo),
        recordedBy: method === "mpesa" ? null : bursarUser.id,
        notes: method === "cash" ? "Recorded manually at bursar's office" : null,
      });
    }
  }
  await createManyChunked("Fee payments", (d) => prisma.feePayment.createMany({ data: d }), paymentRows);

  const paidCount = new Set(paymentRows.map((p) => p.studentId)).size;
  console.log(`  (${paidCount}/${studentRows.length} students have at least one payment; ~${studentRows.length - paidCount} are defaulters with zero payments)`);

  // ── 13. ATTENDANCE — teacher + student, over the 10 seeded school days ─
  type TeacherAttRow = {
    id: string; schoolId: string; teacherId: string; slotId: string; date: Date;
    checkedInAt: Date | null; geofencePassed: boolean; qrScanned: boolean; status: string;
    minutesLate: number | null; absenceReason: string | null;
  };
  type StudentLessonRow = {
    id: string; schoolId: string; studentId: string; slotId: string; date: Date;
    status: string; absenceReason: string | null; markedBy: string; parentNotified: boolean; notificationHeld: boolean;
  };
  type StudentDailyRow = {
    id: string; schoolId: string; studentId: string; date: Date;
    arrivedAt: Date | null; status: string;
  };

  const teacherAttRows: TeacherAttRow[] = [];
  const studentLessonRows: StudentLessonRow[] = [];
  const dailyAgg = new Map<string, { total: number; absent: number }>(); // key: studentId|date

  // group slots by stream for fast student lookup
  const studentsByStream = new Map<string, StudentRow[]>();
  for (const s of studentRows) {
    const arr = studentsByStream.get(s.streamId) ?? [];
    arr.push(s);
    studentsByStream.set(s.streamId, arr);
  }
  const teacherUserByTeacherId = new Map(teachers.map((tc) => [tc.teacherId, tc.userId]));

  for (const date of schoolDays) {
    const isToday = date.getTime() === today.getTime();
    const jsDay = date.getDay(); // 1..5 expected (weekdays only, per schoolDays construction)

    for (const slot of slotRows.filter((s) => s.dayOfWeek === jsDay)) {
      // Teacher attendance for this slot/date
      const roll = rand();
      let status = "present";
      let minutesLate: number | null = null;
      let absenceReason: string | null = null;
      let checkedInAt: Date | null = null;
      if (roll < 0.05) {
        status = "absent";
        absenceReason = pick(["sick", "official_duty", "unknown"]);
      } else if (roll < 0.12) {
        status = "late";
        minutesLate = randInt(5, 25);
        checkedInAt = date;
      } else {
        checkedInAt = date;
      }
      teacherAttRows.push({
        id: randomUUID(),
        schoolId: school.id,
        teacherId: slot.teacherId,
        slotId: slot.id,
        date,
        checkedInAt,
        geofencePassed: status !== "absent",
        qrScanned: status !== "absent",
        status,
        minutesLate,
        absenceReason,
      });

      // Student lesson attendance for every student in this slot's stream
      const markerUserId = teacherUserByTeacherId.get(slot.teacherId)!;
      const studentsInStream = studentsByStream.get(slot.streamId) ?? [];
      for (const student of studentsInStream) {
        const sRoll = rand();
        let sStatus = "present";
        let sReason: string | null = null;
        if (sRoll < 0.06) {
          sStatus = "absent";
          sReason = "unknown";
        } else if (sRoll < 0.09) {
          sStatus = "absent";
          sReason = "sick";
        } else if (sRoll < 0.1) {
          sStatus = "late";
        }

        studentLessonRows.push({
          id: randomUUID(),
          schoolId: school.id,
          studentId: student.id,
          slotId: slot.id,
          date,
          status: sStatus,
          absenceReason: sReason,
          markedBy: markerUserId,
          parentNotified: sStatus === "absent" && !isToday,
          notificationHeld: sStatus === "absent" && isToday, // today's absences sit in the 15-min buffer
        });

        const key = `${student.id}|${date.toISOString()}`;
        const agg = dailyAgg.get(key) ?? { total: 0, absent: 0 };
        agg.total++;
        if (sStatus === "absent") agg.absent++;
        dailyAgg.set(key, agg);
      }
    }
  }

  await createManyChunked("Teacher attendance", (d) => prisma.teacherAttendance.createMany({ data: d }), teacherAttRows);
  await createManyChunked("Student lesson attendance", (d) => prisma.studentLessonAttendance.createMany({ data: d }), studentLessonRows, 3000);

  const dailyRows: StudentDailyRow[] = [];
  for (const [key, agg] of Array.from(dailyAgg.entries())) {
    const [studentId, dateStr] = key.split("|");
    const allAbsent = agg.absent === agg.total;
    dailyRows.push({
      id: randomUUID(),
      schoolId: school.id,
      studentId,
      date: new Date(dateStr),
      arrivedAt: allAbsent ? null : new Date(new Date(dateStr).getTime() + (7 * 60 + randInt(15, 55)) * 60000),
      status: allAbsent ? "absent" : agg.absent > 0 ? "present" : "present",
    });
  }
  await createManyChunked("Student daily attendance", (d) => prisma.studentDailyAttendance.createMany({ data: d }), dailyRows, 3000);

  // ── SUMMARY ──────────────────────────────────────────────────────────
  console.log("\n✅ Seed complete.\n");
  console.log("Hero test accounts (swap clerkId after signing up through Clerk):");
  console.log(`  Admin:   ${heroEmail("admin")}   (clerkId: seed_admin_replace_me)`);
  console.log(`  Deputy:  ${heroEmail("deputy")}  (clerkId: seed_deputy_replace_me)`);
  console.log(`  Bursar:  ${heroEmail("bursar")}  (clerkId: seed_bursar_replace_me)`);
  console.log(`  Teacher: ${heroEmail("teacher")} (clerkId: seed_teacher_replace_me) — class teacher of Grade 5A`);
  console.log(`  Parent:  ${heroEmail("parent")}  (clerkId: seed_parent_replace_me) — 2 linked children, mixed fee balances`);
  console.log("\nScale: " + studentRows.length + " students, " + teachers.length + " teachers, " +
    (guardianUsers.length + 1) + " guardian accounts, " + slotRows.length + " timetable slots, " +
    paymentRows.length + " payments, " + studentLessonRows.length + " lesson-attendance rows.");
  console.log("\nNOT seeded in this pass (Phase 3/4 tables — add when you build those modules):");
  console.log("  assessments/results, term reports, portfolio artefacts, messages, activities,");
  console.log("  exam timetable, teacher duties, lesson-register locks, payment disputes, audit logs, QR tokens.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });