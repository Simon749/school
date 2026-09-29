import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { subDays, startOfDay, endOfDay } from "date-fns";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a bursar
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { role: true, schoolId: true },
    });

    if (!user || user.role !== "bursar") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const schoolId = user.schoolId;

    // Get current term
    const currentTerm = await prisma.term.findFirst({
      where: { schoolId, isCurrent: true },
      select: { id: true, name: true },
    });

    // Get school info
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { name: true },
    });

    // Calculate total collected this term
    const totalCollectedResult = await prisma.feePayment.aggregate({
      _sum: { amount: true },
      where: {
        schoolId,
        termId: currentTerm?.id || undefined,
        isReversed: false,
      },
    });
    const totalCollected = Number(totalCollectedResult._sum.amount || 0);

    // Calculate total target (sum of all student fees for this term)
    const studentFeesResult = await prisma.studentFee.aggregate({
      _sum: { amountDue: true },
      where: {
        schoolId,
        termId: currentTerm?.id || undefined,
      },
    });
    const targetAmount = Number(studentFeesResult._sum.amountDue || 0);

    // Calculate total outstanding
    const totalOutstanding = Math.max(0, targetAmount - totalCollected);

    // Collection rate
    const collectionRate = targetAmount > 0 ? Math.round((totalCollected / targetAmount) * 100) : 0;

    // Payments today
    const today = new Date();
    const paymentsTodayResult = await prisma.feePayment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: {
        schoolId,
        paidAt: {
          gte: startOfDay(today),
          lte: endOfDay(today),
        },
        isReversed: false,
      },
    });
    const paymentsToday = paymentsTodayResult._count;
    const amountToday = Number(paymentsTodayResult._sum.amount || 0);

    // Open disputes count
    const disputesOpen = await prisma.paymentDispute.count({
      where: {
        schoolId,
        status: "open",
      },
    });

    // Count defaulters (students with balance > 0)
    // This requires calculating per-student balance
    const studentBalances = await prisma.studentFee.groupBy({
      by: ["studentId"],
      _sum: { amountDue: true },
      where: {
        schoolId,
        termId: currentTerm?.id || undefined,
      },
    });

    const paymentsByStudent = await prisma.feePayment.groupBy({
      by: ["studentId"],
      _sum: { amount: true },
      where: {
        schoolId,
        termId: currentTerm?.id || undefined,
        isReversed: false,
      },
    });

    const balanceMap = new Map<string, number>();
    studentBalances.forEach((sb) => {
      balanceMap.set(sb.studentId, Number(sb._sum.amountDue || 0));
    });

    paymentsByStudent.forEach((pb) => {
      const current = balanceMap.get(pb.studentId) || 0;
      balanceMap.set(pb.studentId, current - Number(pb._sum.amount || 0));
    });

    const defaultersCount = Array.from(balanceMap.values()).filter((b) => b > 0).length;

    // Recent payments (last 10)
    const recentPayments = await prisma.feePayment.findMany({
      where: { schoolId, isReversed: false },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            stream: { select: { name: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
      take: 10,
    });

    const formattedRecentPayments = recentPayments.map((p) => ({
      id: p.id,
      studentName: `${p.student.firstName} ${p.student.lastName}`,
      stream: p.student.stream.name,
      amount: Number(p.amount),
      method: p.paymentMethod,
      paidAt: p.paidAt.toISOString(),
      receiptNumber: p.receiptNumber,
    }));

    // Top defaulters (top 5 by balance)
    const topDefaultersData = Array.from(balanceMap.entries())
      .filter(([, balance]) => balance > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topDefaulters = await Promise.all(
      topDefaultersData.map(async ([studentId, balance]) => {
        const student = await prisma.student.findUnique({
          where: { id: studentId },
          select: {
            firstName: true,
            lastName: true,
            stream: { select: { name: true } },
            enrollmentDate: true,
          },
        });

        return {
          id: studentId,
          studentName: student ? `${student.firstName} ${student.lastName}` : "Unknown",
          stream: student?.stream.name || "Unknown",
          balance,
          daysOverdue: student
            ? Math.floor((today.getTime() - student.enrollmentDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
        };
      })
    );

    // Payment methods breakdown
    const paymentMethodsData = await prisma.feePayment.groupBy({
      by: ["paymentMethod"],
      _sum: { amount: true },
      _count: true,
      where: {
        schoolId,
        termId: currentTerm?.id || undefined,
        isReversed: false,
      },
    });

    const totalByAllMethods = paymentMethodsData.reduce((sum, pm) => sum + Number(pm._sum.amount || 0), 0);

    const paymentMethods = paymentMethodsData.map((pm) => ({
      method: pm.paymentMethod,
      amount: Number(pm._sum.amount || 0),
      count: pm._count,
      percentage: totalByAllMethods > 0 ? Math.round((Number(pm._sum.amount || 0) / totalByAllMethods) * 100) : 0,
    }));

    // Daily collections (last 7 days)
    const dailyCollections: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(today, i);
      const dayResult = await prisma.feePayment.aggregate({
        _sum: { amount: true },
        where: {
          schoolId,
          paidAt: {
            gte: startOfDay(date),
            lte: endOfDay(date),
          },
          isReversed: false,
        },
      });

      dailyCollections.push({
        date: date.toISOString(),
        dayLabel: date.toLocaleDateString("en-KE", { weekday: "short" }),
        amount: Number(dayResult._sum.amount || 0),
      });
    }

    // Fee structure summary
    const feeItems = await prisma.feeItem.findMany({
      where: {
        feeStructure: {
          schoolId,
          termId: currentTerm?.id || undefined,
        },
      },
      select: {
        amount: true,
        isMandatory: true,
        isOptionalActivity: true,
      },
    });

    const mandatoryTotal = feeItems
      .filter((item) => item.isMandatory)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const optionalTotal = feeItems
      .filter((item) => item.isOptionalActivity)
      .reduce((sum, item) => sum + Number(item.amount), 0);

    const dashboardData = {
      school: {
        name: school?.name || "Unknown School",
        term: currentTerm?.name || null,
      },
      generatedAt: new Date().toISOString(),
      summary: {
        totalCollected,
        totalOutstanding,
        targetAmount,
        collectionRate,
        defaultersCount,
        paymentsToday,
        amountToday,
        disputesOpen,
      },
      recentPayments: formattedRecentPayments,
      topDefaulters,
      paymentMethods,
      dailyCollections,
      feeStructureSummary: {
        mandatoryTotal,
        optionalTotal,
        itemsCount: feeItems.length,
      },
    };

    return NextResponse.json(dashboardData);
  } catch (error) {
    console.error("Bursar dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to load bursar dashboard" },
      { status: 500 }
    );
  }
}