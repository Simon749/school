/**
 * Validates the date of a student lesson register against the lesson's weekday.
 *
 * - Must be a real calendar date written YYYY-MM-DD (no times, no impossible dates).
 * - Must be the same weekday as the timetable slot (1 = Monday ... 5 = Friday).
 * - Must not be in the future, evaluated strictly in the school's local timezone (Africa/Nairobi).
 * - Past dates are allowed: an offline device may sync later.
 */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type RegisterDateResult = { ok: true; date: Date } | { ok: false; error: string };

export function validateRegisterDate(
  input: string,
  slotDayOfWeek: number,
  now: Date = new Date()
): RegisterDateResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { ok: false, error: 'Date must be written as YYYY-MM-DD' };
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    return { ok: false, error: 'That is not a real calendar date' };
  }

  if (date.getUTCDay() !== slotDayOfWeek) {
    const expected = WEEKDAYS[slotDayOfWeek] ?? 'a different day';
    return { ok: false, error: `This lesson takes place on ${expected}s, not on ${input}` };
  }

  const nairobiToday = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  if (input > nairobiToday) {
    return { ok: false, error: 'A register cannot be taken for a date in the future' };
  }

  return { ok: true, date };
}
