import { describe, expect, it } from 'vitest';

/**
 * FINDING ATT-04 (was "verify"): attendance routes build a timestamp from a Prisma
 * @db.Time column by string interpolation. Prisma returns that column as a JS Date,
 * so the interpolation produces garbage and `new Date(...)` is Invalid Date.
 * Every `<` / `>` comparison against NaN is false, so the "too early / period ended /
 * late" checks silently never fire.
 *
 * `test.fails` = passes while the bug exists; turns RED once it is fixed, which is the
 * signal to delete the `.fails` marker (R4-01).
 */
const today = '2026-10-26';
// What Prisma returns for a TIME '08:00:00' column:
const periodStart = new Date('1970-01-01T08:00:00.000Z');

describe('ATT-04 time maths', () => {
  it('documents the mechanism: comparisons with an Invalid Date are always false', () => {
    const broken = new Date(`${today}T${periodStart}`); // the exact expression used in the routes
    expect(Number.isNaN(broken.getTime())).toBe(true);
    const now = new Date();
    expect(now < broken).toBe(false);
    expect(now > broken).toBe(false);
  });

  it.fails("the route's expression should yield a valid period start (BUG ATT-04)", () => {
    const built = new Date(`${today}T${periodStart}`);
    expect(Number.isNaN(built.getTime())).toBe(false);
  });
});
