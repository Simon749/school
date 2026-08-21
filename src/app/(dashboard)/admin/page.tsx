"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ClipboardCheck,
  Banknote,
  BarChart3,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  AlertCircle,
  Info,
  CreditCard,
  UserCheck,
  BookOpen,
  Smartphone,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types — mirror the exact shape returned by /api/admin/dashboard.
// Every field here is real data computed server-side; nothing in this file
// is mock/sample data (see AGENTS.md §82 — never fake real-time).
// ---------------------------------------------------------------------------

interface Alert {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  actionLabel: string;
  actionHref: string;
}

interface DashboardData {
  school: { name: string; term: string | null };
  generatedAt: string;
  calendar: { isSchoolDayToday: boolean; dayType: string | null };
  pulse: {
    activeStudents: number;
    newThisTerm: number;
    activeTeachers: number;
    teachersCheckedInToday: number;
    studentAttendanceTodayPct: number | null;
    collectionRatePct: number;
    feesCollectedTerm: number;
  };
  alerts: Alert[];
  financial: {
    collected: number;
    target: number;
    outstanding: number;
    collectionRatePct: number;
    todayMpesa: { amount: number; count: number };
    weeklyTrend: { weekLabel: string; amount: number }[];
    recentPayments: {
      id: string;
      name: string;
      stream: string;
      amount: number;
      method: string;
      time: string;
    }[];
    studentsOverBalanceThreshold: number;
    balanceThreshold: number;
  };
  attendance: {
    studentToday: { recorded: number; present: number; pct: number | null };
    teacherTodayPct: number | null;
    teachersCheckedInToday: number;
    activeTeachersCount: number;
    weeklyTrend: { date: string; dayLabel: string; students: number | null; teachers: number | null }[];
  };
  academic: {
    overallScorePct: number | null;
    byGrade: { grade: string; scorePct: number; count: number }[];
    needsAttention: { subject: string; grade: string; scorePct: number }[];
    unpublishedAssessments: number;
  };
  enrolment: {
    total: number;
    newThisTerm: number;
    boarding: number;
    day: number;
    girls: number;
    boys: number;
    byGrade: { grade: string; count: number }[];
  };
  recentActivity: { type: "enrolment" | "payment" | "assessment"; text: string; time: string }[];
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function SectionHeader({ title, action, href }: { title: string; action?: string; href?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">{title}</h2>
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

function formatKes(n: number) {
  if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${n.toLocaleString()}`;
}

function Stat({
  label,
  value,
  sublabel,
  trend,
}: {
  label: string;
  value: string;
  sublabel: string;
  trend?: "up" | "down" | "neutral";
}) {
  const trendColor =
    trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-slate-500";
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
      <span className={`mt-1 flex items-center gap-1 font-mono text-xs ${trendColor}`}>
        {trend && <TrendIcon className="h-2.5 w-2.5" />}
        {sublabel}
      </span>
    </div>
  );
}

function PulseCard({
  icon: Icon,
  accent,
  ...stat
}: {
  icon: React.ElementType;
  accent: string;
} & Parameters<typeof Stat>[0]) {
  return (
    <Card className="p-5 transition-shadow hover:shadow-md">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <Stat {...stat} />
    </Card>
  );
}

const SEVERITY_STYLES: Record<
  Alert["severity"],
  { border: string; icon: React.ElementType; iconColor: string }
> = {
  critical: { border: "border-l-red-500", icon: AlertCircle, iconColor: "text-red-500" },
  high: { border: "border-l-orange-400", icon: AlertTriangle, iconColor: "text-orange-500" },
  medium: { border: "border-l-amber-400", icon: AlertTriangle, iconColor: "text-amber-500" },
  low: { border: "border-l-blue-400", icon: Info, iconColor: "text-blue-500" },
};

function AlertCard({ alert }: { alert: Alert }) {
  const cfg = SEVERITY_STYLES[alert.severity];
  const Icon = cfg.icon;
  return (
    <div className={`rounded-lg border border-l-4 border-slate-100 bg-white p-4 ${cfg.border}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.iconColor}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-slate-800">{alert.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p>
        </div>
        <Link
          href={alert.actionHref}
          className="mt-0.5 flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:text-emerald-800"
        >
          {alert.actionLabel} <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

// ---------------------------------------------------------------------------
// Section: Financial Health
// ---------------------------------------------------------------------------

function FinancialHealth({ data }: { data: DashboardData }) {
  const { financial, school } = data;
  const hasTerm = !!school.term;
  const pct = financial.target > 0 ? Math.round((financial.collected / financial.target) * 100) : 0;

  return (
    <Card className="p-6">
      <SectionHeader title="Financial Health" action="Bursar dashboard" href="/bursar" />

      {!hasTerm ? (
        <EmptyState>No current term is set up yet — fee figures will appear once one is.</EmptyState>
      ) : financial.target === 0 ? (
        <EmptyState>No fee structure has been set up for this term yet.</EmptyState>
      ) : (
        <>
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Collection vs Target</span>
              <span className="font-mono text-sm font-medium text-slate-800">{pct}% collected</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-xs text-slate-500">
              <span>{formatKes(financial.collected)} collected</span>
              <span>{formatKes(financial.target)} target</span>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="mb-1 text-xs text-slate-500">Outstanding</p>
              <p className="font-mono text-sm font-semibold text-slate-900">
                {formatKes(financial.outstanding)}
              </p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <p className="mb-1 text-xs text-red-500">Balances &gt; {formatKes(financial.balanceThreshold)}</p>
              <p className="font-mono text-sm font-semibold text-red-700">
                {financial.studentsOverBalanceThreshold}
              </p>
              <p className="mt-0.5 text-xs text-red-400">students</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <p className="mb-1 text-xs text-emerald-600">Today M-Pesa</p>
              <p className="font-mono text-sm font-semibold text-emerald-800">
                {formatKes(financial.todayMpesa.amount)}
              </p>
              <p className="mt-0.5 text-xs text-emerald-500">{financial.todayMpesa.count} txns</p>
            </div>
          </div>

          {financial.weeklyTrend.length > 0 && (
            <div>
              <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Payment Trend</p>
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={financial.weeklyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(v) => [formatKes(Number(v ?? 0)), "Collected"]}
                    contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 6 }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fill="url(#feeGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {financial.recentPayments.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Recent Payments</p>
              <div className="space-y-2">
                {financial.recentPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Smartphone className="h-2.5 w-2.5" />
                      </div>
                      <span className="font-medium text-slate-700">{p.name}</span>
                      <span className="text-slate-400">{p.stream}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium text-slate-800">
                        KES {p.amount.toLocaleString()}
                      </span>
                      <span className="text-slate-400">
                        {new Date(p.time).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Attendance & Operations
// ---------------------------------------------------------------------------

function AttendanceSection({ data }: { data: DashboardData }) {
  const { attendance, calendar } = data;

  return (
    <Card className="p-6">
      <SectionHeader title="Attendance & Operations" action="Full report" href="/admin/attendance" />

      {!calendar.isSchoolDayToday && (
        <div className="mb-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {calendar.dayType
            ? `Today is marked as "${calendar.dayType.replace("_", " ")}" — normal lesson attendance is not expected.`
            : "The school calendar has no entry for today, so attendance can't be calculated yet."}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-xs text-slate-500">Student Attendance Today</p>
          <p className="text-3xl font-bold text-emerald-600">
            {attendance.studentToday.pct !== null ? `${attendance.studentToday.pct}%` : "—"}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {attendance.studentToday.recorded > 0
              ? `${attendance.studentToday.present} of ${attendance.studentToday.recorded} recorded present`
              : "No records yet today"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-2 text-xs text-slate-500">Teacher Attendance Today</p>
          <p className="text-3xl font-bold text-slate-800">
            {attendance.teacherTodayPct !== null ? `${attendance.teacherTodayPct}%` : "—"}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {attendance.teachersCheckedInToday} of {attendance.activeTeachersCount} checked in
          </p>
        </div>
      </div>

      {attendance.weeklyTrend.length > 0 ? (
        <div>
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Weekly Trend</p>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={attendance.weeklyTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} hide />
              <Tooltip
                formatter={(v: number, name: string) => [
                  v === null ? "No data" : `${v}%`,
                  name === "students" ? "Students" : "Teachers",
                ]}
                contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 6 }}
              />
              <Line type="monotone" dataKey="students" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} connectNulls={false} />
              <Line
                type="monotone"
                dataKey="teachers"
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="4 2"
                dot={{ r: 3, fill: "#64748b" }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-0.5 w-3 bg-emerald-500" /> Students
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="inline-block h-0.5 w-3 border-t-2 border-dashed border-slate-500" /> Teachers
            </span>
          </div>
        </div>
      ) : (
        <EmptyState>No school days recorded on the calendar yet — set up the calendar to see trends.</EmptyState>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Academic Health
// ---------------------------------------------------------------------------

function AcademicHealth({ data }: { data: DashboardData }) {
  const { academic } = data;

  return (
    <Card className="p-6">
      <SectionHeader title="Academic Health" action="Full report" href="/admin/reports" />

      {academic.overallScorePct === null ? (
        <EmptyState>No published assessment results yet this term.</EmptyState>
      ) : (
        <>
          <div className="mb-5 flex items-baseline gap-6 border-b border-slate-100 pb-5">
            <div>
              <p className="mb-1 text-xs text-slate-500">Overall Performance (published results)</p>
              <p className="text-4xl font-bold text-slate-900">
                {academic.overallScorePct}
                <span className="text-lg text-slate-400">%</span>
              </p>
            </div>
          </div>

          {academic.byGrade.length > 0 && (
            <div className="mb-5">
              <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Performance by Grade</p>
              <div className="space-y-2">
                {academic.byGrade.map((g) => (
                  <div key={g.grade} className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-slate-600">{g.grade}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          g.scorePct >= 75 ? "bg-emerald-500" : g.scorePct >= 60 ? "bg-amber-400" : "bg-red-400"
                        }`}
                        style={{ width: `${g.scorePct}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-slate-800">{g.scorePct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {academic.needsAttention.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Needs Attention</p>
              <div className="space-y-1.5">
                {academic.needsAttention.map((s) => (
                  <div key={`${s.subject}-${s.grade}`} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">
                      {s.subject} · <span className="text-slate-500">{s.grade}</span>
                    </span>
                    <span className="font-mono text-red-600">{s.scorePct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Enrolment
// ---------------------------------------------------------------------------

function EnrolmentSection({ data }: { data: DashboardData }) {
  const { enrolment } = data;
  const boardingPct = enrolment.total > 0 ? Math.round((enrolment.boarding / enrolment.total) * 100) : 0;
  const girlsPct = enrolment.total > 0 ? Math.round((enrolment.girls / enrolment.total) * 100) : 0;

  if (enrolment.total === 0) {
    return (
      <Card className="p-6">
        <SectionHeader title="Enrolment" action="Manage students" href="/admin/students" />
        <EmptyState>No active students yet — enrol your first student to see this section.</EmptyState>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <SectionHeader title="Enrolment" action="Manage students" href="/admin/students" />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-xl font-bold text-slate-900">{enrolment.total}</p>
          <p className="text-xs text-slate-500">Total</p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-3 text-center">
          <p className="text-xl font-bold text-emerald-700">+{enrolment.newThisTerm}</p>
          <p className="text-xs text-emerald-600">New this term</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-xl font-bold text-slate-900">{enrolment.boarding}</p>
          <p className="text-xs text-slate-500">Boarding</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Day vs Boarding</p>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-l-full bg-slate-700" style={{ width: `${100 - boardingPct}%` }} />
          <div className="h-full rounded-r-full bg-emerald-500" style={{ width: `${boardingPct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-700" /> Day {enrolment.day}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Boarding {enrolment.boarding}
          </span>
        </div>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Gender Distribution</p>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-l-full bg-violet-400" style={{ width: `${girlsPct}%` }} />
          <div className="h-full rounded-r-full bg-sky-400" style={{ width: `${100 - girlsPct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-violet-400" /> Girls {enrolment.girls}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> Boys {enrolment.boys}
          </span>
        </div>
      </div>

      {enrolment.byGrade.length > 0 && (
        <div>
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">Students by Grade</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={enrolment.byGrade} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="grade" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(v: number) => [v, "Students"]}
                contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 6 }}
              />
              <Bar dataKey="count" fill="#0d9488" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Recent Activity
// ---------------------------------------------------------------------------

const ACTIVITY_ICON: Record<
  DashboardData["recentActivity"][number]["type"],
  { icon: React.ElementType; color: string }
> = {
  payment: { icon: CreditCard, color: "bg-emerald-100 text-emerald-700" },
  enrolment: { icon: UserCheck, color: "bg-violet-100 text-violet-700" },
  assessment: { icon: BookOpen, color: "bg-amber-100 text-amber-700" },
};

function RecentActivity({ data }: { data: DashboardData }) {
  return (
    <Card className="p-6">
      <SectionHeader title="Recent Activity" />
      {data.recentActivity.length === 0 ? (
        <EmptyState>Nothing recorded yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {data.recentActivity.map((item, i) => {
            const cfg = ACTIVITY_ICON[item.type];
            const Icon = cfg.icon;
            return (
              <div key={i} className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${cfg.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <p className="flex-1 text-sm leading-snug text-slate-700">{item.text}</p>
                <span className="flex-shrink-0 font-mono text-xs text-slate-400">
                  {new Date(item.time).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load dashboard");
        }
        const json = (await res.json()) as DashboardData;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Admin dashboard</h1>
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Something went wrong loading your dashboard."}
        </p>
      </div>
    );
  }

  const hour = new Date().getHours();
  const dateStr = new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {greetingForHour(hour)} 👋
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data.school.name}
            {data.school.term ? ` · ${data.school.term}` : ""} — here's what's happening today.
          </p>
        </div>
        <p className="hidden text-xs text-slate-400 sm:block">{dateStr}</p>
      </div>

      {/* School Pulse */}
      <section>
        <SectionHeader title="School Pulse" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <PulseCard
            icon={Users}
            accent="bg-emerald-500"
            label="Active Learners"
            value={String(data.pulse.activeStudents)}
            sublabel={`+${data.pulse.newThisTerm} this term`}
            trend={data.pulse.newThisTerm > 0 ? "up" : "neutral"}
          />
          <PulseCard
            icon={ClipboardCheck}
            accent="bg-teal-600"
            label="Today's Attendance"
            value={data.pulse.studentAttendanceTodayPct !== null ? `${data.pulse.studentAttendanceTodayPct}%` : "—"}
            sublabel={data.calendar.isSchoolDayToday ? "students recorded" : "not a school day"}
            trend="neutral"
          />
          <PulseCard
            icon={Banknote}
            accent="bg-slate-700"
            label="Fees Collected"
            value={formatKes(data.pulse.feesCollectedTerm)}
            sublabel={data.school.term || "no current term"}
            trend="neutral"
          />
          <PulseCard
            icon={BarChart3}
            accent="bg-amber-500"
            label="Collection Rate"
            value={`${data.pulse.collectionRatePct}%`}
            sublabel="of this term's fees"
            trend={data.pulse.collectionRatePct >= 80 ? "up" : "down"}
          />
          <PulseCard
            icon={GraduationCap}
            accent="bg-violet-500"
            label="Teachers"
            value={String(data.pulse.activeTeachers)}
            sublabel={`${data.pulse.teachersCheckedInToday} checked in today`}
            trend="neutral"
          />
        </div>
      </section>

      {/* Needs Attention */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Needs Attention</h2>
          <span className="font-mono text-xs text-slate-400">{data.alerts.length} items</span>
        </div>
        {data.alerts.length === 0 ? (
          <Card className="p-6">
            <EmptyState>Nothing needs your attention right now.</EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        )}
      </section>

      {/* Financial + Attendance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FinancialHealth data={data} />
        <AttendanceSection data={data} />
      </div>

      {/* Academic + Enrolment */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AcademicHealth data={data} />
        <EnrolmentSection data={data} />
      </div>

      {/* Recent Activity */}
      <RecentActivity data={data} />
    </div>
  );
}