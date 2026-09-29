"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  FileText,
  ShieldAlert,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Banknote,
  Receipt,
  Smartphone,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  Info,
  Calendar,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Defaulter {
  id: string;
  studentName: string;
  stream: string;
  balance: number;
  daysOverdue: number;
}

interface Payment {
  id: string;
  studentName: string;
  stream: string;
  amount: number;
  method: string;
  paidAt: string;
  receiptNumber: string;
}

interface PaymentMethodStat {
  method: string;
  amount: number;
  count: number;
  percentage: number;
}

interface DailyCollection {
  date: string;
  dayLabel: string;
  amount: number;
}

interface DashboardData {
  school: { name: string; term: string | null };
  generatedAt: string;
  summary: {
    totalCollected: number;
    totalOutstanding: number;
    targetAmount: number;
    collectionRate: number;
    defaultersCount: number;
    paymentsToday: number;
    amountToday: number;
    disputesOpen: number;
  };
  recentPayments: Payment[];
  topDefaulters: Defaulter[];
  paymentMethods: PaymentMethodStat[];
  dailyCollections: DailyCollection[];
  feeStructureSummary: {
    mandatoryTotal: number;
    optionalTotal: number;
    itemsCount: number;
  };
}

// ---------------------------------------------------------------------------
// Shared Components (matching Admin dashboard)
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

// ---------------------------------------------------------------------------
// Section: Financial Overview
// ---------------------------------------------------------------------------

