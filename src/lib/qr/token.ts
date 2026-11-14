import crypto from 'crypto';
import { envOr } from '@/lib/env';

// Resolved lazily so `next build` works without runtime secrets, but a production server
// without QR_TOKEN_SECRET fails loudly on first use instead of signing with a known string.
function secret(): string {
  return envOr('QR_TOKEN_SECRET', 'dev-only-change-me');
}

export function generateQrToken(slotId: string, date: string): string {
  const random = crypto.randomBytes(8).toString('hex');
  const payload = `${slotId}:${date}:${random}`;
  const hmac = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}:${hmac}`;
}

export function verifyQrToken(token: string): { slotId: string; date: string; valid: boolean } {
  const parts = token.split(':');
  if (parts.length !== 4) return { slotId: '', date: '', valid: false };

  const [slotId, date, random, hmac] = parts;

  if (!hmac) throw new Error('Invalid QR token: missing HMAC');
  const a = Buffer.from(hmac);

  const payload = `${slotId}:${date}:${random}`;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

  const b = Buffer.from(expected);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!slotId || !date) throw new Error('Invalid QR token: missing slotId or date');
  return { slotId, date, valid };
}
