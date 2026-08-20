import { useUser } from "@clerk/nextjs";

"use client";

export default function DashboardPage() {
  const { user } = useUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user?.firstName || "Admin"}
        </h1>
        <p className="text-slate-500">
          EduTrack Kenya dashboard — Phase 0 skeleton. Real widgets coming in Phase 1.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Students", value: "—", color: "bg-blue-50 text-blue-700" },
          { label: "Teachers", value: "—", color: "bg-emerald-50 text-emerald-700" },
          { label: "Today's Attendance", value: "—", color: "bg-amber-50 text-amber-700" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className={`mt-2 inline-flex rounded-lg px-3 py-1 text-2xl font-bold ${card.color}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}