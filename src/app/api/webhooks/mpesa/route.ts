import { NextRequest, NextResponse } from 'next/server';
import { mpesaQueue } from '@/lib/queue';

/**
 * MPesa callback endpoint. Must be publicly accessible but protected by a secret token.
 * We immediately enqueue to BullMQ and return 200 — never do DB work here.
 * Safaricom will retry if we don't return 200 within 20s.
 */
export async function POST(req: NextRequest) {
  // R3-04: Secret-path token check
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (token !== process.env.MPESA_CALLBACK_SECRET) {
    console.error('MPesa callback rejected: invalid or missing secret token');
    // Return 403. Safaricom will retry, but it will keep failing until the URL is fixed in the Daraja portal.
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Unauthorized' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid JSON' }, { status: 400 });
  }

  const callback = body.Body?.stkCallback;
  if (!callback) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing stkCallback' }, { status: 400 });
  }

  // PAY-02: Basic IP allowlist check (Safaricom production ranges)
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const clientIp = forwarded.split(',')[0]?.trim() ?? 'unknown';
  const allowedRanges = ['196.201.214.', '196.201.215.', '196.201.213.']; // Update per latest Safaricom docs

  const isAllowed =
    process.env.MPESA_ENV === 'production'
      ? allowedRanges.some((r) => clientIp.startsWith(r))
      : true; // Lenient in sandbox

  if (!isAllowed) {
    console.warn(`MPesa callback from unauthorized IP: ${clientIp}`);
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Forbidden IP' }, { status: 403 });
  }

  // Enqueue to BullMQ
  await mpesaQueue.add(
    'mpesa-callback',
    {
      merchantRequestId: callback.MerchantRequestID,
      checkoutRequestId: callback.CheckoutRequestID,
      resultCode: callback.ResultCode,
      resultDesc: callback.ResultDescription,
      callbackMetadata: callback.CallbackMetadata,
      sourceIp: clientIp,
    },
    {
      jobId: `mpesa-callback-${callback.CheckoutRequestID}`, // Idempotency: same checkout ID = same job
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );

  // Safaricom expects exactly this shape for success
  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
