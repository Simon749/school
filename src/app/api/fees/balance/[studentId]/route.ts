import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

interface UserData {
  id: string;
  schoolId: string;
  role: string;
}

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
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = (await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  })) as UserData | null;
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Ownership check for parents
  if (user.role === "parent") {
    const link = await prisma.guardian.findFirst({
      where: { userId: user.id, studentId: params.studentId, isActive: true },
    });
    if (!link) return NextResponse.json({ error: "Not your child" }, { status: 403 });
  }

  const [fees, payments] = await Promise.all([
    prisma.studentFee.findMany({
      where: { studentId: params.studentId },
      include: { feeItem: true, term: true },
    }) as Promise<StudentFeeData[]>,
    prisma.feePayment.findMany({
      where: { studentId: params.studentId, isReversed: false },
    }) as Promise<FeePaymentData[]>,
  ]);

  const totalDue = fees.reduce((sum: number, f: StudentFeeData) => sum + Number(f.amountDue) - Number(f.discount) + Number(f.carryForwardAmount), 0);
  const totalPaid = payments.reduce((sum: number, p: FeePaymentData) => sum + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  return NextResponse.json<BalanceResponse>({
    totalDue,
    totalPaid,
    balance,
    items: fees.map((f: StudentFeeData) => ({
      name: f.feeItem.name,
      due: Number(f.amountDue) - Number(f.discount),
      paid: payments
        .flatMap((p: FeePaymentData) => (p.allocations as FeeAllocation[]) || [])
        .filter((a: FeeAllocation) => a?.feeItemId === f.feeItemId)
        .reduce((s: number, a: FeeAllocation) => s + (a?.amountAllocated || 0), 0),
    })),
  });
}