function FinancialOverview({ data }: { data: DashboardData }) {
  const { summary, school } = data;
  const hasTerm = !!school.term;
  const pct = summary.targetAmount > 0 ? Math.round((summary.totalCollected / summary.targetAmount) * 100) : 0;

  return (
    <Card className="p-6">
      <SectionHeader title="Financial Overview" action="Full report" href="/bursar/reports" />

      {!hasTerm ? (
        <EmptyState>No current term is set up yet — fee figures will appear once one is.</EmptyState>
      ) : summary.targetAmount === 0 ? (
        <EmptyState>No fee structure has been set up for this term yet.</EmptyState>
      ) : (
        <>
          <div className="mb-6">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wide text-slate-500">Collection Progress</span>
              <span className="font-mono text-sm font-medium text-slate-800">{pct}% collected</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-xs text-slate-500">
              <span>{formatKes(summary.totalCollected)} collected</span>
              <span>{formatKes(summary.targetAmount)} target</span>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-50 p-3 text-center">
              <p className="mb-1 text-xs text-slate-500">Outstanding</p>
              <p className="font-mono text-sm font-semibold text-slate-900">
                {formatKes(summary.totalOutstanding)}
              </p>
            </div>
            <div className="rounded-lg bg-red-50 p-3 text-center">
              <p className="mb-1 text-xs text-red-500">Defaulters</p>
              <p className="font-mono text-sm font-semibold text-red-700">{summary.defaultersCount}</p>
              <p className="mt-0.5 text-xs text-red-400">students</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <p className="mb-1 text-xs text-emerald-600">Today</p>
              <p className="font-mono text-sm font-semibold text-emerald-800">
                {formatKes(summary.amountToday)}
              </p>
              <p className="mt-0.5 text-xs text-emerald-500">{summary.paymentsToday} payments</p>
            </div>
          </div>

          {data.dailyCollections.length > 0 && (
            <div>
              <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">7-Day Collection Trend</p>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={data.dailyCollections} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
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
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Recent Payments
// ---------------------------------------------------------------------------

function RecentPayments({ data }: { data: DashboardData }) {
  return (
    <Card className="p-6">
      <SectionHeader title="Recent Payments" action="View all" href="/bursar/fees/payments" />

      {data.recentPayments.length === 0 ? (
        <EmptyState>No payments recorded yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {data.recentPayments.map((payment) => (
            <div
              key={payment.id}
              className="flex items-start justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                  <Smartphone className="h-3.5 w-3.5 text-emerald-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{payment.studentName}</p>
                  <p className="text-xs text-slate-500">{payment.stream}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-400">{payment.receiptNumber}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-semibold text-emerald-700">
                  {formatKes(payment.amount)}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(payment.paidAt).toLocaleTimeString("en-KE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-slate-500 capitalize">{payment.method}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Defaulters Alert
// ---------------------------------------------------------------------------

function DefaultersAlert({ data }: { data: DashboardData }) {
  return (
    <Card className="p-6">
      <SectionHeader title="Top Defaulters" action="View all" href="/bursar/reports" />

      {data.topDefaulters.length === 0 ? (
        <EmptyState>No outstanding balances — great job!</EmptyState>
      ) : (
        <div className="space-y-3">
          {data.topDefaulters.map((defaulter) => (
            <div
              key={defaulter.id}
              className="flex items-start justify-between rounded-lg border border-l-4 border-l-red-400 border-slate-100 bg-red-50 p-3"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-slate-800">{defaulter.studentName}</p>
                  <p className="text-xs text-slate-500">{defaulter.stream}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-red-600">
                      <Clock className="h-2.5 w-2.5" />
                      {defaulter.daysOverdue} days overdue
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-red-700">{formatKes(defaulter.balance)}</p>
                <Link
                  href={`/bursar/fees/record?studentId=${defaulter.id}`}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  Record payment <ArrowRight className="h-2.5 w-2.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Payment Methods
// ---------------------------------------------------------------------------

function PaymentMethods({ data }: { data: DashboardData }) {
  const COLORS = ["#10b981", "#64748b", "#f59e0b", "#8b5cf6"];

  return (
    <Card className="p-6">
      <SectionHeader title="Payment Methods" />

      {data.paymentMethods.length === 0 ? (
        <EmptyState>No payment data available yet.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data.paymentMethods}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="amount"
                >
                  {data.paymentMethods.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => formatKes(Number(v))}
                  contentStyle={{ fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 6 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {data.paymentMethods.map((method, index) => (
              <div key={method.method} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-sm capitalize text-slate-700">{method.method}</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-medium text-slate-800">{formatKes(method.amount)}</p>
                  <p className="text-xs text-slate-500">{method.count} transactions</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Fee Structure Summary
// ---------------------------------------------------------------------------

function FeeStructureSummary({ data }: { data: DashboardData }) {
  const { feeStructureSummary } = data;

  return (
    <Card className="p-6">
      <SectionHeader title="Fee Structure" action="Manage" href="/bursar/fees/structure" />

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-slate-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-600" />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mandatory Fees</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatKes(feeStructureSummary.mandatoryTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Per student average</p>
        </div>
        <div className="rounded-lg bg-violet-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-violet-600" />
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Optional Activities</p>
          </div>
          <p className="text-2xl font-bold text-violet-700">{formatKes(feeStructureSummary.optionalTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">Per student average</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-100 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Total Fee Items</span>
          <span className="font-mono text-sm font-semibold text-slate-900">
            {feeStructureSummary.itemsCount} items
          </span>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Open Disputes
// ---------------------------------------------------------------------------

function OpenDisputes({ data }: { data: DashboardData }) {
  return (
    <Card className="p-6">
      <SectionHeader title="Payment Disputes" action="Resolve" href="/bursar/fees/disputes" />

      {data.summary.disputesOpen === 0 ? (
        <EmptyState>No open disputes — all clear!</EmptyState>
      ) : (
        <div className="rounded-lg border border-l-4 border-l-amber-400 border-slate-100 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 flex-shrink-0 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">
                {data.summary.disputesOpen} {data.summary.disputesOpen === 1 ? "dispute" : "disputes"} pending review
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Parents have raised payment discrepancies that need your attention.
              </p>
            </div>
            <Link
              href="/bursar/fees/disputes"
              className="flex-shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm hover:bg-amber-100"
            >
              Review
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function BursarDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/bursar/dashboard");
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
        <h1 className="text-2xl font-bold text-slate-900">Bursar dashboard</h1>
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
            {greetingForHour(hour)} {data.school.name} Bursar
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data.school.name}
            {data.school.term ? ` · ${data.school.term}` : ""} — here's your financial overview.
          </p>
        </div>
        <p className="hidden text-xs text-slate-400 sm:block">{dateStr}</p>
      </div>

      {/* School Pulse - Financial Metrics */}
      <section>
        <SectionHeader title="Financial Pulse" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <PulseCard
            icon={Banknote}
            accent="bg-emerald-500"
            label="Total Collected"
            value={formatKes(data.summary.totalCollected)}
            sublabel={data.school.term || "this term"}
            trend="up"
          />
          <PulseCard
            icon={CreditCard}
            accent="bg-amber-500"
            label="Outstanding"
            value={formatKes(data.summary.totalOutstanding)}
            sublabel={`${data.summary.defaultersCount} defaulters`}
            trend="down"
          />
          <PulseCard
            icon={Receipt}
            accent="bg-slate-700"
            label="Today's Payments"
            value={`${data.summary.paymentsToday}`}
            sublabel={formatKes(data.summary.amountToday)}
            trend="neutral"
          />
          <PulseCard
            icon={ShieldAlert}
            accent="bg-red-500"
            label="Open Disputes"
            value={`${data.summary.disputesOpen}`}
            sublabel="needs attention"
            trend={data.summary.disputesOpen > 0 ? "down" : "neutral"}
          />
        </div>
      </section>

      {/* Financial Overview + Recent Payments */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FinancialOverview data={data} />
        <RecentPayments data={data} />
      </div>

      {/* Defaulters + Payment Methods */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DefaultersAlert data={data} />
        <PaymentMethods data={data} />
      </div>

      {/* Fee Structure + Disputes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FeeStructureSummary data={data} />
        <OpenDisputes data={data} />
      </div>
    </div>
  );
}