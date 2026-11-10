import { describe, expect, it, vi } from 'vitest';
import { envOr, getAppUrl, isProduction, requireEnv } from '@/lib/env';

describe('env helpers', () => {
  it('requireEnv throws a clear error for missing or blank values', () => {
    vi.stubEnv('SOME_SECRET', '');
    expect(() => requireEnv('SOME_SECRET')).toThrow(
      'Missing required environment variable: SOME_SECRET'
    );
    vi.stubEnv('SOME_SECRET', '   ');
    expect(() => requireEnv('SOME_SECRET')).toThrow(/SOME_SECRET/);
  });

  it('envOr uses the dev default outside production only', () => {
    vi.stubEnv('SOME_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(envOr('SOME_URL', 'redis://localhost:6379')).toBe('redis://localhost:6379');

    vi.stubEnv('NODE_ENV', 'production');
    expect(() => envOr('SOME_URL', 'redis://localhost:6379')).toThrow(/SOME_URL/);
  });

  it('does not treat `next build` as production, so builds work without runtime secrets', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('SOME_URL', '');
    expect(isProduction()).toBe(false);
    expect(envOr('SOME_URL', 'fallback')).toBe('fallback');
  });

  it('envOr prefers a real value everywhere', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SOME_URL', 'rediss://real');
    expect(envOr('SOME_URL', 'fallback')).toBe('rediss://real');
  });

  it('getAppUrl requires the variable and strips trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(() => getAppUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.co.ke//');
    expect(getAppUrl()).toBe('https://app.example.co.ke');
  });
});
