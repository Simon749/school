// src/app/api/admin/dashboard/route.ts
//
// Backs the admin dashboard at src/app/(dashboard)/admin/page.tsx.
// Response shape intentionally mirrors that file's `DashboardData` interface
// exactly — do not change field names here without updating that file too.
//
// Auth pattern follows fees/balance, fees/defaulters, attendance/teacher etc:
// Clerk auth() -> look up our own `users` row by clerkId -> use its
// schoolId/role as the source of truth (not sessionClaims.metadata, which
// audit-logs/route.ts uses — that's a pre-existing inconsistency in this
// codebase, not something introduced here; DB lookup is used because it's
// the pattern the majority of routes already follow and can't go stale the
// way session claims can).
//
// Configurable thresholds (school.settings.dashboard.*):
// These are operational defaults, not invented Kenyan-school policy or CBC
// rules (see AGENTS.md §3, §36). They are stored per-school in the existing
// `settings` JSONB column so they're visible/overridable, not hardcoded
// business rules pretending to be authoritative.
//   - balanceThresholdPct: a student is flagged once their fee balance
//     exceeds this fraction of the term's average amount-due-per-student.
//     Default 0.5 (50%).
//   - needsAttentionPct: a subject/grade average (marks-based assessments
//     only — never applied to CBC rubric scores, which have no percentage
//     equivalent) below this % is flagged. Default 50.
//
// Known limitation: with a single pilot school this route aggregates by
// fetching term-scoped rows and reducing in JS rather than SQL-side
// aggregation. That is deliberate for auditability at this data volume
// (AGENTS.md §79) but should be revisited before onboarding schools with
// many terms of history (AGENTS.md §94).

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

const DEFAULT_BALANCE_THRESHOLD_PCT = 0.5;
const DEFAULT_NEEDS_ATTENTION_PCT = 50;
const MIN_SAMPLE_FOR_NEEDS_ATTENTION = 3;

interface DashboardSettings {
  dashboard?: {
    balanceThresholdPct?: number;
    needsAttentionPct?: number;
  };
}

function dateOnly(d: Date): Date {
  return new Date(d.toISOString().split("T")[0]);
}

function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

