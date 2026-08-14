"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, Clock, MapPin, XCircle } from "lucide-react";

interface AttendanceSlot {
  id: string;
  period: { name: string; startTime: string; endTime: string; orderIndex: number };
  learningArea: { name: string; color: string | null };
  teacher: { user: { firstName: string; lastName: string } };
  stream: { name: string; grade: { name: string } };
  room: string | null;
  status: "pending" | "present" | "late" | "absent";
  needsAlert: boolean;
  attendance: {
    checkedInAt: string;
    checkInLat: number | null;
    checkInLng: number | null;
    status: string;
    minutesLate: number | null;
    lessonNotes: string | null;
  } | null;
}

export default function AdminAttendancePage() {
  const [slots, setSlots] = useState<AttendanceSlot[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/teacher?date=${date}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSlots(data.slots || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAttendance, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAttendance]);

  const alerts = slots.filter((s) => s.needsAlert);
  const present = slots.filter((s) => s.status === "present").length;
  const late = slots.filter((s) => s.status === "late").length;
  const absent = slots.filter((s) => s.status === "absent").length;
  const pending = slots.filter((s) => s.status === "pending").length;

  const formatTime = (t: string) => (t.includes("T") ? new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : t.slice(0, 5));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teacher Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time check-in status for {date}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Present</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{present}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Late</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{late}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-xs font-medium text-gray-500 uppercase">Absent</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{absent}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500 uppercase">Pending</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{pending}</p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h3 className="text-sm font-bold text-red-800">Starting Soon — No Check-In</h3>
          </div>
          <div className="space-y-1">
            {alerts.map((s) => (
              <p key={s.id} className="text-xs text-red-700">
                {s.period.name} ({formatTime(s.period.startTime)}) — {s.teacher.user.firstName} {s.teacher.user.lastName} · {s.stream.grade.name} {s.stream.name}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading...</div>
        ) : slots.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No scheduled periods for this day.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {slots.map((slot) => {
              const statusColors = {
                present: "bg-green-50 border-green-200 text-green-800",
                late: "bg-amber-50 border-amber-200 text-amber-800",
                absent: "bg-red-50 border-red-200 text-red-800",
                pending: "bg-gray-50 border-gray-200 text-gray-600",
              };

              const StatusIcon = {
                present: CheckCircle,
                late: Clock,
                absent: XCircle,
                pending: Clock,
              }[slot.status];

              return (
                <div key={slot.id} className={`p-4 border-l-4 ${statusColors[slot.status].split(" ")[2].replace("text-", "border-")}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusColors[slot.status].split(" ")[0]}`}>
                        <StatusIcon className={`w-5 h-5 ${statusColors[slot.status].split(" ")[2]}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{slot.period.name}</span>
                          <span className="text-xs text-gray-500">
                            {formatTime(slot.period.startTime)} – {formatTime(slot.period.endTime)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">
                          {slot.teacher.user.firstName} {slot.teacher.user.lastName} · {slot.learningArea.name} · {slot.stream.grade.name} {slot.stream.name}
                          {slot.room && <span className="text-gray-400"> · {slot.room}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${statusColors[slot.status]}`}>
                        {slot.status.charAt(0).toUpperCase() + slot.status.slice(1)}
                      </span>
                      {slot.attendance?.minutesLate && (
                        <p className="text-[10px] text-gray-500 mt-1">+{slot.attendance.minutesLate} min late</p>
                      )}
                    </div>
                  </div>

                  {slot.attendance && (
                    <div className="mt-3 ml-14 text-xs text-gray-500 flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Checked in at {new Date(slot.attendance.checkedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {slot.attendance.checkInLat && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          GPS verified
                        </span>
                      )}
                      {slot.attendance.lessonNotes && (
                        <span className="italic text-gray-400">"{slot.attendance.lessonNotes}"</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}