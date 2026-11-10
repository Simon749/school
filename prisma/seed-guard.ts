/**
 * Safety rails for prisma/seed.ts, which DELETES EVERY TABLE (schools, users, payments,
 * audit logs, ...) before inserting demo data.
 *
 * The seed may only run when ALL of these hold:
 *   1. NODE_ENV is not "production"
 *   2. DATABASE_URL is set
 *   3. SEED_CONFIRM_WIPE equals the name of the database in DATABASE_URL (typed confirmation,
 *      so a copy-pasted command or a wrong .env cannot silently wipe the wrong database)
 */
export function assertSafeToWipe(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the seed: NODE_ENV is production. The seed deletes ALL data.');
  }

  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('Refusing to run the seed: DATABASE_URL is not set.');
  }

  let dbName: string;
  try {
    dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('Refusing to run the seed: DATABASE_URL is not a valid URL.');
  }
  if (!dbName) {
    throw new Error('Refusing to run the seed: DATABASE_URL has no database name.');
  }

  if (env.SEED_CONFIRM_WIPE !== dbName) {
    throw new Error(
      `This seed DELETES ALL DATA in database "${dbName}". ` +
        `If that is what you want, re-run with SEED_CONFIRM_WIPE=${dbName}`
    );
  }
}

/**
 * Deterministic demo phone number that passes the app's validation (^254\d{9}$) but can never
 * belong to a real subscriber: a national number never starts with 0, so 2540… is unassignable.
 * (The previous generator produced 2547 + 8 random digits, i.e. real-looking Safaricom numbers.)
 */
export function syntheticPhone(index: number): string {
  return `2540${String(index).padStart(8, '0')}`;
}