export async function GET() {
  const { userId: clerkId } = auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!authUser?.schoolId || authUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = ["admin", "it_admin"];
  if (!allowed.includes(authUser.role)) {
    console.log(`🔴 Forbidden: DB role is "${authUser.role}", expected one of ${allowed.join(", ")}`);
    return new NextResponse("Forbidden", { status: 403 });
  }
  const schoolId = authUser.schoolId;

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const settings = (school.settings ?? {}) as DashboardSettings;
  const balanceThresholdPct =
    settings.dashboard?.balanceThresholdPct ?? DEFAULT_BALANCE_THRESHOLD_PCT;
  const needsAttentionPct = settings.dashboard?.needsAttentionPct ?? DEFAULT_NEEDS_ATTENTION_PCT;

  const today = dateOnly(new Date());
  const sevenDayWindowStart = new Date(today);
  sevenDayWindowStart.setDate(sevenDayWindowStart.getDate() - 6);
  const fourWeekWindowStart = new Date(today);
  fourWeekWindowStart.setDate(fourWeekWindowStart.getDate() - 27);

  const [currentTerm, calendarDayToday, activeStudents, teachers, dailyAttendanceToday, teacherAttendanceToday] =
    await Promise.all([
      prisma.term.findFirst({ where: { schoolId, isCurrent: true } }),
      prisma.schoolCalendarDay.findUnique({
        where: { schoolId_date: { schoolId, date: today } },
      }),
      prisma.student.findMany({
        where: { schoolId, deletedAt: null, status: "active" },
        select: {
          id: true,
          gender: true,
          isBoarding: true,
          enrollmentDate: true,
          stream: { select: { grade: { select: { name: true, level: true } } } },
        },
      }),
      prisma.teacher.findMany({
        where: { schoolId, user: { isActive: true, deletedAt: null } },
        select: { id: true },
      }),
      prisma.studentDailyAttendance.findMany({
        where: { schoolId, date: today },
        select: { status: true },
      }),
      prisma.teacherAttendance.findMany({
        where: { schoolId, date: today, checkedInAt: { not: null } },
        select: { teacherId: true },
      }),
    ]);

  // ---- Calendar -----------------------------------------------------
  const isSchoolDayToday = calendarDayToday?.dayType === "school_day";
  const dayType = calendarDayToday?.dayType ?? null;
  

  // ---- Enrolment (term-independent) ----------------------------------
  const newThisTermCount = currentTerm
    ? activeStudents.filter((s: { enrollmentDate: Date; }) => s.enrollmentDate >= currentTerm.startDate).length
    : 0;
  const boardingCount = activeStudents.filter((s: { isBoarding: any; }) => s.isBoarding).length;
  const girlsCount = activeStudents.filter((s: { gender: string | null; }) => s.gender === "F").length;
  const boysCount = activeStudents.filter((s: { gender: string | null; }) => s.gender === "M").length;

  const byGradeMap = new Map<string, { count: number; level: number }>();
  for (const s of activeStudents) {
    const g = s.stream.grade;
    const existing = byGradeMap.get(g.name);
    if (existing) existing.count += 1;
    else byGradeMap.set(g.name, { count: 1, level: g.level });
  }
  const enrolmentByGrade = [...byGradeMap.entries()]
    .sort((a, b) => a[1].level - b[1].level)
    .map(([grade, v]) => ({ grade, count: v.count }));

  // ---- Attendance (today) --------------------------------------------
  const studentRecordedToday = dailyAttendanceToday.length;
  const studentPresentToday = dailyAttendanceToday.filter(
    (a: { status: string; }) => a.status === "present" || a.status === "late"
  ).length;
  const teachersCheckedInToday = new Set(teacherAttendanceToday.map((a: { teacherId: any; }) => a.teacherId)).size;
  const activeTeachersCount = teachers.length;

  // ---- Alerts (built up as we go) ------------------------------------
  const alerts: Array<{
    id: string;
    severity: "critical" | "high" | "medium" | "low";
    title: string;
    detail: string;
    actionLabel: string;
    actionHref: string;
  }> = [];

  // ---- Financial + Academic (require a current term) ------------------
  let financial = {
    collected: 0,
    target: 0,
    outstanding: 0,
    collectionRatePct: 0,
    todayMpesa: { amount: 0, count: 0 },
    weeklyTrend: [] as { weekLabel: string; amount: number }[],
    recentPayments: [] as {
      id: string;
      name: string;
      stream: string;
      amount: number;
      method: string;
      time: string;
    }[],
    studentsOverBalanceThreshold: 0,
    balanceThreshold: 0,
  };

  let academic = {
    overallScorePct: null as number | null,
    byGrade: [] as { grade: string; scorePct: number; count: number }[],
    needsAttention: [] as { subject: string; grade: string; scorePct: number }[],
    unpublishedAssessments: 0,
  };

  let recentActivity: { type: "enrolment" | "payment" | "assessment"; text: string; time: string }[] = [];

  if (!currentTerm) {
    alerts.push({
      id: "no-current-term",
      severity: "critical",
      title: "No current term configured",
      detail:
        "Fees, attendance summaries and results can't be tracked until an academic term is marked current.",
      actionLabel: "Go to calendar",
      actionHref: "/admin/calendar",
    });
  } else {
    const [studentFees, feePayments, assessmentsForTerm, results, recentStudents] = await Promise.all([
      prisma.studentFee.findMany({
        where: { schoolId, termId: currentTerm.id },
        select: { studentId: true, amountDue: true, discount: true, carryForwardAmount: true },
      }),
      prisma.feePayment.findMany({
        where: { schoolId, termId: currentTerm.id, isReversed: false },
        include: {
          student: { select: { firstName: true, lastName: true, stream: { select: { name: true, grade: { select: { name: true } } } } } },
        },
        orderBy: { paidAt: "desc" },
      }),
      prisma.assessment.findMany({
        where: { schoolId, termId: currentTerm.id },
        select: { id: true, status: true },
      }),
      prisma.assessmentResult.findMany({
        where: {
          marksObtained: { not: null },
          assessment: { schoolId, termId: currentTerm.id, status: "published", maxMarks: { not: null } },
        },
        select: {
          marksObtained: true,
          assessment: {
            select: {
              maxMarks: true,
              learningArea: { select: { name: true } },
              stream: { select: { grade: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.student.findMany({
        where: { schoolId, deletedAt: null, status: "active" },
        select: { firstName: true, lastName: true, enrollmentDate: true },
        orderBy: { enrollmentDate: "desc" },
        take: 5,
      }),
    ]);

    // Fee structure existence check (used both for balance calc + an alert)
    if (studentFees.length === 0) {
      alerts.push({
        id: "no-fee-structure",
        severity: "high",
        title: "No fee items assigned for this term",
        detail: `No student fee records exist yet for ${currentTerm.name || "the current term"}.`,
        actionLabel: "Set up fees",
        actionHref: "/bursar/fees/structure",
      });
    }

    // ---- Financial: balance formula, identical to fees/balance & fees/defaulters ----
    const dueByStudent = new Map<string, number>();
    for (const f of studentFees) {
      const due = Number(f.amountDue) - Number(f.discount) + Number(f.carryForwardAmount);
      dueByStudent.set(f.studentId, (dueByStudent.get(f.studentId) ?? 0) + due);
    }
    const paidByStudent = new Map<string, number>();
    for (const p of feePayments) {
      paidByStudent.set(p.studentId, (paidByStudent.get(p.studentId) ?? 0) + Number(p.amount));
    }

    const target = [...dueByStudent.values()].reduce((s, v) => s + v, 0);
    const collected = [...paidByStudent.values()].reduce((s, v) => s + v, 0);
    const outstanding = target - collected;
    const collectionRatePct = target > 0 ? Math.round((collected / target) * 100) : 0;

    const todayMpesaPayments = feePayments.filter(
      (p: { paymentMethod: string; paidAt: Date; }) => p.paymentMethod === "mpesa" && dateOnly(p.paidAt).getTime() === today.getTime()
    );
    const todayMpesa = {
      amount: todayMpesaPayments.reduce((s: number, p: { amount: any; }) => s + Number(p.amount), 0),
      count: todayMpesaPayments.length,
    };

    // Weekly trend: last 4 weeks, bucketed by week-start (Mon)
    const weekBuckets = new Map<string, number>();
    for (const p of feePayments) {
      if (p.paidAt < fourWeekWindowStart) continue;
      const d = new Date(p.paidAt);
      const day = d.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() + mondayOffset);
      const key = weekStart.toISOString().split("T")[0];
      weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + Number(p.amount));
    }
    const weeklyTrend = [...weekBuckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, amount]) => ({
        weekLabel: `Week of ${new Date(weekStart).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}`,
        amount,
      }));

    const recentPayments = feePayments.slice(0, 5).map((p: { id: any; student: { firstName: any; lastName: any; stream: { grade: { name: any; }; name: any; }; }; amount: any; paymentMethod: any; paidAt: { toISOString: () => any; }; }) => ({
      id: p.id,
      name: `${p.student.firstName} ${p.student.lastName}`,
      stream: `${p.student.stream.grade.name} ${p.student.stream.name}`,
      amount: Number(p.amount),
      method: p.paymentMethod,
      time: p.paidAt.toISOString(),
    }));

    const activeStudentCount = activeStudents.length;
    const avgDuePerStudent = activeStudentCount > 0 ? target / activeStudentCount : 0;
    const balanceThreshold = avgDuePerStudent * balanceThresholdPct;
    let studentsOverBalanceThreshold = 0;
    for (const s of activeStudents) {
      const balance = (dueByStudent.get(s.id) ?? 0) - (paidByStudent.get(s.id) ?? 0);
      if (balance > balanceThreshold) studentsOverBalanceThreshold += 1;
    }

    financial = {
      collected,
      target,
      outstanding,
      collectionRatePct,
      todayMpesa,
      weeklyTrend,
      recentPayments,
      studentsOverBalanceThreshold,
      balanceThreshold: Math.round(balanceThreshold),
    };

    if (studentsOverBalanceThreshold > 0) {
      alerts.push({
        id: "students-over-balance",
        severity: "medium",
        title: `${studentsOverBalanceThreshold} student${studentsOverBalanceThreshold === 1 ? "" : "s"} over the balance flag`,
        detail: `Fee balance exceeds KES ${Math.round(balanceThreshold).toLocaleString()} (${Math.round(balanceThresholdPct * 100)}% of this term's average amount due).`,
        actionLabel: "View defaulters",
        actionHref: "/bursar/fees/payments",
      });
    }

    // ---- Academic ----------------------------------------------------
    const unpublishedAssessments = assessmentsForTerm.filter((a: { status: string; }) => a.status === "draft").length;

    const scored = results
      .filter((r: { assessment: { maxMarks: any; }; }) => r.assessment.maxMarks && Number(r.assessment.maxMarks) > 0)
      .map((r: { marksObtained: any; assessment: { maxMarks: any; stream: { grade: { name: any; }; }; learningArea: { name: any; }; }; }) => ({
        pct: (Number(r.marksObtained) / Number(r.assessment.maxMarks)) * 100,
        grade: r.assessment.stream.grade.name,
        subject: r.assessment.learningArea.name,
      }));

    const overallScorePct =
      scored.length > 0 ? Math.round(scored.reduce((s: any, r: { pct: any; }) => s + r.pct, 0) / scored.length) : null;

    const gradeAgg = new Map<string, { sum: number; count: number }>();
    for (const r of scored) {
      const e = gradeAgg.get(r.grade) ?? { sum: 0, count: 0 };
      e.sum += r.pct;
      e.count += 1;
      gradeAgg.set(r.grade, e);
    }
    const byGrade = [...gradeAgg.entries()].map(([grade, v]) => ({
      grade,
      scorePct: Math.round(v.sum / v.count),
      count: v.count,
    }));

    const subjectGradeAgg = new Map<string, { sum: number; count: number; subject: string; grade: string }>();
    for (const r of scored) {
      const key = `${r.subject}::${r.grade}`;
      const e = subjectGradeAgg.get(key) ?? { sum: 0, count: 0, subject: r.subject, grade: r.grade };
      e.sum += r.pct;
      e.count += 1;
      subjectGradeAgg.set(key, e);
    }
    const needsAttention = [...subjectGradeAgg.values()]
      .filter((e) => e.count >= MIN_SAMPLE_FOR_NEEDS_ATTENTION)
      .map((e) => ({ subject: e.subject, grade: e.grade, scorePct: Math.round(e.sum / e.count) }))
      .filter((e) => e.scorePct < needsAttentionPct)
      .sort((a, b) => a.scorePct - b.scorePct);

    academic = { overallScorePct, byGrade, needsAttention, unpublishedAssessments };

    if (unpublishedAssessments > 0) {
      alerts.push({
        id: "unpublished-assessments",
        severity: "low",
        title: `${unpublishedAssessments} assessment${unpublishedAssessments === 1 ? "" : "s"} not yet published`,
        detail: "Parents won't see these results until a teacher publishes them.",
        actionLabel: "Review",
        actionHref: "/admin/reports",
      });
    }

    // ---- Recent activity (merge enrolments + payments + published assessments) ----
    const publishedAssessments = await prisma.assessment.findMany({
      where: { schoolId, termId: currentTerm.id, status: "published" },
      select: { title: true, publishedAt: true, learningArea: { select: { name: true } } },
      orderBy: { publishedAt: "desc" },
      take: 5,
    });

    const activityItems: { type: "enrolment" | "payment" | "assessment"; text: string; time: string }[] = [
      ...recentStudents.map((s: { firstName: any; lastName: any; enrollmentDate: { toISOString: () => any; }; }) => ({
        type: "enrolment" as const,
        text: `${s.firstName} ${s.lastName} enrolled`,
        time: s.enrollmentDate.toISOString(),
      })),
      ...recentPayments.map((p: { name: any; amount: number; method: any; time: any; }) => ({
        type: "payment" as const,
        text: `${p.name} paid ${formatKesServer(p.amount)} (${p.method})`,
        time: p.time,
      })),
      ...publishedAssessments
        .filter((a: { publishedAt: Date | null; }) => a.publishedAt)
        .map((a: { learningArea: { name: string; }; title: string; publishedAt: Date | null; }) => ({
          type: "assessment" as const,
          text: `${a.learningArea.name} — ${a.title} published`,
          time: (a.publishedAt as Date).toISOString(),
        })),
    ];

    recentActivity = activityItems.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);
  }

  // ---- Attendance weekly trend (last 7 days, term-independent) -------
  const [dailyLast7, teacherLast7] = await Promise.all([
    prisma.studentDailyAttendance.findMany({
      where: { schoolId, date: { gte: sevenDayWindowStart, lte: today } },
      select: { date: true, status: true },
    }),
    prisma.teacherAttendance.findMany({
      where: { schoolId, date: { gte: sevenDayWindowStart, lte: today }, checkedInAt: { not: null } },
      select: { date: true, teacherId: true },
    }),
  ]);

  const attendanceWeeklyTrend: { date: string; dayLabel: string; students: number | null; teachers: number | null }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDayWindowStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split("T")[0];
    const dayRecords = dailyLast7.filter((r: { date: Date; }) => dateOnly(r.date).toISOString().split("T")[0] === key);
    const dayPresent = dayRecords.filter((r: { status: string; }) => r.status === "present" || r.status === "late").length;
    const teacherDayCheckedIn = new Set(
      teacherLast7.filter((r: { date: Date; }) => dateOnly(r.date).toISOString().split("T")[0] === key).map((r: { teacherId: any; }) => r.teacherId)
    ).size;

    attendanceWeeklyTrend.push({
      date: key,
      dayLabel: d.toLocaleDateString("en-KE", { weekday: "short" }),
      students: pct(dayPresent, dayRecords.length),
      teachers: pct(teacherDayCheckedIn, activeTeachersCount),
    });
  }

  return NextResponse.json({
    school: { name: school.name, term: currentTerm?.name ?? null },
    generatedAt: new Date().toISOString(),
    calendar: { isSchoolDayToday, dayType },
    pulse: {
      activeStudents: activeStudents.length,
      newThisTerm: newThisTermCount,
      activeTeachers: activeTeachersCount,
      teachersCheckedInToday,
      studentAttendanceTodayPct: pct(studentPresentToday, studentRecordedToday),
      collectionRatePct: financial.collectionRatePct,
      feesCollectedTerm: financial.collected,
    },
    alerts,
    financial,
    attendance: {
      studentToday: {
        recorded: studentRecordedToday,
        present: studentPresentToday,
        pct: pct(studentPresentToday, studentRecordedToday),
      },
      teacherTodayPct: pct(teachersCheckedInToday, activeTeachersCount),
      teachersCheckedInToday,
      activeTeachersCount,
      weeklyTrend: attendanceWeeklyTrend,
    },
    academic,
    enrolment: {
      total: activeStudents.length,
      newThisTerm: newThisTermCount,
      boarding: boardingCount,
      day: activeStudents.length - boardingCount,
      girls: girlsCount,
      boys: boysCount,
      byGrade: enrolmentByGrade,
    },
    recentActivity,
  });
}

function formatKesServer(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString()}`;
}