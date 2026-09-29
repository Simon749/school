import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function ParentFeesPage({
  params,
}: {
  params: { studentId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // ✅ FIX: Same Clerk ID traversal fix as the results page
  const guardian = await prisma.guardian.findFirst({
    where: { 
      user: { clerkId: userId }, 
      studentId: params.studentId, 
      isActive: true 
    },
    include: {
      student: {
        include: {
          school: {
            include: {
              terms: {
                where: { isCurrent: true },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  if (!guardian) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-red-600">Access Denied</h2>
        <p className="text-muted-foreground mt-2">
          You are not authorized to view this student's fee details.
        </p>
      </div>
    );
  }

  const currentTerm = guardian.student.school.terms[0];

  // 1. Fetch fee items and amounts due for this student in the current term
  const studentFees = await prisma.studentFee.findMany({
    where: { studentId: params.studentId, termId: currentTerm?.id },
    include: { feeItem: { select: { name: true, isMandatory: true } } },
    orderBy: { feeItem: { priorityOrder: "asc" } },
  });

  // 2. Fetch payment history
  const payments = await prisma.feePayment.findMany({
    where: { studentId: params.studentId, termId: currentTerm?.id, isReversed: false },
    orderBy: { paidAt: "desc" },
  });

  // 3. Calculate totals
  let totalDue = 0;
  let totalDiscount = 0;
  studentFees.forEach((fee) => {
    totalDue += Number(fee.amountDue);
    totalDiscount += Number(fee.discount);
  });
  const netDue = totalDue - totalDiscount;

  let totalPaid = 0;
  payments.forEach((p) => totalPaid += Number(p.amount));

  const balance = Math.max(0, netDue - totalPaid);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-KE", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{guardian.student.firstName}'s Fee Statement</h1>
        <p className="text-muted-foreground">{currentTerm?.name || "Current Term"}</p>
      </div>

      {/* Balance Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Fees</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">KES {netDue.toLocaleString()}</div>
            {totalDiscount > 0 && <p className="text-xs text-green-600">Includes KES {totalDiscount.toLocaleString()} discount</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">KES {totalPaid.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className={balance > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Current Balance</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>
              KES {balance.toLocaleString()}
            </div>
            {balance > 0 && (
              <form action="/api/fees/mpesa/stk-push" className="mt-3">
                <input type="hidden" name="studentId" value={params.studentId} />
                <input type="hidden" name="amount" value={balance} />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" size="sm">
                  Pay Balance via MPesa
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fee Breakdown */}
      <Card>
        <CardHeader><CardTitle>Fee Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {studentFees.map((fee) => {
              const due = Number(fee.amountDue) - Number(fee.discount);
              return (
                <div key={fee.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{fee.feeItem.name}</p>
                    {Number(fee.discount) > 0 && <p className="text-xs text-green-600">Discount: KES {Number(fee.discount).toLocaleString()}</p>}
                  </div>
                  <p className="font-semibold">KES {due.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No payments recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="flex justify-between items-start py-3 border-b last:border-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {payment.paymentMethod === "mpesa" ? "MPesa" : payment.paymentMethod.charAt(0).toUpperCase() + payment.paymentMethod.slice(1)}
                      </span>
                      {payment.mpesaCode && <Badge variant="outline" className="text-xs">{payment.mpesaCode}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(payment.paidAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">+ KES {Number(payment.amount).toLocaleString()}</p>
                    {payment.mpesaName && <p className="text-xs text-muted-foreground">{payment.mpesaName}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}