import { describe, expect, it } from 'vitest';
import { validateRegisterDate } from '@/lib/attendance/register-date';

// Monday 26 Oct 2026, 08:00 UTC
const NOW = new Date('2026-10-26T08:00:00Z');
const MONDAY = 1;

describe('validateRegisterDate (ATT-10, first part)', () => {
  it("accepts today when it is the slot's weekday", () => {
    const r = validateRegisterDate('2026-10-26', MONDAY, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.date.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('accepts a past date on the right weekday (offline sync can arrive later)', () => {
    expect(validateRegisterDate('2026-10-19', MONDAY, NOW).ok).toBe(true);
    expect(validateRegisterDate('2026-01-05', MONDAY, NOW).ok).toBe(true);
  });

  it.each([
    '',
    'garbage',
    '2026-1-5',
    '26-10-2026',
    '2026/10/26',
    '2026-10-26T08:00:00Z',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
  ])('rejects malformed or impossible date %j', (input) => {
    const r = validateRegisterDate(input, MONDAY, NOW);
    expect(r.ok).toBe(false);
  });

  it("rejects a date that is not the slot's weekday (a Monday lesson cannot be registered on a Tuesday)", () => {
    const r = validateRegisterDate('2026-10-27', MONDAY, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Monday/);
  });

  it('rejects dates in the future', () => {
    const r = validateRegisterDate('2026-11-02', MONDAY, NOW); // next Monday
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/future/i);
  });

  it('tolerates one day of timezone skew until Africa/Nairobi handling lands (R4-01): Tuesday 01:00 EAT is still Monday UTC', () => {
    const lateMondayUtc = new Date('2026-10-26T22:30:00Z'); // = Tue 01:30 in Nairobi
    expect(validateRegisterDate('2026-10-27', 2, lateMondayUtc).ok).toBe(true);
  });

  it('works for every weekday number 1-5', () => {
    const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
    const now = new Date('2026-10-30T09:00:00Z');
    days.forEach((d, i) => expect(validateRegisterDate(d, i + 1, now).ok).toBe(true));
  });
});
