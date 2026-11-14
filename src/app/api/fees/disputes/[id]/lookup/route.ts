import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';

// Note: Replace this import with your actual Daraja query function when ready
// import { queryMpesaTransaction } from '@/lib/mpesa/transaction-query';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // 1. Role gating: Only bursar or admin can perform Daraja lookups
  const guard = await requireUser(['bursar', 'admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  // 2. School-scoped fetch
  const dispute = await prisma.paymentDispute.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    select: { id: true, mpesaCodeClaimed: true, status: true },
  });

  if (!dispute) {
    return NextResponse.json({ error: 'Dispute not found or not in your school' }, { status: 404 });
  }

  if (dispute.status === 'resolved' || dispute.status === 'rejected') {
    return NextResponse.json({ error: 'Cannot lookup a closed dispute' }, { status: 400 });
  }

  // 3. Perform Daraja Lookup (stubbed until lib/mpesa/transaction-query is implemented)
  let lookupResult: any = {
    error: 'Daraja lookup not yet implemented',
    mpesaCode: dispute.mpesaCodeClaimed,
  };

  try {
    // When ready, uncomment:
    // lookupResult = await queryMpesaTransaction(dispute.mpesaCodeClaimed);
    console.log(`[DisputeLookup] Would query Daraja for code: ${dispute.mpesaCodeClaimed}`);
  } catch (err) {
    console.error('Daraja lookup failed:', err);
    lookupResult = { error: 'Lookup failed', mpesaCode: dispute.mpesaCodeClaimed };
  }

  const auditMeta = getRequestMetadata(req);

  // 4. Atomic update + audit
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.paymentDispute.update({
      where: { id: params.id },
      data: {
        darajaLookupResult: lookupResult,
        status: dispute.status === 'open' ? 'investigating' : dispute.status, // Auto-transition open → investigating
      },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'PAYMENT_DISPUTE_DARAJA_LOOKUP',
        tableName: 'payment_disputes',
        recordId: params.id,
        newData: { mpesaCode: dispute.mpesaCodeClaimed, lookupPerformed: true },
        ipAddress: auditMeta.ipAddress,
        userAgent: auditMeta.userAgent,
      },
      tx
    );

    return result;
  });

  return NextResponse.json(
    { success: true, dispute: updated, lookup: lookupResult },
    { status: 200 }
  );
}
