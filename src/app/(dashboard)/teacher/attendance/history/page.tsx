"use client";

import { useEffect, useState } from "react";
import { Clock, Users, CheckCircle } from "lucide-react";

interface HistoryRecord {
  id: string;
  date: string;
  status: string;
  minutesLate: number | null;
  checkedInAt: string | null;
  lessonNotes: string | null;
  learningArea: string | null;
  stream: string | null;
  period: string | null;
}

interface HistoryData {
  summary: { present: number; late: number; covered: number };
  records: HistoryRecord[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  present: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Present" },
  late: { bg: "bg-amber-50", text: "text-amber-700", label: "Late" },
  covered: { bg: "bg-slate-100", text: "text-slate-600", label: "Covered" },
  absent: { bg: "bg-red-50", text: "text-red-700", label: "Absent" },
};

export default function TeacherAttendanceHistoryPage() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/attendance/teacher/history?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your Check-In History</h1>
          <p className="mt-1 text-sm text-slate-500">
            Only lessons you actually checked into appear here
          </p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading...</div>
      ) : !data || data.records.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          No check-ins recorded in this period.
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-3">
            <div className="flex-1 rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-lg font-bold text-emerald-700">{data.summary.present}</p>
              <p className="text-xs text-emerald-600">On time</p>
            </div>
            <div className="flex-1 rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-lg font-bold text-amber-700">{data.summary.late}</p>
              <p className="text-xs text-amber-600">Late</p>
            </div>
            <div className="flex-1 rounded-lg bg-slate-100 p-3 text-center">
              <p className="text-lg font-bold text-slate-700">{data.summary.covered}</p>
              <p className="text-xs text-slate-500">Covered</p>
            </div>
          </div>

          <div className="space-y-2">
            {data.records.map((r) => {
              const cfg = STATUS_STYLES[r.status] || STATUS_STYLES.present;
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                    <CheckCircle className={`h-4 w-4 ${cfg.text}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{r.learningArea || "Lesson"}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                        {r.status === "late" && r.minutesLate ? ` · ${r.minutesLate}m` : ""}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{r.date}</span>
                      {r.period && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {r.period}
                        </span>
                      )}
                      {r.stream && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" /> {r.stream}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}