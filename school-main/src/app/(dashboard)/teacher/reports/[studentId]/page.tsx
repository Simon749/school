// src/app/(dashboard)/teacher/reports/[studentId]/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { TermReportForm } from "@/components/reports/TermReportForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeacherReportPage({
  params,
}: {
  params: { studentId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      school: {
        include: {
          terms: { where: { isCurrent: true }, select: { id: true, name: true } },
        },
      },
    },
  });

  if (!teacher || !teacher.isClassTeacher) {
    return <div className="p-8 text-red-500">Access denied. Only class teachers can generate reports.</div>;
  }

  const student = await prisma.student.findUnique({
    where: { id: params.studentId, schoolId: teacher.schoolId },
    include: {
      stream: { include: { grade: true } },
    },
  });

  if (!student) {
    return <div className="p-8 text-red-500">Student not found.</div>;
  }

  const currentTerm = teacher.school.terms[0];

  // Check if report already exists
  const existingReport = await prisma.termReport.findUnique({
    where: {
      studentId_termId: {
        studentId: params.studentId,
        termId: currentTerm?.id,
      },
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Term Report</h1>
        <p className="text-muted-foreground">
          {student.firstName} {student.lastName} • {student.stream.grade.name} {student.stream.name} • {currentTerm?.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Teacher Comments & Conduct</CardTitle>
        </CardHeader>
        <CardContent>
          <TermReportForm
            studentId={params.studentId}
            termId={currentTerm?.id}
            existingReport={existingReport}
          />
        </CardContent>
      </Card>
    </div>
  );
}