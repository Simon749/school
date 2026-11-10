// src/app/(dashboard)/teacher/reports/[studentId]/page.tsx
import { prisma } from '@/lib/db';
import { requirePageTeacher } from '@/lib/auth/current-user';
import { TermReportForm } from '@/components/reports/TermReportForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function TeacherReportPage({ params }: { params: { studentId: string } }) {
  // FEAT-01: the teacher record is keyed by the internal user id, not the Clerk id.
  const { teacher } = await requirePageTeacher();

  if (!teacher.isClassTeacher || !teacher.classTeacherStreamId) {
    return (
      <div className="p-8 text-red-500">
        Access denied. Only class teachers can generate reports.
      </div>
    );
  }

  // Only students of THIS teacher's own class (the API enforces the same rule).
  const student = await prisma.student.findFirst({
    where: {
      id: params.studentId,
      schoolId: teacher.schoolId,
      streamId: teacher.classTeacherStreamId,
      deletedAt: null,
    },
    include: {
      stream: { include: { grade: true } },
    },
  });

  if (!student) {
    return <div className="p-8 text-red-500">Student not found.</div>;
  }

  const currentTerm = await prisma.term.findFirst({
    where: { schoolId: teacher.schoolId, isCurrent: true },
    select: { id: true, name: true },
  });

  if (!currentTerm) {
    return (
      <div className="p-8 text-red-500">
        No current term is set for this school. Ask the school admin to mark the current term.
      </div>
    );
  }

  // Check if report already exists
  const existingReport = await prisma.termReport.findUnique({
    where: {
      studentId_termId: {
        studentId: params.studentId,
        termId: currentTerm.id,
      },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Term Report</h1>
        <p className="text-muted-foreground">
          {student.firstName} {student.lastName} • {student.stream.grade.name} {student.stream.name}{' '}
          • {currentTerm.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Teacher Comments & Conduct</CardTitle>
        </CardHeader>
        <CardContent>
          <TermReportForm
            studentId={params.studentId}
            termId={currentTerm.id}
            existingReport={existingReport}
          />
        </CardContent>
      </Card>
    </div>
  );
}
