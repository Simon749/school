"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type RegisterEntry = {
  studentId: string;
  firstName: string;
  lastName: string;
  status: "present" | "absent" | "late" | "excused" | null;
  absenceReason: string | null;
  marked: boolean;
};

export default function AttendanceRegisterPage() {
  const { slotId } = useParams();
  const router = useRouter();
  const [register, setRegister] = useState<RegisterEntry[]>([]);
  const [slot, setSlot] = useState<any>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setDate(today);
    fetch(`/api/attendance/student?slotId=${slotId}&date=${today}`)
      .then((r) => r.json())
      .then((d) => {
        setSlot(d.slot);
        setRegister(d.register);
        setIsLocked(d.isLocked ?? false);
        setLoading(false);
      });
  }, [slotId]);

  function setStatus(studentId: string, status: RegisterEntry["status"]) {
    setRegister((prev) =>
      prev.map((e) => (e.studentId === studentId ? { ...e, status } : e))
    );
  }

  function setReason(studentId: string, reason: string) {
    setRegister((prev) =>
      prev.map((e) => (e.studentId === studentId ? { ...e, absenceReason: reason } : e))
    );
  }

  async function handleSubmit(confirmed = false) {
    if (isLocked) {
      alert("This register is locked. Contact admin to unlock.");
      return;
    }
    setSubmitting(true);
    const entries = register
      .filter((e) => e.status !== null)
      .map((e) => ({
        studentId: e.studentId,
        status: e.status!,
        absenceReason: e.absenceReason,
      }));

    const res = await fetch("/api/attendance/student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotId, date, entries, confirmed }),
    });
    const json = await res.json();

    if (json.requiresConfirmation) {
      setShowConfirm(true);
      setSubmitting(false);
      return;
    }

    if (!res.ok) {
      alert(json.error || "Failed to save");
      setSubmitting(false);
      return;
    }

    router.push("/teacher");
  }

  if (loading) return <div className="p-6">Loading register...</div>;

  const presentCount = register.filter((e) => e.status === "present").length;
  const absentCount = register.filter((e) => e.status === "absent").length;

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {slot?.learningArea?.name} — {slot?.stream?.grade?.name} {slot?.stream?.name}
          </h1>
          <p className="text-sm text-gray-500">
            {slot?.period?.name} ({date})
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">Present: {presentCount}</Badge>
          <Badge variant="destructive">Absent: {absentCount}</Badge>
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={() => setRegister((p) => p.map((e) => ({ ...e, status: "present" })))}>
        Mark All Present
      </Button>

      <div className="space-y-2">
        {register.map((entry) => (
          <Card key={entry.studentId} className={entry.status === "absent" ? "border-red-200" : ""}>
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium">
                  {entry.firstName} {entry.lastName}
                </p>
              </div>
              <div className="flex gap-1">
                {(["present", "absent", "late", "excused"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={entry.status === s ? "default" : "outline"}
                    className={entry.status === s ? (s === "absent" ? "bg-red-600" : s === "present" ? "bg-green-600" : "") : ""}
                    onClick={() => setStatus(entry.studentId, s)}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </Button>
                ))}
              </div>
              {entry.status === "absent" && (
                <select
                  className="text-sm border rounded px-2 py-1"
                  value={entry.absenceReason || ""}
                  onChange={(e) => setReason(entry.studentId, e.target.value)}
                >
                  <option value="">Reason...</option>
                  <option value="sick">Sick</option>
                  <option value="parent_pickup">Parent Pickup</option>
                  <option value="activity">School Activity</option>
                  <option value="unknown">Unknown</option>
                </select>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {showConfirm && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-sm">High Absence Rate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">You are marking most students absent. Is today a school event?</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSubmit(true)}>Yes, Confirm</Button>
              <Button size="sm" variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Button className="w-full" disabled={submitting} onClick={() => handleSubmit()}>
        {submitting ? "Saving..." : "Submit Register"}
      </Button>
    </div>
  );
}