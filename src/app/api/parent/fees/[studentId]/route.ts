import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: { studentId: string } }) {
    // R1-13: Central guard migration
  const guard = await requireUser(['parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const guardian = await prisma.guardian.findFirst({
    where: { userId: user.id, studentId: params.studentId, isActive: true },
  });
  if (!guardian) return NextResponse.json({ error: 'Not your child' }, { status: 403 });

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });

    const [studentFees, payments, activities] = await Promise.all([
    prisma.studentFee.findMany({
      where: { schoolId: user.schoolId, studentId: params.studentId, termId: currentTerm?.id }, // ➕ R5-04
      include: { feeItem: true },
      orderBy: { feeItem: { priorityOrder: 'asc' } },
    }),
    prisma.feePayment.findMany({
      where: { schoolId: user.schoolId, studentId: params.studentId, isReversed: false }, // ➕ R5-04
      orderBy: { paidAt: 'desc' },
      take: 20,
    }),
    prisma.studentActivity.findMany({
      where: { schoolId: user.schoolId, studentId: params.studentId, termId: currentTerm?.id }, // ➕ R5-04
      include: { activity: true },
    }),
  ]);

  const totalDue = studentFees.reduce(
    (sum: number, f) =>
      sum + Number(f.amountDue) - Number(f.discount) + Number(f.carryForwardAmount),
    0
  );
  const totalPaid = payments.reduce((sum: number, p) => sum + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  const breakdown = studentFees.map((sf) => {
    const itemPaid = payments
      .flatMap((p) => (p.allocations as any[]) || [])
      .filter((a) => a?.feeItemId === sf.feeItemId)
      .reduce((s, a) => s + (a?.amountAllocated || 0), 0);

    return {
      item: sf.feeItem.name,
      due: Number(sf.amountDue) - Number(sf.discount) + Number(sf.carryForwardAmount),
      paid: itemPaid,
      balance: Math.max(
        0,
        Number(sf.amountDue) - Number(sf.discount) + Number(sf.carryForwardAmount) - itemPaid
      ),
      mandatory: sf.feeItem.isMandatory,
    };
  });

  return NextResponse.json({
    studentId: params.studentId,
    term: currentTerm?.name,
    totalDue,
    totalPaid,
    balance,
    breakdown,
    recentPayments: payments.map((p) => ({
      date: p.paidAt,
      amount: p.amount,
      method: p.paymentMethod,
      receipt: p.receiptNumber,
      mpesaCode: p.mpesaCode,
    })),
    activities: activities.map((a) => ({ name: a.activity.name, fee: a.activity.feePerTerm })),
  });
}
