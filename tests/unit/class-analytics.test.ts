import { describe, expect, it } from 'vitest';
import {
  absencesByReason,
  absencesBySubject,
  classRate,
  rateOf,
  summariseLearners,
  todaySnapshot,
  weekStartOf,
  weeklyTrend,
} from '@/lib/attendance/class-analytics';

const rec = (studentId: string, date: string, status: string) => ({ studentId, date, status });

describe('rateOf', () => {
  it('is attended (present + late) over recorded present + late + absent', () => {
    expect(rateOf(8, 1, 1)).toBe(90);
    expect(rateOf(1, 0, 2)).toBe(33.3);
  });
  it('is null, NOT 0% and NOT 100%, when nothing has been recorded', () => {
    expect(rateOf(0, 0, 0)).toBeNull();
  });
});

describe('summariseLearners', () => {
  it('counts each status, and a late learner counts as attending', () => {
    const [a] = summariseLearners(['a'], [
      rec('a', '2026-11-02', 'present'),
      rec('a', '2026-11-03', 'late'),
      rec('a', '2026-11-04', 'absent'),
      rec('a', '2026-11-05', 'present'),
    ]);
    expect(a).toMatchObject({ present: 2, late: 1, absent: 1, recordedDays: 4, ratePct: 75 });
  });

  it('a learner with NO records is in the list with a null rate, never 0% or "absent"', () => {
    const rows = summariseLearners(['a', 'b'], [rec('a', '2026-11-02', 'present')]);
    expect(rows.find((r) => r.studentId === 'b')).toMatchObject({ recordedDays: 0, ratePct: null });
  });

  it('ignores records of people who are not in this class', () => {
    const rows = summariseLearners(['a'], [rec('stranger', '2026-11-02', 'absent')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recordedDays: 0, absent: 0 });
  });

  it('keeps unknown statuses (e.g. half_day) OUT of the rate but still reports them', () => {
    const [a] = summariseLearners(['a'], [
      rec('a', '2026-11-02', 'present'),
      rec('a', '2026-11-03', 'half_day'),
    ]);
    expect(a).toMatchObject({ other: 1, recordedDays: 2, ratePct: 100 });
  });
});

describe('classRate', () => {
  it('counts every learner-day once', () => {
    const learners = summariseLearners(['a', 'b'], [
      rec('a', '2026-11-02', 'present'),
      rec('a', '2026-11-03', 'present'),
      rec('b', '2026-11-02', 'absent'),
      rec('b', '2026-11-03', 'present'),
    ]);
    expect(classRate(learners)).toBe(75);
  });
  it('is null for a class with no attendance recorded at all', () => {
    expect(classRate(summariseLearners(['a', 'b'], []))).toBeNull();
  });
});

describe('todaySnapshot', () => {
  it('separates NOT MARKED from absent: 24 learners and no register taken is 0 absent, 24 not marked', () => {
    const ids = Array.from({ length: 24 }, (_, i) => `s${i}`);
    expect(todaySnapshot(ids, [], '2026-11-24')).toEqual({
      total: 24, present: 0, late: 0, absent: 0, other: 0, notMarked: 24,
    });
  });

  it('counts only today, only this class, and a learner once', () => {
    const snap = todaySnapshot(['a', 'b', 'c'], [
      rec('a', '2026-11-24', 'present'),
      rec('b', '2026-11-24', 'absent'),
      rec('b', '2026-11-23', 'present'), // yesterday: not today
      rec('zzz', '2026-11-24', 'absent'), // not in the class
      rec('a', new Date('2026-11-24T00:00:00.000Z') as unknown as string, 'present'),
    ], '2026-11-24');
    expect(snap).toMatchObject({ present: 1, absent: 1, late: 0, notMarked: 1 });
  });
});

describe('weekStartOf / weeklyTrend', () => {
  it('a week starts on Monday; Sunday belongs to the week before', () => {
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23'); // Monday
    expect(weekStartOf('2026-11-27')).toBe('2026-11-23'); // Friday
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23'); // Sunday
    expect(weekStartOf('2026-11-30')).toBe('2026-11-30'); // next Monday
  });

  it('gives one point per week that has records, oldest first, last N weeks only', () => {
    const t = weeklyTrend([
      rec('a', '2026-11-24', 'present'),
      rec('a', '2026-11-25', 'absent'),
      rec('a', '2026-11-17', 'present'),
      rec('a', '2026-11-10', 'absent'),
    ], 2);
    expect(t.map((w) => w.weekStart)).toEqual(['2026-11-16', '2026-11-23']);
    expect(t[1]).toMatchObject({ ratePct: 50, recordedDays: 2 });
  });
});

describe('absences by reason and subject', () => {
  const lessons = [
    { status: 'absent', absenceReason: 'sick', subject: 'Mathematics' },
    { status: 'absent', absenceReason: 'sick', subject: 'Science' },
    { status: 'absent', absenceReason: null, subject: 'Mathematics' },
    { status: 'present', absenceReason: null, subject: 'Mathematics' },
    { status: 'late', absenceReason: null, subject: 'Science' },
  ];
  it('counts ONLY absences, most common first, with readable labels', () => {
    expect(absencesByReason(lessons)).toEqual([
      { reason: 'Sick', count: 2 },
      { reason: 'No reason given', count: 1 },
    ]);
  });
  it('groups missed lessons by subject', () => {
    expect(absencesBySubject(lessons)).toEqual([
      { subject: 'Mathematics', count: 2 },
      { subject: 'Science', count: 1 },
    ]);
  });
});
