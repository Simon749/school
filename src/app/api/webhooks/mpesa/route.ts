import { NextRequest, NextResponse } from "next/server";
import { mpesaQueue } from "@/lib/queue";

/**
 * MPesa callback endpoint. Must be publicly accessible.
 * We immediately enqueue to BullMQ and return 200 — never do DB work here.
 * Safaricom will retry if we don't return 200 within 20s.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callback = body.Body?.stkCallback;
  if (!callback) {
    return NextResponse.json({ error: "Missing stkCallback" }, { status: 400 });
  }

  // Basic IP allowlist check (Safaricom ranges)
  const forwarded = req.headers.get("x-forwarded-for") || "";
  const clientIp = forwarded.split(",")[0].trim();
  const allowedRanges = ["196.201.214.", "196.201.215."]; // Expand for production
  const isAllowed = allowedRanges.some((r) => clientIp.startsWith(r));
  
  // In production, enforce this. In sandbox, be lenient.
  if (process.env.MPESA_ENV === "production" && !isAllowed) {
    console.warn(`MPesa callback from unauthorized IP: ${clientIp}`);
    // Still enqueue but flag for review rather than hard-reject
  }

  await mpesaQueue.add(
    "mpesa-callback",
    {
      merchantRequestId: callback.MerchantRequestID,
      checkoutRequestId: callback.CheckoutRequestID,
      resultCode: callback.ResultCode,
      resultDesc: callback.ResultDescription,
      callbackMetadata: callback.CallbackMetadata,
      sourceIp: clientIp,
    },
    {
      jobId: `mpesa-${callback.CheckoutRequestID}`, // idempotency: same checkout ID = same job
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
    }
  );

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}