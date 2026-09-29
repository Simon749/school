import crypto from "crypto";

const SECRET = process.env.QR_TOKEN_SECRET || "dev-only-change-me";

export function generateQrToken(slotId: string, date: string): string {
  const random = crypto.randomBytes(8).toString("hex");
  const payload = `${slotId}:${date}:${random}`;
  const hmac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}:${hmac}`;
}

export function verifyQrToken(token: string): { slotId: string; date: string; valid: boolean } {
  const parts = token.split(":");
  if (parts.length !== 4) return { slotId: "", date: "", valid: false };

  const [slotId, date, random, hmac] = parts;
  const payload = `${slotId}:${date}:${random}`;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

  return { slotId, date, valid: hmac === expected };
}