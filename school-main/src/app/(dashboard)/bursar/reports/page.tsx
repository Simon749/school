"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";

export default function BursarReportsPage() {
  const [defaulters, setDefaulters] = useState<any[]>([]);
  const [term, setTerm] = useState("");

  useEffect(() => {
    fetch("/api/fees/defaulters").then((r) => r.json()).then((d) => {
      setDefaulters(d.defaulters || []);
      setTerm(d.term || "");
    });
  }, []);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Defaulters</h1>
          <p className="text-sm text-gray-500">{term}</p>
        </div>
        <button onClick={handlePrint} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 print:hidden">
          Export / Print PDF
        </button>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-3">Student</th>
              <th className="text-left p-3">Stream</th>
              <th className="text-right p-3">Due</th>
              <th className="text-right p-3">Paid</th>
              <th className="text-right p-3">Balance</th>
              <th className="p-3 print:hidden">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {defaulters.map((d) => (
              <tr key={d.id}>
                <td className="p-3 font-medium">{d.name}</td>
                <td className="p-3 text-gray-600">{d.stream}</td>
                <td className="p-3 text-right">KES {d.totalDue.toLocaleString()}</td>
                <td className="p-3 text-right">KES {d.totalPaid.toLocaleString()}</td>
                <td className="p-3 text-right font-semibold text-red-600">KES {d.balance.toLocaleString()}</td>
                <td className="p-3 print:hidden">
                  <button className="flex items-center gap-1 text-xs text-blue-600" title="SMS reminder (requires SMS worker)">
                    <Send className="h-3 w-3" /> Remind
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {defaulters.length === 0 && <p className="p-6 text-gray-500 text-center">No defaulters — all fees paid!</p>}
      </div>
    </div>
  );
}
