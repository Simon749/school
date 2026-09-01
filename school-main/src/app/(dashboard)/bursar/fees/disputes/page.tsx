"use client";

import { useEffect, useState } from "react";

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/fees/disputes").then((r) => r.json()).then((d) => setDisputes(d.disputes || []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Payment Disputes</h1>
      <div className="rounded-xl border bg-white divide-y">
        {disputes.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No disputes</p>
        ) : disputes.map((d) => (
          <div key={d.id} className="p-4 flex flex-wrap justify-between gap-2">
            <div>
              <p className="font-medium">{d.student?.firstName} {d.student?.lastName}</p>
              <p className="text-sm text-gray-500">Raised by {d.raisedByName}</p>
              <p className="text-sm">MPesa: {d.mpesaCodeClaimed} · KES {Number(d.amountClaimed || 0).toLocaleString()}</p>
            </div>
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              d.status === "resolved" ? "bg-green-100 text-green-700" :
              d.status === "open" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"
            }`}>{d.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
