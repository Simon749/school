"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

type Child = {
  student: { id: string; firstName: string; lastName: string; stream: { grade: { name: string }; name: string } };
  daily: { status: string; arrivedAt: string } | null;
  lessons: { status: string; absenceReason: string | null; slot: { learningArea: { name: string } } }[];
};

export default function ParentDashboard() {
  const { user } = useUser();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/parent/children")
      .then((r) => r.json())
      .then((d) => {
        const list = d.children || [];
        setChildren(list);
        if (list[0]) setSelectedId(list[0].student.id);
        setLoading(false);
      });
  }, []);

  const selected = children.find((c) => c.student.id === selectedId) || children[0];

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-xl font-bold">Good afternoon, {user?.firstName}</h1>
        {children.length > 1 && (
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
            className="mt-2 w-full rounded-lg border px-3 py-2 text-sm">
            {children.map((c) => (
              <option key={c.student.id} value={c.student.id}>
                {c.student.firstName} {c.student.lastName}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected && (
        <div className="rounded-xl border bg-white p-4 space-y-3 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-semibold text-lg">{selected.student.firstName} {selected.student.lastName}</h2>
              <p className="text-sm text-gray-500">{selected.student.stream.grade.name} {selected.student.stream.name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-500">Arrival</p>
              <p className="font-medium">
                {selected.daily?.arrivedAt
                  ? new Date(selected.daily.arrivedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : "Not arrived"}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-500">Lessons</p>
              <p className="font-medium">
                {selected.lessons.filter((l) => l.status === "present").length}/{selected.lessons.length} present
              </p>
            </div>
          </div>

          {selected.lessons.filter((l) => l.status === "absent").length > 0 && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              Absent: {selected.lessons.filter((l) => l.status === "absent").map((l) =>
                `${l.slot.learningArea.name}${l.absenceReason ? ` (${l.absenceReason})` : ""}`
              ).join(", ")}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Link href={`/parent/attendance?studentId=${selected.student.id}`}
              className="flex-1 rounded-lg border py-2 text-center text-sm font-medium hover:bg-gray-50">
              Attendance
            </Link>
            <Link href={`/parent/fees?studentId=${selected.student.id}`}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-center text-sm font-medium text-white hover:bg-blue-700">
              Fees
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
