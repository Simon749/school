import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users,
  CheckCircle2,
  Timer,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  ChevronRight,
  Shield,
  BookOpen,
  MapPin,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ── Shared helpers (match admin style) ────────────────────
function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function SectionHeader({
  title,
  action,
  href,
}: {
  title: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </h2>
      {action &&
        (href ? (
          <Link
            href={href}
            className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
          >
            {action} <ChevronRight className="h-3 w-3" />
          </Link>
        ) : (
          <span className="text-xs font-medium text-emerald-700">{action}</span>
        ))}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

function PulseCard({
  icon: Icon,
  accent,
  label,
  value,
  sublabel,
}: {
  icon: React.ElementType;
  accent: string;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <Card className="p-5 transition-shadow hover:shadow-md">
      <div
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
      <span className="mt-1 flex items-center gap-1 font-mono text-xs text-slate-500">
        {sublabel}
      </span>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const styles: Record<string, string> = {
    present: "bg-emerald-500",
    late: "bg-amber-400",
    absent: "bg-red-500",
    covered: "bg-blue-500",
    pending: "bg-slate-300",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${styles[status] || styles.pending}`}
    />
  );
}

// ── Page ──────────────────────────────────────────────────
export default async function DeputyDashboardPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();
  const dayOfWeek = today.getDay() || 1;

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true },
    orderBy: { startDate: "desc" },
  });

  // ── Stats ───────────────────────────────────────────────
  const totalTeachers = await prisma.teacher.count();
  const checkedInToday = await prisma.teacherAttendance.count({
    where: {
      date: today,
      status: { in: ["present", "late", "covered"] },
    },
  });
  const absentToday = await prisma.teacherAttendance.count({
    where: { date: today, status: "absent" },
  });
  const lateToday = await prisma.teacherAttendance.count({
    where: { date: today, status: "late" },
  });

  // ── Today's slots ──────────────────────────────────────
  const slotsToday = await prisma.timetableSlot.findMany({
    where: { dayOfWeek, termId: currentTerm?.id },
    include: {
      teacher: { include: { user: true } },
      stream: { include: { grade: true } },
      learningArea: true,
      period: true,
      teacherAttendances: { where: { date: today } },
    },
    orderBy: [{ period: { orderIndex: "asc" } }],
  });

  const uncovered = slotsToday.filter((slot) => {
    const [h, m] = slot.period.startTime
      .toISOString()
      .slice(11, 16)
      .split(":")
      .map(Number);
    const slotStart = new Date(today);
    slotStart.setHours(h, m, 0, 0);
    const windowStart = new Date(slotStart.getTime() - 30 * 60 * 1000);
    const hasAttendance = slot.teacherAttendances.some(
      (a) => a.status === "present" || a.status === "late" || a.status === "covered"
    );
    return now >= windowStart && !hasAttendance;
  });

  // ── Recent activity (last 7 days) ──────────────────────
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentAttendance = await prisma.teacherAttendance.findMany({
    where: { date: { gte: sevenDaysAgo } },
    include: {
      teacher: { include: { user: true } },
      slot: { include: { learningArea: true, period: true } },
    },
    orderBy: { date: "desc" },
    take: 8,
  });

  const dateStr = today.toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Deputy Principal
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {dateStr}
            {currentTerm ? ` · ${currentTerm.name}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/deputy/teacher-performance">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Performance
            </Button>
          </Link>
          <Link href="/deputy/uncovered-lessons">
            <Button variant="outline" size="sm" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Uncovered
            </Button>
          </Link>
        </div>
      </div>

      {/* Uncovered Alert */}
      {uncovered.length > 0 && (
        <div className="rounded-lg border border-l-4 border-red-100 border-l-red-500 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">
                {uncovered.length} Uncovered Lesson
                {uncovered.length > 1 ? "s" : ""} Right Now
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Teachers have not checked in for the following periods.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {uncovered.slice(0, 3).map((u) => (
                  <span
                    key={u.id}
                    className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200"
                  >
                    {u.period.name} · {u.learningArea.name}
                  </span>
                ))}
                {uncovered.length > 3 && (
                  <span className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs text-red-600 ring-1 ring-inset ring-red-200">
                    +{uncovered.length - 3} more
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/deputy/uncovered-lessons"
              className="mt-0.5 flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Fix Now <ArrowRight className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Pulse Stats */}
      <section>
        <SectionHeader title="Staff Pulse" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <PulseCard
            icon={Users}
            accent="bg-slate-700"
            label="Total Teachers"
            value={String(totalTeachers)}
            sublabel="On staff this term"
          />
          <PulseCard
            icon={CheckCircle2}
            accent="bg-emerald-500"
            label="Checked In Today"
            value={String(checkedInToday)}
            sublabel={
              totalTeachers > 0
                ? `${Math.round((checkedInToday / totalTeachers) * 100)}% rate`
                : "No records"
            }
          />
          <PulseCard
            icon={Timer}
            accent="bg-amber-500"
            label="Late Arrivals"
            value={String(lateToday)}
            sublabel="After grace period"
          />
          <PulseCard
            icon={XCircle}
            accent="bg-red-500"
            label="Absent Today"
            value={String(absentToday)}
            sublabel="Not checked in"
          />
          <PulseCard
            icon={AlertTriangle}
            accent="bg-orange-500"
            label="Uncovered"
            value={String(uncovered.length)}
            sublabel="Need substitute"
          />
        </div>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Lessons */}
        <Card className="p-6">
          <SectionHeader
            title="Today's Timetable"
            action="Uncovered lessons"
            href="/deputy/uncovered-lessons"
          />
          {slotsToday.length === 0 ? (
            <EmptyState>No timetable slots scheduled for today.</EmptyState>
          ) : (
            <div className="space-y-3">
              {slotsToday.map((slot) => {
                const att = slot.teacherAttendances[0];
                const isUncovered = uncovered.some((u) => u.id === slot.id);
                const status = att?.status || "pending";
                return (
                  <div
                    key={slot.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      isUncovered
                        ? "border-red-200 bg-red-50"
                        : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isUncovered
                            ? "bg-red-100 text-red-600"
                            : status === "present"
                            ? "bg-emerald-100 text-emerald-600"
                            : status === "late"
                            ? "bg-amber-100 text-amber-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {slot.period.name} · {slot.learningArea.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {slot.stream.grade.name}
                          {slot.stream.name} · Room {slot.room || "TBD"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px] bg-slate-100 text-slate-600">
                            {initials(
                              slot.teacher.user.firstName,
                              slot.teacher.user.lastName
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden text-xs text-slate-600 sm:inline">
                          {slot.teacher.user.firstName}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-xs">
                        <StatusDot status={status} />
                        <span
                          className={
                            status === "present"
                              ? "text-emerald-700"
                              : status === "late"
                              ? "text-amber-700"
                              : isUncovered
                              ? "text-red-700"
                              : "text-slate-400"
                          }
                        >
                          {isUncovered
                            ? "Missing"
                            : status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card className="p-6">
          <SectionHeader title="Recent Activity" />
          {recentAttendance.length === 0 ? (
            <EmptyState>No attendance records in the last 7 days.</EmptyState>
          ) : (
            <div className="space-y-3">
              {recentAttendance.map((att) => (
                <div key={att.id} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                      att.status === "present"
                        ? "bg-emerald-100 text-emerald-700"
                        : att.status === "late"
                        ? "bg-amber-100 text-amber-700"
                        : att.status === "absent"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-slate-700">
                      <span className="font-medium">
                        {att.teacher.user.firstName} {att.teacher.user.lastName}
                      </span>{" "}
                      marked{" "}
                      <span
                        className={
                          att.status === "present"
                            ? "text-emerald-700"
                            : att.status === "late"
                            ? "text-amber-700"
                            : "text-red-700"
                        }
                      >
                        {att.status}
                      </span>{" "}
                      for {att.slot?.learningArea.name || "a lesson"}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {att.date.toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                      })}
                      {att.minutesLate
                        ? ` · ${att.minutesLate} mins late`
                        : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}