// src/lib/attendance/class-analytics.ts
//
// Attendance analytics for a class teacher. Pure functions: no database, no clock (the caller
// passes "now"), so every rule below is covered by tests.
//
// Rules (the two that matter most for trust):
//  1. Only RECORDED attendance is counted. A day with no record is "not recorded", NEVER absent, so a
//     rate is never dragged down by a register nobody took.
//  2. A rate is `null` ("no attendance recorded yet") when there is nothing to divide by. It is not
//     0% and not 100%.
//
// "Attended" = present or late. A learner marked late did come to school.
// Statuses other than present / late / absent (e.g. half_day) are reported separately as `other`
// and are NOT in the rate: how a half day should count is a school policy that has not been decided.

export interface DailyRecord {
  studentId: string;
  /** A date-only value. Compared by its YYYY-MM-DD, never by time of day. */
  date: Date | string;
  status: string;
}

export interface LessonAbsence {
  status: string;
  absenceReason: string | null;
  subject: string | null;
}

export interface LearnerAttendance {
  studentId: string;
  present: number;
  late: number;
  absent: number;
  other: number;
  /** Days with a record (present + late + absent + other). */
  recordedDays: number;
  /** Percentage of attended days among present + late + absent days; null when there are none. */
  ratePct: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const dayKey = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

export function rateOf(present: number, late: number, absent: number): number | null {
  const base = present + late + absent;
  return base > 0 ? round1(((present + late) / base) * 100) : null;
}

/** One row per learner of the class, including learners who have no record at all. */
export function summariseLearners(studentIds: string[], records: DailyRecord[]): LearnerAttendance[] {
  const rows = new Map<string, LearnerAttendance>(
    studentIds.map((studentId) => [
      studentId,
      { studentId, present: 0, late: 0, absent: 0, other: 0, recordedDays: 0, ratePct: null },
    ])
  );
  for (const r of records) {
    const row = rows.get(r.studentId);
    if (!row) continue; // a record for someone who is not in this class is ignored, never counted
    if (r.status === 'present') row.present++;
    else if (r.status === 'late') row.late++;
    else if (r.status === 'absent') row.absent++;
    else row.other++;
    row.recordedDays++;
  }
  for (const row of rows.values()) row.ratePct = rateOf(row.present, row.late, row.absent);
  return [...rows.values()];
}

/** The class as a whole: every learner-day counted once; null when nothing was recorded. */
export function classRate(learners: LearnerAttendance[]): number | null {
  const present = learners.reduce((n, l) => n + l.present, 0);
  const late = learners.reduce((n, l) => n + l.late, 0);
  const absent = learners.reduce((n, l) => n + l.absent, 0);
  return rateOf(present, late, absent);
}

/** Today's picture: how many are in each state and how many have no record yet. */
export function todaySnapshot(studentIds: string[], records: DailyRecord[], todayKey: string) {
  const ids = new Set(studentIds);
  const byStudent = new Map<string, string>();
  for (const r of records) {
    if (ids.has(r.studentId) && dayKey(r.date) === todayKey) byStudent.set(r.studentId, r.status);
  }
  let present = 0;
  let late = 0;
  let absent = 0;
  let other = 0;
  for (const status of byStudent.values()) {
    if (status === 'present') present++;
    else if (status === 'late') late++;
    else if (status === 'absent') absent++;
    else other++;
  }
  return {
    total: studentIds.length,
    present,
    late,
    absent,
    other,
    notMarked: studentIds.length - byStudent.size,
  };
}

/** Monday (YYYY-MM-DD) of the week containing the given date. */
export function weekStartOf(date: Date | string): string {
  const d = new Date(`${dayKey(date)}T00:00:00.000Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface WeekPoint {
  weekStart: string;
  ratePct: number | null;
  recordedDays: number;
}

/** Attendance rate per week (Monday-based), oldest first, only weeks that have any record. */
export function weeklyTrend(records: DailyRecord[], maxWeeks = 8): WeekPoint[] {
  const weeks = new Map<string, { present: number; late: number; absent: number; recorded: number }>();
  for (const r of records) {
    const key = weekStartOf(r.date);
    const w = weeks.get(key) ?? { present: 0, late: 0, absent: 0, recorded: 0 };
    if (r.status === 'present') w.present++;
    else if (r.status === 'late') w.late++;
    else if (r.status === 'absent') w.absent++;
    w.recorded++;
    weeks.set(key, w);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-maxWeeks)
    .map(([weekStart, w]) => ({
      weekStart,
      ratePct: rateOf(w.present, w.late, w.absent),
      recordedDays: w.recorded,
    }));
}

const REASON_LABELS: Record<string, string> = {
  sick: 'Sick',
  activity: 'School activity',
  disciplinary: 'Disciplinary',
  unknown: 'No reason given',
  parent_pickup: 'Parent pickup',
  event: 'School event',
};
export const reasonLabel = (reason: string | null): string =>
  reason ? (REASON_LABELS[reason] ?? reason.replace(/_/g, ' ')) : 'No reason given';

/** Missed lessons grouped by the reason the teacher recorded, most common first. */
export function absencesByReason(lessons: LessonAbsence[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of lessons) {
    if (l.status !== 'absent') continue;
    const label = reasonLabel(l.absenceReason);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** Missed lessons grouped by subject, most missed first. */
export function absencesBySubject(lessons: LessonAbsence[]): { subject: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of lessons) {
    if (l.status !== 'absent') continue;
    const subject = l.subject ?? 'Unknown subject';
    counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject));
}
