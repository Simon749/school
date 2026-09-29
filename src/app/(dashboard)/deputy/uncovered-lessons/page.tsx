import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  AlertTriangle,
  UserCheck,
  Clock,
  MapPin,
  BookOpen,
  ChevronRight,
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

export default async function UncoveredLessonsPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();
  const dayOfWeek = today.getDay() || 1;

  const currentTerm = await prisma.term.findFirst({
    where: { isCurrent: true },
    orderBy: { startDate: "desc" },
  });

  // Uncovered lessons
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

  // Substitute candidates
  const allTeachers = await prisma.teacher.findMany({
    include: {
      user: true,
      timetableSlots: {
        where: { dayOfWeek, termId: currentTerm?.id },
        include: { period: true },
      },
    },
  });

  const uncoveredWithSubs = uncovered.map((slot) => {
    const slotStartMin = slot.period.orderIndex;
    const slotEndMin =
      slot.isDoubleLesson && slot.secondPeriodId ? slotStartMin + 1 : slotStartMin;

    const candidates = allTeachers
      .filter((t) => {
        if (t.id === slot.teacherId) return false;
        const hasConflict = t.timetableSlots.some((ts) => {
          const tsStart = ts.period.orderIndex;
          const tsEnd =
            ts.isDoubleLesson && ts.secondPeriodId ? tsStart + 1 : tsStart;
          return tsStart <= slotEndMin && tsEnd >= slotStartMin;
        });
        return !hasConflict;
      })
      .map((t) => {
        const specMatch = t.specialisation
          ?.toLowerCase()
          .includes(slot.learningArea.name.toLowerCase())
          ? 2
          : 1;
        return { ...t, matchScore: specMatch };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5);

    return { ...slot, candidates };
  });

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
          <h1 className="text-2xl font-bold text-slate-900">Uncovered Lessons</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {today.toLocaleDateString("en-KE", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {currentTerm ? ` · ${currentTerm.name}` : ""}
          </p>
        </div>
      </div>

      {/* Status Banner */}
      {uncoveredWithSubs.length === 0 ? (
        <div className="rounded-lg border border-l-4 border-emerald-100 border-l-emerald-500 bg-emerald-50 p-4">
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                All Lessons Covered
              </p>
              <p className="text-xs text-emerald-700">
                Every teacher has checked in for their scheduled periods today.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-l-4 border-red-100 border-l-red-500 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {uncoveredWithSubs.length} Uncovered Lesson
                {uncoveredWithSubs.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-red-700">
                Assign a substitute teacher to each period below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Cards */}
      <div className="space-y-6">
        {uncoveredWithSubs.map((slot) => (
          <Card key={slot.id} className="overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {slot.period.name} · {slot.learningArea.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {slot.stream.grade.name}
                        {slot.stream.name} · Room {slot.room || "TBD"} ·{" "}
                        {slot.period.startTime.toISOString().slice(11, 16)} –
                        {slot.period.endTime.toISOString().slice(11, 16)}
                      </p>
                    </div>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Missing Teacher
                </span>
              </div>

              {/* Assigned teacher */}
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                <span className="text-xs text-slate-400">Assigned:</span>
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[9px] bg-slate-200 text-slate-600">
                    {initials(
                      slot.teacher.user.firstName,
                      slot.teacher.user.lastName
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-slate-700">
                  {slot.teacher.user.firstName} {slot.teacher.user.lastName}
                </span>
                <span className="text-xs text-slate-400">
                  ({slot.teacher.user.phone || "no phone"})
                </span>
              </div>
            </div>

            <div className="p-5">
              <SectionHeader title="Substitute Candidates" />
              {slot.candidates.length === 0 ? (
                <EmptyState>
                  No available substitute teachers for this period.
                </EmptyState>
              ) : (
                <div className="space-y-2">
                  {slot.candidates.map((candidate, idx) => (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                          {idx + 1}
                        </span>
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-xs bg-slate-100 text-slate-700">
                            {initials(
                              candidate.user.firstName,
                              candidate.user.lastName
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {candidate.user.firstName} {candidate.user.lastName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {candidate.specialisation || "No specialisation"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {candidate.matchScore >= 2 ? (
                          <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Subject Match
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            Available
                          </span>
                        )}
                        <form
                          action={async () => {
                            "use server";
                            await prisma.teacherAttendance.create({
                              data: {
                                schoolId: slot.schoolId,
                                teacherId: slot.teacherId,
                                slotId: slot.id,
                                date: today,
                                status: "covered",
                                substituteTeacherId: candidate.id,
                              },
                            });
                          }}
                        >
                          <Button
                            type="submit"
                            size="sm"
                            className="h-7 gap-1"
                            variant={
                              candidate.matchScore >= 2 ? "default" : "outline"
                            }
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Assign
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}