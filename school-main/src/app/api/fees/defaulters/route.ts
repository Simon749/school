import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!user?.schoolId || !["admin", "bursar"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: user.schoolId, isCurrent: true },
  });
  if (!currentTerm) return NextResponse.json({ defaulters: [] });

  const students = await prisma.student.findMany({
    where: { schoolId: user.schoolId, deletedAt: null, status: "active" },
    include: {
      stream: { include: { grade: true } },
      studentFees: { where: { termId: currentTerm.id }, include: { feeItem: true } },
      feePayments: { where: { termId: currentTerm.id, isReversed: false } },
    },
  });

  const defaulters = students
    .map((s) => {
      const totalDue = s.studentFees.reduce(
        (sum, f) => sum + Number(f.amountDue) - Number(f.discount) + Number(f.carryForwardAmount),
        0
      );
      const totalPaid = s.feePayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = totalDue - totalPaid;
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        stream: `${s.stream.grade.name} ${s.stream.name}`,
        totalDue,
        totalPaid,
        balance,
      };
    })
    .filter((d) => d.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  return NextResponse.json({ term: currentTerm.name, defaulters });
}
