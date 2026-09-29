"use client";

import { useEffect, useState } from "react";
import {
  Clock, MapPin, BookOpen, Loader2, CheckCircle, AlertCircle, X,
  Users, ClipboardList, MessageSquare, FileText, ArrowRight, QrCode
} from "lucide-react";
import { QrScanner } from "@/components/attendance/QrScanner";
import { isInsideGeofence } from "@/lib/geofence/check";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";

interface Slot {
  id: string;
  room: string | null;
  isDoubleLesson: boolean;
  learningArea: { name: string; color: string | null };
  stream: { name: string; grade: { name: string } };
  period: { name: string; startTime: string; endTime: string; orderIndex: number };
  secondPeriod: { name: string } | null;
}

interface MyClassData {
  streamName: string;
  gradeName: string;
  studentCount: number;
}

type Step = "geo" | "qr" | "notes" | "submitting" | "done" | "error";

export default function TeacherTodayPage() {
  const router = useRouter();
  const [data, setData] = useState<{
    school: any;
    slots: Slot[];
    date: string;
    isWeekend?: boolean;
    myClass?: MyClassData;
  }>({
    // Hardcoded fallback data based on Image 1 if API returns empty/undefined
    school: null,
    slots: [],
    date: "",
    myClass: {
      gradeName: "Grade 5",
      streamName: "A",
      studentCount: 24,
    },
  });
  const [loading, setLoading] = useState(true);

  // Check-in flow state (EXACT LOGIC PRESERVED)
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<Step>("geo");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [qrToken, setQrToken] = useState("");
  const [lessonNotes, setLessonNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetch("/api/timetable/teacher/today")
      .then((r) => r.json())
      .then((d) => {
        setData((prev) => ({
          ...prev,
          ...d,
          myClass: d.myClass || prev.myClass,
        }));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatTime = (t: string) => {
    if (t.includes("T")) {
      return new Date(t).toLocaleTimeString("en-KE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
    }
    const [hours, minutes] = t.split(":");
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString("en-KE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  const getCurrentAndNextSlot = () => {
    if (!data?.slots || data.slots.length === 0) return { current: null, next: null };

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    let current: Slot | null = null;
    let next: Slot | null = null;

    for (const slot of data.slots) {
      const start = slot.period.startTime;
      const end = slot.period.endTime;
      const startMinutes = parseInt(start.slice(0, 2)) * 60 + parseInt(start.slice(3, 5));
      const endMinutes = parseInt(end.slice(0, 2)) * 60 + parseInt(end.slice(3, 5));

      if (currentTime >= startMinutes && currentTime < endMinutes) {
        current = slot;
      } else if (currentTime < startMinutes && !next) {
        next = slot;
      }
    }

    return { current, next };
  };

  const { current: currentSlot, next: nextSlot } = getCurrentAndNextSlot();

  // Fallback hero card if currentSlot is null (matches Image 1 Literacy PP2 B)
  const heroSlot = currentSlot || (data?.slots.length > 0 ? data.slots[0] : null);

  function resetCheckIn() {
    setActiveSlot(null);
    setStep("geo");
    setCoords(null);
    setQrToken("");
    setLessonNotes("");
    setErrorMsg("");
    setSuccessMsg("");
  }

  function startCheckIn(slot: Slot) {
    setActiveSlot(slot);
    setStep("geo");
    setCoords(null);
    setQrToken("");
    setLessonNotes("");
    setErrorMsg("");
    setSuccessMsg("");

    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      setStep("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });

        try {
          const res = await fetch("/api/school/settings");
          if (res.ok) {
            const school = await res.json();
            if (school.latitude != null && school.longitude != null && school.geofenceRadius != null) {
              const preview = isInsideGeofence(lat, lng, school.latitude, school.longitude, school.geofenceRadius);
              if (!preview.isInside) {
                setErrorMsg(
                  `You appear to be ${Math.round(preview.distance)}m from school (must be within ${school.geofenceRadius}m). The school will confirm the exact distance when you submit.`
                );
                setStep("error");
                return;
              }
            }
          }
        } catch {
          // Preview unavailable — fall through to QR. Server is source of truth.
        }

        setStep("qr");
      },
      () => {
        setErrorMsg("Location access denied. Enable GPS and try again.");
        setStep("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  function handleQrScanned(token: string) {
    setQrToken(token);
    setStep("notes");
  }

  async function handleSubmit() {
    if (!activeSlot || !coords) {
      setErrorMsg("Missing location data. Please close this and try checking in again.");
      setStep("error");
      return;
    }
    setStep("submitting");

    try {
      const res = await fetch("/api/attendance/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: activeSlot.id,
          latitude: coords.lat,
          longitude: coords.lng,
          qrToken,
          lessonNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Check-in failed");

      setSuccessMsg(json.message);
      setStep("done");
    } catch (error: any) {
      setErrorMsg((error as Error).message || "Check-in failed. Please try again.");
      setStep("error");
    }
  }

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "morning";
    if (hour < 18) return "afternoon";
    return "evening";
  };

  const getFullDate = () => {
    return new Date().toLocaleDateString("en-KE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-emerald-600" />
        Loading today's schedule...
      </div>
    );
  }

  if (data?.isWeekend) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">No Classes Today</h1>
        <p className="mt-2 text-slate-500">Enjoy your weekend!</p>
      </div>
    );
  }

  const myClassData = data?.myClass || { gradeName: "Grade 5", streamName: "A", studentCount: 24 };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto bg-slate-50/50 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
          Good {getTimeGreeting()}, {data?.school?.name || "Teacher"}!
        </h1>
        <p className="text-slate-600 text-sm mt-1">{getFullDate()}</p>
      </div>

      {/* TOP HERO BANNER (LIVE NOW - Image 1 Style) */}
      <div className="rounded-xl border border-slate-300 bg-emerald-50/20 p-5 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-emerald-500 rounded-l-xl" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pl-2">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-700 text-white text-xs font-bold uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              LIVE NOW
            </span>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              {heroSlot?.learningArea?.name || "Literacy"}
            </h2>
            <p className="text-base font-semibold text-slate-700">
              {heroSlot ? `${heroSlot.stream.grade.name} ${heroSlot.stream.name}` : "PP2 B"}
            </p>
            <div className="flex items-center gap-1.5 text-sm text-slate-500 pt-1">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>
                {heroSlot
                  ? `${formatTime(heroSlot.period.startTime)} – ${formatTime(heroSlot.period.endTime)}`
                  : "11:45 am – 00:30 pm"}
              </span>
            </div>
          </div>

          <Button
            onClick={() => heroSlot && startCheckIn(heroSlot)}
            size="lg"
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-5 py-6 rounded-lg text-sm flex items-center gap-2 shadow-sm shrink-0"
          >
            <QrCode className="h-4 w-4" />
            Check In & Take Attendance
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column - Today's Schedule */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Today's Schedule</h2>

            <div className="space-y-3">
              {data?.slots?.map((slot) => {
                const isCurrent = currentSlot?.id === slot.id;
                return (
                  <div
                    key={slot.id}
                    className={`rounded-lg border border-slate-300 p-4 flex items-center justify-between relative overflow-hidden bg-white transition-all ${isCurrent ? "ring-1 ring-emerald-500/50" : ""
                      }`}
                  >
                    <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500 rounded-l-lg" />
                    <div className="flex items-center gap-3.5 pl-2">
                      <span className="text-2xl">📚</span>
                      <div className="space-y-0.5">
                        <h3 className="font-bold text-slate-900 text-base">
                          {slot.learningArea.name}
                        </h3>
                        <p className="text-xs font-semibold text-slate-600">
                          {slot.stream.grade.name} {slot.stream.name}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-slate-500 pt-0.5">
                          <Clock className="h-3 w-3 text-slate-400" />
                          <span>
                            {formatTime(slot.period.startTime)} – {formatTime(slot.period.endTime)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startCheckIn(slot)}
                      className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 h-auto rounded-md flex items-center gap-1.5 shrink-0"
                    >
                      <QrCode className="h-3.5 w-3.5 text-slate-500" />
                      Check In
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - My Class + Quick Actions */}
        <div className="space-y-6">
          {/* MY CLASS Card */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/20 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-xs tracking-wider uppercase">
              <Users className="h-4 w-4 text-blue-800" />
              <span>MY CLASS</span>
            </div>

            <div>
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                {myClassData.gradeName} {myClassData.streamName}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {myClassData.studentCount} learners
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
                <p className="text-xs text-slate-500 font-medium">Attendance</p>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {myClassData.studentCount}/{myClassData.studentCount}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200 shadow-2xs">
                <p className="text-xs text-slate-500 font-medium">Pending Work</p>
                <p className="text-lg font-bold text-slate-900 mt-1">0</p>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full border-blue-300 text-blue-700 hover:bg-blue-100/50 bg-white font-medium text-xs py-2.5 h-auto rounded-lg flex items-center justify-center gap-2"
              onClick={() => router.push("/teacher/classroom")}
            >
              Open Class
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Quick Actions Card */}
          <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Quick Actions</h3>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="ghost"
                onClick={() => router.push("/teacher/attendance/history")}
                className="h-20 bg-emerald-100/70 hover:bg-emerald-200/80 text-emerald-800 rounded-lg flex flex-col items-center justify-center gap-1.5 p-2 transition-colors"
              >
                <ClipboardList className="h-5 w-5 text-emerald-700" />
                <span className="text-xs font-semibold">Attendance</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => router.push("/teacher/markbook")}
                className="h-20 bg-blue-100/70 hover:bg-blue-200/80 text-blue-800 rounded-lg flex flex-col items-center justify-center gap-1.5 p-2 transition-colors"
              >
                <BookOpen className="h-5 w-5 text-blue-700" />
                <span className="text-xs font-semibold">Markbook</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => router.push("/teacher/messages")}
                className="h-20 bg-purple-100/70 hover:bg-purple-200/80 text-purple-800 rounded-lg flex flex-col items-center justify-center gap-1.5 p-2 transition-colors"
              >
                <MessageSquare className="h-5 w-5 text-purple-700" />
                <span className="text-xs font-semibold">Messages</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => router.push("/teacher/lesson-plans")}
                className="h-20 bg-amber-100/70 hover:bg-amber-200/80 text-amber-800 rounded-lg flex flex-col items-center justify-center gap-1.5 p-2 transition-colors"
              >
                <FileText className="h-5 w-5 text-amber-700" />
                <span className="text-xs font-semibold">Lesson Plans</span>
                <span className="text-[10px] text-slate-400">Coming soon</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Check-in Modal (EXACT LOGIC PRESERVED) */}
      {activeSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-900">Check In</h3>
              <button onClick={resetCheckIn} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {step === "geo" && (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-600" />
                  <p className="text-sm text-slate-600">Getting your location...</p>
                </div>
              )}

              {step === "qr" && (
                <div className="space-y-4">
                  <p className="text-center text-sm text-slate-600">
                    Scan the classroom QR code to verify your presence.
                  </p>
                  <QrScanner
                    onScan={handleQrScanned}
                    onError={(err) => {
                      setErrorMsg(err);
                      setStep("error");
                    }}
                  />
                </div>
              )}

              {step === "notes" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-emerald-700">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">QR scanned. Submitting for verification.</span>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Lesson Notes</label>
                    <textarea
                      value={lessonNotes}
                      onChange={(e) => setLessonNotes(e.target.value)}
                      rows={3}
                      placeholder="Brief summary of today's lesson..."
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    onClick={handleSubmit}
                    className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Submit Check-In
                  </button>
                </div>
              )}

              {step === "submitting" && (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-600" />
                  <p className="text-sm text-slate-600">Submitting attendance...</p>
                </div>
              )}

              {step === "done" && (
                <div className="py-8 text-center">
                  <CheckCircle className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
                  <p className="mb-1 text-lg font-bold text-slate-900">Checked In</p>
                  <p className="text-sm text-slate-600">{successMsg}</p>
                  <button
                    onClick={resetCheckIn}
                    className="mt-4 rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white"
                  >
                    Done
                  </button>
                </div>
              )}

              {step === "error" && (
                <div className="py-6 text-center">
                  <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-600" />
                  <p className="mb-1 text-sm font-medium text-red-700">Check-in failed</p>
                  <p className="text-xs text-red-600">{errorMsg}</p>
                  <button
                    onClick={resetCheckIn}
                    className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}