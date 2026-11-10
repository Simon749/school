import { describe, expect, it } from 'vitest';
import { assertSafeToWipe, syntheticPhone } from '../../prisma/seed-guard';

const DEV_URL = 'postgresql://u:p@ep-dev.neon.tech:5432/edutrack_dev?sslmode=require';

describe('seed guard (REL-06): the seed deletes EVERY table, including audit logs', () => {
  it('refuses to run in production, even with a confirmation', () => {
    expect(() =>
      assertSafeToWipe({
        NODE_ENV: 'production',
        DATABASE_URL: DEV_URL,
        SEED_CONFIRM_WIPE: 'edutrack_dev',
      })
    ).toThrow(/production/i);
  });

  it('refuses without DATABASE_URL', () => {
    expect(() => assertSafeToWipe({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/);
  });

  it('refuses without an explicit typed confirmation, naming the database it would wipe', () => {
    expect(() => assertSafeToWipe({ NODE_ENV: 'development', DATABASE_URL: DEV_URL })).toThrow(
      /edutrack_dev/
    );
  });

  it('refuses when the confirmation names a different database', () => {
    expect(() =>
      assertSafeToWipe({
        NODE_ENV: 'development',
        DATABASE_URL: DEV_URL,
        SEED_CONFIRM_WIPE: 'edutrack_prod',
      })
    ).toThrow(/edutrack_dev/);
  });

  it('allows the wipe only when the confirmation matches the target database name', () => {
    expect(() =>
      assertSafeToWipe({
        NODE_ENV: 'development',
        DATABASE_URL: DEV_URL,
        SEED_CONFIRM_WIPE: 'edutrack_dev',
      })
    ).not.toThrow();
  });
});

describe('seed phone numbers (REL-07): must never be dialable by real people', () => {
  it("passes the app's own phone validation but cannot be a real Kenyan subscriber number", () => {
    for (let i = 0; i < 500; i++) {
      const phone = syntheticPhone(i);
      expect(phone).toMatch(/^254\d{9}$/); // same rule as guardianLinkSchema / teacher schema
      // A national significant number never begins with 0, so 2540… cannot be a real subscriber.
      expect(phone.startsWith('2540')).toBe(true);
    }
  });

  it('is unique per index', () => {
    const set = new Set(Array.from({ length: 2000 }, (_, i) => syntheticPhone(i)));
    expect(set.size).toBe(2000);
  });
});
