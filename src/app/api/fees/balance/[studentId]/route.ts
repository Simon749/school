import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';

interface FeeAllocation {
  feeItemId?: string;
  amountAllocated?: number;
}

interface FeePaymentData {
  amount: string | number;
  allocations?: FeeAllocation[];
}

interface StudentFeeData {
  feeItemId: string;
  amountDue: string | number;
  discount: string | number;
  carryForwardAmount: string | number;
  feeItem: {
    name: string;
  };
}

interface FeeItem {
  name: string;
  due: number;
  paid: number;
}

interface BalanceResponse {
  totalDue: number;
  totalPaid: number;
  balance: number;
  items: FeeItem[];
}

export async function GET(
  _req: Request,
  { params }: { params: { studentId: string } }
): Promise<NextResponse<BalanceResponse | { error: string }>> {
  // SEC-05: admin and bursar see any student in their own school; a parent only their own
  // active child; every other role is refused. (Unchanged for now: the arithmetic below is one
  // of several divergent balance calculations — PAY-07/PAY-15, replaced by a single ledger in R3.)
  const guard = await requireUser(['admin', 'bursar', 'parent']);
  if (!guard.ok) return guard.response as NextResponse<{ error: string }>;
  const { user } = guard;

  const notFound = () => NextResponse.json({ error: 'Student not found' }, { status: 404 });

  if (user.role === 'parent') {
    const link = await prisma.guardian.findFirst({
      where: { userId: user.id, studentId: params.studentId, isActive: true },
      select: { id: true },
    });
    if (!link) return notFound();
  } else {
    const student = await prisma.student.findFirst({
      where: { id: params.studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!student) return notFound();
  }

  const [fees, payments] = await Promise.all([
    prisma.studentFee.findMany({
      where: { studentId: params.studentId, schoolId: user.schoolId },
      include: { feeItem: true },
    }),
    prisma.feePayment.findMany({
      where: { studentId: params.studentId, schoolId: user.schoolId, isReversed: false },
    }),
  ]);

  const totalDue = fees.reduce(
    (sum, f) => sum + Number(f.amountDue) - Number(f.discount) + Number(f.carryForwardAmount),
    0
  );
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  return NextResponse.json<BalanceResponse>({
    totalDue,
    totalPaid,
    balance,
    items: fees.map((f) => ({
      name: f.feeItem.name,
      due: Number(f.amountDue) - Number(f.discount),
      paid: payments
        .flatMap((p) => (p.allocations as FeeAllocation[]) || [])
        .filter((a: FeeAllocation) => a?.feeItemId === f.feeItemId)
        .reduce((s: number, a: FeeAllocation) => s + (a?.amountAllocated || 0), 0),
    })),
  });
}
