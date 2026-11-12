import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import { add, subtract, toNumber } from '@/lib/money/decimal';

interface FeeAllocation {
  feeItemId?: string;
  amountAllocated?: number | string;
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

  let totalDue = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);

  const items: FeeItem[] = fees.map((f) => {
    const due = add(
      subtract(new Prisma.Decimal(f.amountDue), new Prisma.Decimal(f.discount)),
      new Prisma.Decimal(f.carryForwardAmount)
    );
    totalDue = add(totalDue, due);

    const paidForItem = payments.reduce((sum, p) => {
      const allocations = (p.allocations as FeeAllocation[]) || [];
      const allocated = allocations.find((a) => a.feeItemId === f.feeItemId);
      if (allocated) {
        return add(sum, new Prisma.Decimal(allocated.amountAllocated || 0));
      }
      return sum;
    }, new Prisma.Decimal(0));

    totalPaid = add(totalPaid, paidForItem);

    return {
      name: f.feeItem.name,
      due: toNumber(due),
      paid: toNumber(paidForItem),
    };
  });

  const balance = subtract(totalDue, totalPaid);

  return NextResponse.json<BalanceResponse>({
    totalDue: toNumber(totalDue),
    totalPaid: toNumber(totalPaid),
    balance: toNumber(balance),
    items,
  });
}