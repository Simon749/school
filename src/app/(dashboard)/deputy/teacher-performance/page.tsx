import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </h2>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
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
    trend === "up"
      ? "text-emerald-600"
      : trend === "down"
      ? "text-red-500"
      : "text-slate-500";
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-2xl font-bold leading-none text-slate-900">{value}</p>
      <span className={`mt-1 flex items-center gap-1 font-mono text-xs ${trendColor}`}>
        {trend && <TrendIcon className="h-2.5 w-2.5" />}
        {sublabel}
      </span>
    </div>
  );
}

export default async function TeacherPerformancePage() {
  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true },
    orderBy: { startDate: "desc" },
  });

  const termStart = currentTerm?.startDate ?? new Date();
  const termEnd = currentTerm?.endDate ?? new Date();

  const teachers = await prisma.teacher.findMany({
    include: {
      user: true,
      classTeacherStream: { include: { grade: true } },
      timetableSlots: {
        where: currentTerm ? { termId: currentTerm.id } : {},
        include: { period: true, learningArea: true, stream: { include: { grade: true } } },
      },
    },
  });

  const allAttendance = await prisma.teacherAttendance.findMany({
    where: { date: { gte: termStart, lte: termEnd } },
  });

  const teacherStats = teachers.map((teacher) => {
    const teacherAtt = allAttendance.filter((a) => a.teacherId === teacher.id);
    const totalSlots = teacher.timetableSlots.length;
    const present = teacherAtt.filter((a) => a.status === "present").length;
    const late = teacherAtt.filter((a) => a.status === "late").length;
    const absent = teacherAtt.filter((a) => a.status === "absent").length;
    const covered = teacherAtt.filter((a) => a.status === "covered").length;

    const totalMarked = present + late + absent + covered;
    const punctualityRate =
      totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0;
    const reliabilityRate =
      totalMarked > 0
        ? Math.round(((present + late + covered) / totalMarked) * 100)
        : 0;

    const weeksInTerm = Math.max(
      1,
      Math.ceil(
        (termEnd.getTime() - termStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
    );
    const estimatedLessons = totalSlots * weeksInTerm * 5;
    const completionRate =
      estimatedLessons > 0
        ? Math.round(((present + late + covered) / estimatedLessons) * 100)
        : 0;

    return {
      ...teacher,
      stats: {
        present,
        late,
        absent,
        covered,
        totalMarked,
        punctualityRate,
        reliabilityRate,
        completionRate,
        estimatedLessons,
      },
    };
  });

  teacherStats.sort((a, b) => a.stats.reliabilityRate - b.stats.reliabilityRate);

  const avgPunctuality =
    teacherStats.length > 0
      ? Math.round(
          teacherStats.reduce((s, t) => s + t.stats.punctualityRate, 0) /
            teacherStats.length
        )
      : 0;
  const avgReliability =
    teacherStats.length > 0
      ? Math.round(
          teacherStats.reduce((s, t) => s + t.stats.reliabilityRate, 0) /
            teacherStats.length
        )
      : 0;
  const teachersWithIssues = teacherStats.filter(
    (t) => t.stats.reliabilityRate < 80
  ).length;
  const totalLate = teacherStats.reduce((s, t) => s + t.stats.late, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/deputy">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Teacher Performance
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {currentTerm?.name ?? "Current Term"} · Attendance & Punctuality
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <section>
        <SectionHeader title="Overview" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500">
              <CheckCircle2 className="h-4 w-4 text-white" />
            </div>
            <Stat
              label="Avg. Punctuality"
              value={`${avgPunctuality}%`}
              sublabel="On-time arrivals"
              trend={avgPunctuality >= 90 ? "up" : "neutral"}
            />
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <Stat
              label="Avg. Reliability"
              value={`${avgReliability}%`}
              sublabel="Present + covered"
              trend={avgReliability >= 90 ? "up" : "neutral"}
            />
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-red-500">
              <AlertCircle className="h-4 w-4 text-white" />
            </div>
            <Stat
              label="Teachers with Issues"
              value={String(teachersWithIssues)}
              sublabel="Below 80% reliability"
              trend={teachersWithIssues > 0 ? "down" : "up"}
            />
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <Stat
              label="Total Late Arrivals"
              value={String(totalLate)}
              sublabel="This term"
              trend="neutral"
            />
          </Card>
        </div>
      </section>

      {/* Teacher List */}
      <Card className="p-6">
        <SectionHeader title="Performance Breakdown" />
        {teacherStats.length === 0 ? (
          <EmptyState>No teacher data available for this term.</EmptyState>
        ) : (
          <div className="space-y-5">
            {teacherStats.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-slate-100 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-slate-100 text-slate-700 text-xs">
                        {initials(t.user.firstName, t.user.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {t.user.firstName} {t.user.lastName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {t.specialisation || "No specialisation"}
                        {t.classTeacherStream
                          ? ` · Class teacher ${t.classTeacherStream.grade.name}${t.classTeacherStream.name}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                      t.stats.reliabilityRate >= 95
                        ? "bg-emerald-100 text-emerald-700"
                        : t.stats.reliabilityRate >= 80
                        ? "bg-blue-100 text-blue-700"
                        : t.stats.reliabilityRate >= 60
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {t.stats.reliabilityRate >= 95
                      ? "Excellent"
                      : t.stats.reliabilityRate >= 80
                      ? "Good"
                      : t.stats.reliabilityRate >= 60
                      ? "Needs Attention"
                      : "Critical"}
                  </span>
                </div>

                {/* Metrics */}
                <div className="space-y-2">
                  {/* Reliability */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-slate-500">
                      Reliability
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          t.stats.reliabilityRate >= 80
                            ? "bg-emerald-500"
                            : t.stats.reliabilityRate >= 60
                            ? "bg-amber-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${Math.min(100, t.stats.reliabilityRate)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-slate-800">
                      {t.stats.reliabilityRate}%
                    </span>
                  </div>

                  {/* Punctuality */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-slate-500">
                      Punctuality
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${Math.min(100, t.stats.punctualityRate)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-slate-800">
                      {t.stats.punctualityRate}%
                    </span>
                  </div>

                  {/* Completion */}
                  <div className="flex items-center gap-3">
                    <span className="w-20 flex-shrink-0 text-xs text-slate-500">
                      Completion
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-violet-400"
                        style={{ width: `${Math.min(100, t.stats.completionRate)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs text-slate-800">
                      {t.stats.completionRate}%
                    </span>
                  </div>
                </div>

                {/* Mini stats row */}
                <div className="mt-3 flex gap-4 border-t border-slate-50 pt-2 font-mono text-xs">
                  <span className="text-emerald-600">{t.stats.present} present</span>
                  <span className="text-amber-600">{t.stats.late} late</span>
                  <span className="text-red-600">{t.stats.absent} absent</span>
                  <span className="text-blue-600">{t.stats.covered} covered</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}