"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  Clock,
  Receipt,
  Smartphone,
  Calendar,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

type FeeItem = {
  id: string;
  name: string;
  amountDue: number;
  amountPaid: number;
  balance: number;
  isMandatory: boolean;
  dueDate?: string;
};

type Payment = {
  id: string;
  amount: number;
  paymentMethod: string;
  mpesaCode: string | null;
  paidAt: string;
  receiptNumber: string;
  feeItemId?: string;
};

type ChildFees = {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  stream: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  progress: number;
  feeItems: FeeItem[];
  payments: Payment[];
  paymentHistory: { month: string; amount: number }[];
};

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];

export default function ParentFeesPage() {
  const { user } = useUser();
  const [children, setChildren] = useState<ChildFees[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with actual API call
    setTimeout(() => {
      const mockData: ChildFees[] = [
        {
          studentId: "1",
          firstName: "Njeri",
          lastName: "Ochieng",
          grade: "Grade 3",
          stream: "B",
          totalDue: 45000,
          totalPaid: 30000,
          balance: 15000,
          progress: 67,
          feeItems: [
            { id: "f1", name: "Tuition Fee", amountDue: 30000, amountPaid: 30000, balance: 0, isMandatory: true },
            { id: "f2", name: "Lunch Fee", amountDue: 10000, amountPaid: 0, balance: 10000, isMandatory: true, dueDate: "2026-09-15" },
            { id: "f3", name: "Swimming Club", amountDue: 5000, amountPaid: 0, balance: 5000, isMandatory: false },
          ],
          payments: [
            { id: "p1", amount: 30000, paymentMethod: "mpesa", mpesaCode: "RKT84H29L1", paidAt: "2026-08-15T10:30:00Z", receiptNumber: "REC-001", feeItemId: "f1" },
          ],
          paymentHistory: [
            { month: "Jan", amount: 15000 },
            { month: "Feb", amount: 0 },
            { month: "Mar", amount: 10000 },
            { month: "Apr", amount: 0 },
            { month: "May", amount: 5000 },
            { month: "Jun", amount: 0 },
            { month: "Jul", amount: 0 },
            { month: "Aug", amount: 30000 },
          ],
        },
      ];
      setChildren(mockData);
      if (mockData[0]) setSelectedChildId(mockData[0].studentId);
      setLoading(false);
    }, 600);
  }, []);

  const selectedChild = children.find((c) => c.studentId === selectedChildId) || children[0];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!selectedChild) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">No children found.</p>
      </div>
    );
  }

  const overduePayments = selectedChild.feeItems.filter(
    (item) => item.balance > 0 && item.dueDate && new Date(item.dueDate) < new Date()
  );

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Fee Management</h1>
          <p className="text-sm text-slate-500 mt-1">Track payments, balances, and payment history</p>
        </div>
        {children.length > 1 && (
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            {children.map((c) => (
              <option key={c.studentId} value={c.studentId}>
                {c.firstName} {c.lastName} - {c.grade} {c.stream}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-rose-500 to-rose-700 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                <span className="text-sm font-medium">Outstanding Balance</span>
              </div>
              <AlertCircle className="h-5 w-5 text-white/80" />
            </div>
            <p className="text-3xl font-bold mb-2">{formatCurrency(selectedChild.balance)}</p>
            <p className="text-sm text-white/80">Due by end of term</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Total Paid</span>
              </div>
              <TrendingUp className="h-5 w-5 text-white/80" />
            </div>
            <p className="text-3xl font-bold mb-2">{formatCurrency(selectedChild.totalPaid)}</p>
            <p className="text-sm text-white/80">{selectedChild.progress}% of total fees</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-700 text-white border-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                <span className="text-sm font-medium">Total Fees</span>
              </div>
              <ArrowUpRight className="h-5 w-5 text-white/80" />
            </div>
            <p className="text-3xl font-bold mb-2">{formatCurrency(selectedChild.totalDue)}</p>
            <p className="text-sm text-white/80">Term 3, 2026</p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Alert */}
      {overduePayments.length > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 mb-1">Overdue Payments</h3>
                <p className="text-sm text-amber-800 mb-2">
                  {overduePayments.length} payment{overduePayments.length > 1 ? "s are" : " is"} past due date
                </p>
                <ul className="space-y-1">
                  {overduePayments.map((item) => (
                    <li key={item.id} className="text-sm text-amber-700">
                      • {item.name}: {formatCurrency(item.balance)} (was due {new Date(item.dueDate!).toLocaleDateString("en-KE")})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Progress Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Payment Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Paid", value: selectedChild.totalPaid },
                      { name: "Balance", value: selectedChild.balance },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                  <Tooltip formatter={(value) => value !== undefined ? formatCurrency(value as number) : ''} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm text-slate-600">Paid: {formatCurrency(selectedChild.totalPaid)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-slate-200" />
                <span className="text-sm text-slate-600">Balance: {formatCurrency(selectedChild.balance)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Payment History Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Monthly Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={selectedChild.paymentHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(value) => `${value / 1000}k`} />
                  <Tooltip formatter={(value) => value !== undefined ? formatCurrency(value as number) : ''} />
                  <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fee Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Fee Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedChild.feeItems.map((item) => {
            const itemProgress = item.amountDue > 0 ? (item.amountPaid / item.amountDue) * 100 : 0;
            const isOverdue = item.balance > 0 && item.dueDate && new Date(item.dueDate) < new Date();
            
            return (
              <div key={item.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900">{item.name}</h4>
                      {item.isMandatory ? (
                        <Badge variant="outline" className="text-xs">Mandatory</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-slate-100">Optional</Badge>
                      )}
                      {isOverdue && (
                        <Badge variant="destructive" className="text-xs">Overdue</Badge>
                      )}
                    </div>
                    {item.dueDate && (
                      <p className="text-xs text-slate-500 mt-1">
                        Due: {new Date(item.dueDate).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{formatCurrency(item.balance)}</p>
                    <p className="text-xs text-slate-500">of {formatCurrency(item.amountDue)}</p>
                  </div>
                </div>
                <Progress value={itemProgress} className="h-2" />
                <div className="flex justify-between mt-1 text-xs text-slate-500">
                  <span>Paid: {formatCurrency(item.amountPaid)}</span>
                  <span>{Math.round(itemProgress)}% complete</span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedChild.payments.length === 0 ? (
            <div className="py-8 text-center">
              <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No payments recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedChild.payments.map((payment) => (
                <div key={payment.id} className="flex items-start justify-between rounded-lg border border-slate-200 p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        {new Date(payment.paidAt).toLocaleDateString("en-KE", { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      {payment.mpesaCode && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-500 mb-1">MPesa Code:</p>
                          <p className="font-mono text-sm bg-white px-3 py-1 rounded border border-slate-200 inline-block">
                            {payment.mpesaCode}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-white text-slate-600">
                      {payment.receiptNumber}
                    </Badge>
                    <p className="text-xs text-slate-500 mt-2 capitalize">{payment.paymentMethod}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pay Now Button */}
      {selectedChild.balance > 0 && (
        <div className="sticky bottom-4 z-10">
          <Button className="w-full h-14 text-base bg-emerald-600 hover:bg-emerald-700 shadow-lg">
            <Smartphone className="mr-2 h-5 w-5" />
            Pay {formatCurrency(selectedChild.balance)} via MPesa
          </Button>
        </div>
      )}
    </div>
  );
}