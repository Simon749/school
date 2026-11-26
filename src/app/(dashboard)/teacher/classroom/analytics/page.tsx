// src/app/(dashboard)/teacher/classroom/analytics/page.tsx
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getClassScope } from '@/lib/attendance/class-teacher-scope';
import {
  absencesByReason,
  classRate,
  summariseLearners,
  todaySnapshot,
  weeklyTrend,
} from '@/lib/attendance/class-analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const pct = (n: number | null) => (n === null ? 'No attendance recorded yet' : `${n}%`);

export default async function ClassAnalyticsPage() {
  const scope = await getClassScope();
  if (!scope.ok) return <div className="p-8 text-red-500">{scope.message}</div>;
  const { schoolId, stream, term, from, to, todayKey } = scope;

  const students = await prisma.student.findMany({
    where: { streamId: stream.id, schoolId, status: 'active', deletedAt: null },
    select: { id: true, firstName: true, lastName: true, admissionNumber: true },
    orderBy: { lastName: 'asc' },
  });
  const ids = students.map((s) => s.id);

  const [daily, lessons] = ids.length
    ? await Promise.all([
        prisma.studentDailyAttendance.findMany({
          where: { studentId: { in: ids }, schoolId, date: { gte: from, lte: to } },
          select: { studentId: true, date: true, status: true },
        }),
        prisma.studentLessonAttendance.findMany({
          where: { studentId: { in: ids }, schoolId, status: 'absent', date: { gte: from, lte: to } },
          select: {
            status: true,
            absenceReason: true,
            slot: { select: { learningArea: { select: { name: true } } } },
          },
        }),
      ])
    : [[], []];

  const learners = summariseLearners(ids, daily);
  const byId = new Map(students.map((s) => [s.id, s]));
  const rate = classRate(learners);
  const today = todaySnapshot(ids, daily, todayKey);
  const trend = weeklyTrend(daily);
  const reasons = absencesByReason(
    lessons.map((l) => ({ status: l.status, absenceReason: l.absenceReason, subject: l.slot?.learningArea.name ?? null }))
  );
  const daysRecorded = new Set(daily.map((d) => d.date.toISOString().slice(0, 10))).size;

  // Lowest attendance first; learners with nothing recorded are listed last, not as 0%.
  const ranked = [...learners].sort((a, b) => {
    if (a.ratePct === null && b.ratePct === null) return 0;
    if (a.ratePct === null) return 1;
    if (b.ratePct === null) return -1;
    return a.ratePct - b.ratePct;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Class analytics: {stream.grade.name} {stream.name}
          </h1>
          <p className="text-muted-foreground">
            Attendance for {term.name ?? 'this term'}, up to today. Only days when a register was
            taken are counted.
          </p>
        </div>
        <Link href="/teacher/classroom" className="text-sm text-blue-600 hover:underline">
          Back to class
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Class attendance, term to date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pct(rate)}</div>
            <p className="text-xs text-muted-foreground">{daysRecorded} day(s) with a register</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
          </CardHeader>
          <CardContent>
            {today.notMarked === today.total ? (
              <div className="text-lg font-semibold text-slate-600">Attendance not taken yet</div>
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {today.present + today.late}/{today.total} here
                </div>
                <p className="text-xs text-muted-foreground">
                  {today.absent} absent · {today.notMarked} not marked
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Learners</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Week by week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance has been recorded this term yet.</p>
          ) : (
            trend.map((w) => (
              <div key={w.weekStart} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">Week of {w.weekStart}</span>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div
                    className="h-3 rounded bg-emerald-500"
                    style={{ width: `${w.ratePct ?? 0}%` }}
                    role="img"
                    aria-label={`${pct(w.ratePct)} attendance`}
                  />
                </div>
                <span className="w-16 text-right font-medium">{w.ratePct === null ? '—' : `${w.ratePct}%`}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why lessons were missed</CardTitle>
        </CardHeader>
        <CardContent>
          {reasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No missed lessons recorded this term.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {reasons.map((r) => (
                <li key={r.reason} className="flex justify-between border-b py-1 last:border-0">
                  <span>{r.reason}</span>
                  <span className="font-medium">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Learners, lowest attendance first</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Attendance</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((l) => {
                const s = byId.get(l.studentId)!;
                return (
                  <TableRow key={l.studentId}>
                    <TableCell className="font-medium">
                      {s.firstName} {s.lastName}
                    </TableCell>
                    <TableCell>{l.ratePct === null ? 'Not recorded yet' : `${l.ratePct}%`}</TableCell>
                    <TableCell>{l.present}</TableCell>
                    <TableCell>{l.late}</TableCell>
                    <TableCell>{l.absent}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/teacher/classroom/students/${l.studentId}`}
                        className="text-blue-600 hover:underline"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
