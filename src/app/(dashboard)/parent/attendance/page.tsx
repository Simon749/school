"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function ParentAttendancePage() {
  const params = useSearchParams();
  const [children, setChildren] = useState<any[]>([]);
  const [studentId, setStudentId] = useState(params.get("studentId") || "");
  const [history, setHistory] = useState<{ date: string; lessons: any[]; daily: any }[]>([]);

  useEffect(() => {
    fetch("/api/parent/children").then((r) => r.json()).then((d) => {
      setChildren(d.children || []);
      if (!studentId && d.children?.[0]) setStudentId(d.children[0].student.id);
    });
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    const days: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split("T")[0]);
    }
    Promise.all(
      days.map((date) =>
        fetch(`/api/attendance/parent/${studentId}?date=${date}`).then((r) => r.json()).then((d) => ({ date, ...d }))
      )
    ).then(setHistory);
  }, [studentId]);

  function dayColor(day: { lessons: any[] }) {
    if (!day.lessons?.length) return "bg-gray-100";
    const absent = day.lessons.filter((l) => l.status === "absent").length;
    if (absent === 0) return "bg-green-100 border-green-300";
    if (absent === day.lessons.length) return "bg-red-100 border-red-300";
    return "bg-yellow-100 border-yellow-300";
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Attendance History</h1>

      {children.length > 1 && (
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
          {children.map((c) => (
            <option key={c.student.id} value={c.student.id}>{c.student.firstName} {c.student.lastName}</option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-7 gap-1">
        {history.map((day) => (
          <div key={day.date} title={day.date} className={`aspect-square rounded border text-center flex flex-col items-center justify-center text-xs ${dayColor(day)}`}>
            <span>{new Date(day.date).getDate()}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {history.filter((d) => d.lessons?.length).slice(0, 5).map((day) => (
          <div key={day.date} className="rounded-lg border bg-white p-3 text-sm">
            <p className="font-medium mb-1">{new Date(day.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}</p>
            {day.lessons.map((l: any) => (
              <div key={l.id} className="flex justify-between py-0.5">
                <span>{l.slot?.learningArea?.name}</span>
                <span className={l.status === "present" ? "text-green-600" : "text-red-600"}>{l.status}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
