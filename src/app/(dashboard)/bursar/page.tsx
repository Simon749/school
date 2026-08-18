"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, FileText, ShieldAlert, Users, AlertTriangle } from "lucide-react";

export default function BursarDashboard() {
  const [stats, setStats] = useState({ defaulters: 0, totalOwed: 0, paymentsToday: 0 });

  useEffect(() => {
    Promise.all([
      fetch("/api/fees/defaulters").then((r) => r.json()),
      fetch("/api/fees/payments?from=" + new Date().toISOString().split("T")[0]).then((r) => r.json()),
    ]).then(([defData, payData]) => {
      setStats({
        defaulters: defData.defaulters?.length || 0,
        totalOwed: defData.defaulters?.reduce((s: number, d: { balance: number }) => s + d.balance, 0) || 0,
        paymentsToday: payData.payments?.length || 0,
      });
    });
  }, []);

  const cards = [
    { label: "Defaulters", value: stats.defaulters, icon: AlertTriangle, href: "/bursar/reports", color: "text-red-600" },
    { label: "Total Owed", value: `KES ${stats.totalOwed.toLocaleString()}`, icon: CreditCard, href: "/bursar/reports", color: "text-amber-600" },
    { label: "Payments Today", value: stats.paymentsToday, icon: Users, href: "/bursar/fees/payments", color: "text-green-600" },
  ];

  const links = [
    { label: "Fee Structure", href: "/bursar/fees/structure", icon: FileText },
    { label: "Record Payment", href: "/bursar/fees/payments", icon: CreditCard },
    { label: "Disputes", href: "/bursar/fees/disputes", icon: ShieldAlert },
    { label: "Defaulters Report", href: "/bursar/reports", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Bursar Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <c.icon className={`h-8 w-8 ${c.color}`} />
              <div>
                <p className="text-sm text-gray-500">{c.label}</p>
                <p className="text-xl font-semibold">{c.value}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 rounded-lg border bg-white p-4 hover:bg-gray-50">
            <l.icon className="h-5 w-5 text-blue-600" />
            <span className="font-medium">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
