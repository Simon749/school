"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, CheckCircle2, XCircle, Clock } from "lucide-react";

// Mock data type - replace with your actual API response type
type AttendanceRecord = {
  date: string;
  status: "present" | "absent" | "late";
  lessons: {
    subject: string;
    status: "present" | "absent";
    reason?: string;
  }[];
};

export default function StudentAttendancePage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;
  
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("Student");

  useEffect(() => {
    // TODO: Replace with your actual API call
    // fetch(`/api/attendance/parent/${studentId}`)
    setTimeout(() => {
      setAttendance([
        {
          date: "2026-09-03",
          status: "present",
          lessons: [
            { subject: "Literacy", status: "present" },
            { subject: "Numeracy", status: "absent", reason: "Sick" },
          ],
        },
      ]);
      setStudentName("Amara"); // Fetch from API
      setLoading(false);
    }, 500);
  }, [studentId]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading attendance...</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{studentName}'s Attendance</h1>
          <p className="text-sm text-slate-500">Detailed lesson-by-lesson attendance record</p>
        </div>
      </div>

      {/* Attendance List */}
      <div className="space-y-4">
        {attendance.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              No attendance records found for this term.
            </CardContent>
          </Card>
        ) : (
          attendance.map((day) => (
            <Card key={day.date}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    {new Date(day.date).toLocaleDateString("en-KE", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </CardTitle>
                  <Badge
                    className={
                      day.status === "present"
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : day.status === "late"
                        ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                    }
                  >
                    {day.status === "present" ? (
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                    ) : day.status === "late" ? (
                      <Clock className="mr-1 h-3 w-3" />
                    ) : (
                      <XCircle className="mr-1 h-3 w-3" />
                    )}
                    {day.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {day.lessons.map((lesson, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-700">{lesson.subject}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {lesson.status === "absent" && lesson.reason && (
                          <span className="text-xs text-slate-500">({lesson.reason})</span>
                        )}
                        <Badge
                          variant="outline"
                          className={
                            lesson.status === "present"
                              ? "border-emerald-200 text-emerald-700"
                              : "border-red-200 text-red-700"
                          }
                        >
                          {lesson.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}