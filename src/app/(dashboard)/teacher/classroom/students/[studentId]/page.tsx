// src/app/(dashboard)/teacher/classroom/students/[studentId]/page.tsx
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getClassScope } from '@/lib/attendance/class-teacher-scope';
import {
  absencesByReason,
  absencesBySubject,
  summariseLearners,
  weeklyTrend,
} from '@/lib/attendance/class-analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function StudentAttendanceAnalyticsPage({
  params,
}: {
  params: { studentId: string };
}) {
  const scope = await getClassScope();
  if (!scope.ok) return <div className="p-8 text-red-500">{scope.message}</div>;
  const { schoolId, stream, term, from, to } = scope;

  // Only a learner of THIS teacher's own class, in their own school.
  const student = await prisma.student.findFirst({
    where: { id: params.studentId, schoolId, streamId: stream.id, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, admissionNumber: true },
  });
  if (!student) return <div className="p-8 text-red-500">Learner not found in your class.</div>;

  const [daily, lessons] = await Promise.all([
    prisma.studentDailyAttendance.findMany({
      where: { studentId: student.id, schoolId, date: { gte: from, lte: to } },
      select: { studentId: true, date: true, status: true },
    }),
    prisma.studentLessonAttendance.findMany({
      where: { studentId: student.id, schoolId, status: 'absent', date: { gte: from, lte: to } },
      select: {
        status: true,
        absenceReason: true,
        slot: { select: { learningArea: { select: { name: true } } } },
      },
    }),
  ]);

  const [summary] = summariseLearners([student.id], daily);
  const trend = weeklyTrend(daily);
  const lessonRows = lessons.map((l) => ({
    status: l.status,
    absenceReason: l.absenceReason,
    subject: l.slot?.learningArea.name ?? null,
  }));
  const reasons = absencesByReason(lessonRows);
  const subjects = absencesBySubject(lessonRows);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {student.firstName} {student.lastName}
          </h1>
          <p className="text-muted-foreground">
            {stream.grade.name} {stream.name} · {student.admissionNumber ?? 'No admission number'} ·
            attendance for {term.name ?? 'this term'}, up to today
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <Link href="/teacher/classroom/analytics" className="text-blue-600 hover:underline">
            Class analytics
          </Link>
          <Link href={`/teacher/reports/${student.id}`} className="text-blue-600 hover:underline">
            Write term report
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary!.ratePct === null ? 'Not recorded yet' : `${summary!.ratePct}%`}
            </div>
            <p className="text-xs text-muted-foreground">{summary!.recordedDays} day(s) with a register</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Present</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary!.present}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Late</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary!.late}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary!.absent}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Week by week</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance has been recorded for this learner yet.</p>
          ) : (
            trend.map((w) => (
              <div key={w.weekStart} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">Week of {w.weekStart}</span>
                <div className="h-3 flex-1 rounded bg-slate-100">
                  <div
                    className="h-3 rounded bg-emerald-500"
                    style={{ width: `${w.ratePct ?? 0}%` }}
                    role="img"
                    aria-label={`${w.ratePct ?? 0}% attendance`}
                  />
                </div>
                <span className="w-16 text-right font-medium">{w.ratePct === null ? '—' : `${w.ratePct}%`}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            <CardTitle>Lessons missed by subject</CardTitle>
          </CardHeader>
          <CardContent>
            {subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No missed lessons recorded this term.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {subjects.map((s) => (
                  <li key={s.subject} className="flex justify-between border-b py-1 last:border-0">
                    <span>{s.subject}</span>
                    <span className="font-medium">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
