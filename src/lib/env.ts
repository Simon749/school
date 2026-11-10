/**
 * Central environment access. Rule: production must never silently fall back to a
 * development default (a localhost Redis, a "sandbox" SMS account, a hard-coded signing secret).
 *
 * - `requireEnv(name)`      → value, or throws a clear error (any environment).
 * - `envOr(name, devValue)` → value; if missing, returns `devValue` ONLY outside production.
 *
 * `next build` imports route modules without runtime secrets present, so the build phase is
 * deliberately not treated as production. The check happens on the running server/worker.
 */

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production' && !isBuildPhase();
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function envOr(name: string, devValue: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProduction()) {
    throw new Error(`Missing required environment variable in production: ${name}`);
  }
  return devValue;
}

/** Public base URL of this deployment, without trailing slash (used for provider callbacks). */
export function getAppUrl(): string {
  return requireEnv('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '');
}
