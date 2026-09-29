"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Search,
  TrendingUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Validation Schema
// ---------------------------------------------------------------------------
const formSchema = z.object({
  studentId: z.string().min(1, "Please select a student"),
  amount: z.coerce.number().min(1, "Amount must be at least 1"),
  paymentMethod: z.enum(["cash", "bank", "cheque", "mpesa"]),
  mpesaCode: z.string().optional(), // e.g., RGH7483920
  reference: z.string().optional(), // Bank ref or cheque number
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Student = { id: string; firstName: string; lastName: string; stream: { name: string; grade: { name: string } }; balance?: number };
type Payment = {
  id: string;
  student: { firstName: string; lastName: string; stream: { name: string } };
  amount: number;
  paymentMethod: string;
  mpesaCode?: string | null;
  receiptNumber: string;
  paidAt: string;
};

export default function BursarPaymentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      studentId: "",
      amount: 0,
      paymentMethod: "mpesa",
      mpesaCode: "",
      reference: "",
      notes: "",
    },
  });

  const selectedStudentId = form.watch("studentId");
  const paymentMethod = form.watch("paymentMethod");
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadData() {
      try {
        const [studentsRes, paymentsRes] = await Promise.all([
          fetch("/api/students?limit=500"), // Fetch more for the search
          fetch("/api/fees/payments"),
        ]);
        const studentsData = await studentsRes.json();
        const paymentsData = await paymentsRes.json();

        setStudents(studentsData.students || []);
        setPayments(paymentsData.payments || []);
      } catch (error) {
        console.error("Failed to load payments data", error);
      }
    }
    loadData();
  }, []);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  async function onSubmit(data: FormData) {
    setSaving(true);
    try {
      const res = await fetch("/api/fees/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to record payment");
      }

      const result = await res.json();
      setPayments((prev) => [result.payment, ...prev]);

      toast.success(`Payment recorded! Receipt: ${result.payment.receiptNumber}`);
      form.reset({
        studentId: "",
        amount: 0,
        mpesaCode: "",
        reference: "",
        notes: "",
        paymentMethod: "mpesa"
      });
    } catch (error: unknown) {
      toast.error(error.message || "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  const formatKes = (n: number) => `KES ${n.toLocaleString()}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const getMethodBadge = (method: string) => {
    switch (method) {
      case "mpesa": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200"><Smartphone className="mr-1 h-3 w-3" /> MPesa</Badge>;
      case "cash": return <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100 border-slate-200"><Banknote className="mr-1 h-3 w-3" /> Cash</Badge>;
      case "bank": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200"><CreditCard className="mr-1 h-3 w-3" /> Bank</Badge>;
      case "cheque": return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">Cheque</Badge>;
      default: return <Badge variant="outline">{method}</Badge>;
    }
  };

  // Filter students for the dropdown
  const filteredStudents = students.filter((s) =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.stream?.grade?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Record Payment</h1>
        <p className="text-slate-500">Log manual payments (Cash, Bank, MPesa) and update student balances.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT: Payment Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>New Payment</CardTitle>
              <CardDescription>Enter the payment details below. MPesa code is required for mobile money.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* Student Selection */}
                <div className="space-y-2">
                  <Label>Select Student</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search by name or grade (e.g. John, Grade 5)..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={form.watch("studentId")}
                    onValueChange={(val) => val && form.setValue("studentId", val)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} (${selectedStudent.stream?.grade.name} ${selectedStudent.stream?.name})` : "Select a student from the search above"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredStudents.length === 0 ? (
                        <SelectItem value="none" disabled>No students found</SelectItem>
                      ) : (
                        filteredStudents.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.firstName} {s.lastName} — {s.stream?.grade.name} {s.stream?.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.studentId && (
                    <p className="text-xs text-red-500">{form.formState.errors.studentId.message}</p>
                  )}

                  {/* Student Balance Context */}
                  {selectedStudent && (
                    <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-sm text-emerald-800 border border-emerald-100">
                      <TrendingUp className="h-4 w-4" />
                      <span>Current outstanding balance: <strong>{formatKes(selectedStudent.balance || 0)}</strong></span>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Amount */}
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      {...form.register("amount")}
                      className={form.formState.errors.amount ? "border-red-500" : ""}
                    />
                    {form.formState.errors.amount && (
                      <p className="text-xs text-red-500">{form.formState.errors.amount.message}</p>
                    )}
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(val: any) => form.setValue("paymentMethod", val)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mpesa">MPesa (Mobile Money)</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Conditional MPesa Code */}
                {paymentMethod === "mpesa" && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <Label>MPesa Transaction Code <span className="text-red-500">*</span></Label>
                    <Input
                      placeholder="e.g. RGH7483920"
                      {...form.register("mpesaCode")}
                      className="uppercase"
                    />
                    <p className="text-xs text-slate-500">Found on the MPesa confirmation SMS.</p>
                  </div>
                )}

                {/* Reference & Notes */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Reference / Cheque No.</Label>
                    <Input placeholder="Bank ref or cheque number" {...form.register("reference")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes (Optional)</Label>
                    <Input placeholder="Any additional details" {...form.register("notes")} />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                    {saving ? "Recording..." : <><CheckCircle2 className="mr-2 h-4 w-4" /> Record Payment</>}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Recent Payments */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Recent Transactions</CardTitle>
              <CardDescription>Last 10 recorded payments</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {payments.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">No payments recorded yet.</div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead className="w-[100px]">Amount</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead className="text-right">Method</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.slice(0, 15).map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono font-semibold text-emerald-700">
                            {formatKes(p.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-medium text-slate-800">
                              {p.student.firstName} {p.student.lastName}
                            </div>
                            <div className="text-xs text-slate-500">
                              {p.student.stream?.name || 'Unassigned'} • {formatDate(p.paidAt)}
                            </div>
                            {p.mpesaCode && (
                              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                                {p.mpesaCode}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {getMethodBadge(p.paymentMethod)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}