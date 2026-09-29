"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

type LessonAttendance = {
  id: string;
  slot: {
    learningArea: { name: string };
    period: { startTime: string; endTime: string };
  };
  status: "present" | "absent" | "late" | "excused";
  absenceReason?: string;
  markedAt?: string;
};

type DailyAttendance = {
  date: string;
  arrivedAt?: string;
  departedAt?: string;
  dailyStatus: "present" | "absent" | "late" | "half_day";
  lessons: LessonAttendance[];
  presentLessons: number;
  totalLessons: number;
  attendanceRate: number;
};

type ChildAttendance = {
  studentId: string;
  firstName: string;
  lastName: string;
  grade: string;
  stream: string;
  overallRate: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  lastArrival?: string;
  recentDays: DailyAttendance[];
  weeklyTrend: { day: string; rate: number }[];
};

const COLORS = {
  present: "#10b981",
  absent: "#ef4444",
  late: "#f59e0b",
  excused: "#3b82f6",
};

type ViewMode = "summary" | "calendar" | "detail";

export default function ParentAttendancePage() {
  const { user } = useUser();
  const [children, setChildren] = useState<ChildAttendance[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAttendance() {
      try {
        const response = await fetch("/api/parent/attendance");
        if (!response.ok) throw new Error("Failed to fetch attendance");
        const data = await response.json();
        setChildren(data.children || []);
        if (data.children?.[0]) setSelectedChildId(data.children[0].studentId);
      } catch (error) {
        console.error("Error fetching attendance:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchAttendance();
  }, []);

  const selectedChild = children.find((c) => c.studentId === selectedChildId) || children[0];

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  if (!selectedChild) {
    return <div className="p-8 text-center text-slate-500">No children found.</div>;
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "present":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "absent":
        return "bg-red-100 text-red-700 border-red-200";
      case "late":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "excused":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const pieData = [
    { name: "Present", value: selectedChild.totalPresent, color: COLORS.present },
    { name: "Absent", value: selectedChild.totalAbsent, color: COLORS.absent },
    { name: "Late", value: selectedChild.totalLate, color: COLORS.late },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header with Child Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Attendance History</h1>
          <p className="text-sm text-slate-500 mt-1">Track your child's daily and lesson-by-lesson attendance</p>
        </div>
        
        {/* Child Switcher - ONLY shows if parent has multiple children */}
        {children.length > 1 && (
          <div className="relative">
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="appearance-none w-full sm:w-auto rounded-lg border border-slate-300 bg-white py-2 pl-4 pr-10 text-sm font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {children.map((c) => (
                <option key={c.studentId} value={c.studentId}>
                  {c.firstName} {c.lastName} ({c.grade} {c.stream})
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        )}
      </div>

      {/* View Mode Tabs - NOW FUNCTIONAL */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setViewMode("summary")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "summary" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Summary
        </button>
        <button
          onClick={() => setViewMode("calendar")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "calendar" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Calendar View
        </button>
        <button
          onClick={() => setViewMode("detail")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            viewMode === "detail" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          Detailed View
        </button>
      </div>

      {/* SUMMARY VIEW */}
      {viewMode === "summary" && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Attendance Rate</p>
                    <p className="text-3xl font-bold text-slate-900 mt-2">{selectedChild.overallRate}%</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-emerald-600" />
                  </div>
                </div>
                <Progress value={selectedChild.overallRate} className="mt-4 h-2" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Days Present</p>
                    <p className="text-3xl font-bold text-emerald-600 mt-2">{selectedChild.totalPresent}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Days Absent</p>
                    <p className="text-3xl font-bold text-red-600 mt-2">{selectedChild.totalAbsent}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                    <XCircle className="h-6 w-6 text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Last Arrival</p>
                    <p className="text-lg font-bold text-slate-900 mt-2">{formatTime(selectedChild.lastArrival)}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attendance Breakdown Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Attendance Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-4">
                  {pieData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm text-slate-600">{item.name}: {item.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Weekly Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Weekly Attendance Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedChild.weeklyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} domain={[0, 100]} />
                      <Tooltip formatter={(value) => `${value}%`} />
                      <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Attendance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Recent Attendance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedChild.recentDays.map((day) => (
                <div key={day.date} className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-slate-400" />
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {new Date(day.date).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
                        </h4>
                        <p className="text-sm text-slate-500">
                          Arrived: {formatTime(day.arrivedAt)} • {day.presentLessons}/{day.totalLessons} lessons present
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(day.dailyStatus)}>
                      {day.dailyStatus.toUpperCase()}
                    </Badge>
                  </div>

                  {/* Lesson-by-lesson breakdown */}
                  {day.lessons.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
                      {day.lessons.map((lesson) => (
                        <div key={lesson.id} className="flex items-center justify-between text-sm bg-slate-50 rounded p-2">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-slate-400" />
                            <span className="font-medium text-slate-700">{lesson.slot.learningArea.name}</span>
                            <span className="text-xs text-slate-500">
                              {lesson.slot.period.startTime} - {lesson.slot.period.endTime}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {lesson.status === "absent" && lesson.absenceReason && (
                              <span className="text-xs text-slate-500">({lesson.absenceReason})</span>
                            )}
                            <Badge variant="outline" className={getStatusColor(lesson.status)}>
                              {lesson.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === "calendar" && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
                  {day}
                </div>
              ))}
              {selectedChild.recentDays.map((day) => {
                const date = new Date(day.date);
                const dayColor = day.dailyStatus === "present" ? "bg-emerald-100 border-emerald-300" :
                                day.dailyStatus === "absent" ? "bg-red-100 border-red-300" :
                                day.dailyStatus === "late" ? "bg-amber-100 border-amber-300" : "bg-slate-100";
                
                return (
                  <div
                    key={day.date}
                    className={`aspect-square rounded-lg border ${dayColor} p-2 flex flex-col items-center justify-center cursor-pointer hover:shadow-md transition-shadow`}
                    title={`${date.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })} - ${day.dailyStatus}`}
                  >
                    <span className="text-lg font-bold">{date.getDate()}</span>
                    <span className="text-xs mt-1">{day.presentLessons}/{day.totalLessons}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-6 justify-center">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300" />
                <span className="text-sm">Present</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-100 border border-red-300" />
                <span className="text-sm">Absent</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-100 border border-amber-300" />
                <span className="text-sm">Late</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAILED VIEW */}
      {viewMode === "detail" && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Lesson-by-Lesson Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedChild.recentDays.map((day) => (
              <div key={day.date} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-slate-400" />
                      <div>
                        <h4 className="font-semibold text-slate-900">
                          {new Date(day.date).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
                        </h4>
                        <p className="text-sm text-slate-500">
                          {day.presentLessons}/{day.totalLessons} lessons present • {day.dailyStatus.toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(day.dailyStatus)}>
                      {day.dailyStatus}
                    </Badge>
                  </div>
                </div>
                <div className="p-4 space-y-2">
                  {day.lessons.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No lesson data available</p>
                  ) : (
                    day.lessons.map((lesson, idx) => (
                      <div key={lesson.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <BookOpen className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{lesson.slot.learningArea.name}</p>
                            <p className="text-xs text-slate-500">
                              {lesson.slot.period.startTime} - {lesson.slot.period.endTime}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {lesson.status === "absent" && lesson.absenceReason && (
                            <span className="text-xs text-slate-500 italic">({lesson.absenceReason})</span>
                          )}
                          <Badge className={getStatusColor(lesson.status)}>
                            {lesson.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}