"use client";

import { useEffect, useState } from "react";

export default function BursarPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({ studentId: "", amount: "", paymentMethod: "cash", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/fees/payments").then((r) => r.json()).then((d) => setPayments(d.payments || []));
    fetch("/api/students?limit=200").then((r) => r.json()).then((d) => setStudents(d.students || []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/fees/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: form.studentId,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        reference: form.reference,
        notes: form.notes,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setPayments((p) => [d.payment, ...p]);
      setForm({ studentId: "", amount: "", paymentMethod: "cash", reference: "", notes: "" });
      alert("Payment recorded");
    } else {
      const err = await res.json();
      alert(err.error || "Failed");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Record Payment</h1>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 grid gap-4 sm:grid-cols-2 max-w-2xl">
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Student</label>
          <select required value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">Select student</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Amount (KES)</label>
          <input required type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Method</label>
          <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
            <option value="mpesa">MPesa (manual)</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Reference</label>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium">Notes</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "Record payment"}
          </button>
        </div>
      </form>

      <div className="rounded-xl border bg-white overflow-hidden">
        <h2 className="p-4 font-semibold border-b">Recent payments</h2>
        <div className="divide-y">
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between p-4 text-sm">
              <span>{p.student?.firstName} {p.student?.lastName}</span>
              <span className="font-medium">KES {Number(p.amount).toLocaleString()}</span>
              <span className="text-gray-500">{p.paymentMethod} · {p.receiptNumber}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
