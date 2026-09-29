"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  GraduationCap,
  FileText,
  Wallet,
  ChevronRight,
  AlertTriangle,
  Calendar,
  ArrowRight,
} from "lucide-react";

type Child = {
  student: {
    id: string;
    firstName: string;
    lastName: string;
    stream: { grade: { name: string }; name: string };
  };
  daily: { status: string; arrivedAt: string } | null;
  lessons: { status: string; absenceReason: string | null; slot: { learningArea: { name: string } } }[];
};

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </h2>
      {action && <span className="text-xs font-medium text-emerald-700">{action}</span>}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-slate-400">{children}</p>;
}

export default function ParentDashboard() {
  const { user } = useUser();
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/parent/children")
      .then((r) => r.json())
      .then((d) => {
        setChildren(d.children || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const dateStr = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  const totalPresentToday = children.reduce(
    (sum, c) => sum + c.lessons.filter((l) => l.status === "present").length,
    0
  );
  const totalLessonsToday = children.reduce((sum, c) => sum + c.lessons.length, 0);
  const attendanceRate = totalLessonsToday > 0 ? Math.round((totalPresentToday / totalLessonsToday) * 100) : 0;
  const absentChildren = children.filter((c) => c.lessons.some((l) => l.status === "absent"));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greeting}, {user?.firstName || "Parent"}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">{dateStr}</p>
        </div>
      </div>

      {/* Pulse Summary */}
      <section>
        <SectionHeader title="Today's Summary" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500">
              <Users className="h-4 w-4 text-white" />
            </div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Children
            </p>
            <p className="text-2xl font-bold leading-none text-slate-900">
              {children.length}
            </p>
            <span className="mt-1 flex items-center gap-1 font-mono text-xs text-slate-500">
              Enrolled
            </span>
          </Card>

          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Lessons Present
            </p>
            <p className="text-2xl font-bold leading-none text-slate-900">
              {totalPresentToday}/{totalLessonsToday}
            </p>
            <span className="mt-1 flex items-center gap-1 font-mono text-xs text-slate-500">
              {attendanceRate}% rate
            </span>
          </Card>

          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Arrived
            </p>
            <p className="text-2xl font-bold leading-none text-slate-900">
              {children.filter((c) => c.daily?.status === "present").length}
            </p>
            <span className="mt-1 flex items-center gap-1 font-mono text-xs text-slate-500">
              At school gate
            </span>
          </Card>

          <Card className="p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-red-500">
              <XCircle className="h-4 w-4 text-white" />
            </div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
              Absences
            </p>
            <p className="text-2xl font-bold leading-none text-slate-900">
              {absentChildren.length}
            </p>
            <span className="mt-1 flex items-center gap-1 font-mono text-xs text-slate-500">
              Need attention
            </span>
          </Card>
        </div>
      </section>

      {/* Alert Banner */}
      {absentChildren.length > 0 && (
        <div className="rounded-lg border border-l-4 border-amber-100 border-l-amber-500 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">
                Absence Alert
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {absentChildren.map((c) => `${c.student.firstName} ${c.student.lastName}`).join(", ")} {" "}
                {absentChildren.length === 1 ? "has" : "have"} missed lessons today.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Children Cards */}
      <section>
        <SectionHeader title="Your Children" action={`${children.length} enrolled`} />
        {children.length === 0 ? (
          <Card className="p-6">
            <EmptyState>No children linked to your account yet.</EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {children.map((child) => {
              const presentLessons = child.lessons.filter((l) => l.status === "present").length;
              const absentLessons = child.lessons.filter((l) => l.status === "absent");
              const lessonRate = child.lessons.length > 0 ? Math.round((presentLessons / child.lessons.length) * 100) : 0;

              return (
                <Card key={child.student.id} className="overflow-hidden transition-shadow hover:shadow-md">
                  <div className="p-5">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
                            {initials(child.student.firstName, child.student.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">
                            {child.student.firstName} {child.student.lastName}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {child.student.stream.grade.name} {child.student.stream.name}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          child.daily?.status === "present"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }
                      >
                        {child.daily?.status === "present" ? "At School" : "Not Arrived"}
                      </Badge>
                    </div>

                    {/* Status Grid */}
                    <div className="mb-4 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Gate Arrival</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {child.daily?.arrivedAt
                            ? new Date(child.daily.arrivedAt).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Lessons Present</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {presentLessons}/{child.lessons.length} ({lessonRate}%)
                        </p>
                      </div>
                    </div>

                    {/* Absence Detail */}
                    {absentLessons.length > 0 && (
                      <div className="mb-4 rounded-lg bg-red-50 p-3">
                        <p className="text-xs font-medium text-red-700">
                          Absent from: {" "}
                          {absentLessons.map((l) => l.slot.learningArea.name).join(", ")}
                        </p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex gap-2">
                      <Link href={`/parent/attendance?studentId=${child.student.id}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Attendance
                        </Button>
                      </Link>
                      <Link href={`/parent/${child.student.id}/results`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5">
                          <FileText className="h-3.5 w-3.5" />
                          Results
                        </Button>
                      </Link>
                      <Link href={`/parent/${child.student.id}/fees`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1.5">
                          <Wallet className="h-3.5 w-3.5" />
                          Fees
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}