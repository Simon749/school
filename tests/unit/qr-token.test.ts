import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { generateQrToken, verifyQrToken } from '@/lib/qr/token';

const SLOT = '5b0d9f3e-1111-4222-8333-444455556666';
const DATE = '2026-10-26';

describe('QR token (SEC-16 regression)', () => {
  it('fails loudly in production when QR_TOKEN_SECRET is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QR_TOKEN_SECRET', '');
    expect(() => generateQrToken(SLOT, DATE)).toThrow(/QR_TOKEN_SECRET/);
    expect(() => verifyQrToken(`${SLOT}:${DATE}:abcd:sig`)).toThrow(/QR_TOKEN_SECRET/);
  });

  it('round-trips with a real secret and rejects tampering', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QR_TOKEN_SECRET', 'a-long-random-production-secret');
    const token = generateQrToken(SLOT, DATE);
    expect(verifyQrToken(token)).toMatchObject({ slotId: SLOT, date: DATE, valid: true });

    const tampered = token.replace(DATE, '2026-10-27');
    expect(verifyQrToken(tampered).valid).toBe(false);
  });

  it('rejects a token forged with the old hard-coded fallback secret', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('QR_TOKEN_SECRET', 'a-long-random-production-secret');
    const payload = `${SLOT}:${DATE}:deadbeefdeadbeef`;
    const forged = crypto
      .createHmac('sha256', 'dev-only-change-me')
      .update(payload)
      .digest('base64url');
    expect(verifyQrToken(`${payload}:${forged}`).valid).toBe(false);
  });

  it('rejects malformed tokens without throwing', () => {
    vi.stubEnv('QR_TOKEN_SECRET', 'x');
    expect(verifyQrToken('nonsense').valid).toBe(false);
    expect(verifyQrToken('a:b:c').valid).toBe(false);
    expect(verifyQrToken('a:b:c:d:e').valid).toBe(false);
  });

  it('still works in development without a secret', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('QR_TOKEN_SECRET', '');
    expect(verifyQrToken(generateQrToken(SLOT, DATE)).valid).toBe(true);
  });
});
