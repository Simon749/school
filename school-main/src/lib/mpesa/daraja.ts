import { redis } from "@/lib/redis";

type Env = "sandbox" | "production";

const BASE_URLS: Record<Env, string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

const env: Env = (process.env.MPESA_ENV as Env) || "sandbox";
const BASE = BASE_URLS[env];

/**
 * Get OAuth access token from Daraja. Cached in Redis for 55 minutes
 * (tokens expire at 3600s, we refresh early).
 */
export async function getDarajaToken(): Promise<string> {
  const cacheKey = "daraja:access_token";
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET required");
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Daraja auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Daraja auth response missing token: ${JSON.stringify(data)}`);
  }

  // Cache for 3300s (55 min) to avoid edge-case expiry
  await redis.setex(cacheKey, 3300, data.access_token);
  return data.access_token;
}

/**
 * Initiate STK Push (Lipa Na M-Pesa Online).
 */
export async function stkPush(args: {
  phone: string;           // 2547XXXXXXXX
  amount: number;
  accountReference: string; // max 12 chars on prod
  transactionDesc: string;  // max 13 chars on prod
  callbackUrl: string;
}) {
  const token = await getDarajaToken();
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  if (!shortcode || !passkey) throw new Error("MPESA_SHORTCODE and MPESA_PASSKEY required");

  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

  // Normalize phone to 254XXXXXXXXX
  let normalizedPhone = args.phone.replace(/\D/g, "");
  if (normalizedPhone.startsWith("0")) {
    normalizedPhone = "254" + normalizedPhone.slice(1);
  }
  if (!normalizedPhone.startsWith("254")) {
    normalizedPhone = "254" + normalizedPhone;
  }

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(args.amount), // Daraja requires integers
    PartyA: normalizedPhone,
    PartyB: shortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: args.callbackUrl,
    AccountReference: args.accountReference.slice(0, 12),
    TransactionDesc: args.transactionDesc.slice(0, 13),
  };

  const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.errorCode) {
    throw new Error(`STK Push failed: ${data.errorMessage || JSON.stringify(data)}`);
  }

  return data as {
    MerchantRequestID: string;
    CheckoutRequestID: string;
    ResponseCode: string;
    ResponseDescription: string;
    CustomerMessage: string;
  };
}

/**
 * Query the status of an STK Push transaction.
 * Used for dispute resolution and recovery when callback is missed.
 */
export async function queryStkStatus(checkoutRequestId: string) {
  const token = await getDarajaToken();
  const shortcode = process.env.MPESA_SHORTCODE!;
  const passkey = process.env.MPESA_PASSKEY!;
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

  const res = await fetch(`${BASE}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  return res.json();
}

/**
 * C2B Validation & Confirmation simulation helpers (for sandbox testing).
 */
export async function registerC2BUrls(validationUrl: string, confirmationUrl: string) {
  const token = await getDarajaToken();
  const shortcode = process.env.MPESA_SHORTCODE;

  const res = await fetch(`${BASE}/mpesa/c2b/v1/registerurl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ShortCode: shortcode,
      ResponseType: "Completed",
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl,
    }),
  });

  return res.json();
}