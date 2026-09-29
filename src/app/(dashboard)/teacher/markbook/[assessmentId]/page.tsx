// src/app/(dashboard)/teacher/markbook/[assessmentId]/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { MarksEntryTable } from "@/components/results/MarksEntryTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function MarksEntryPage({ params }: { params: { assessmentId: string } }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) redirect("/");

  const assessment = await prisma.assessment.findUnique({
    where: { id: params.assessmentId, teacherId: teacher.id, schoolId: teacher.schoolId },
    include: {
      learningArea: {
        include: { strands: { include: { subStrands: true } } },
      },
      stream: true,
      term: true,
    },
  });

  if (!assessment) {
    return <div className="p-8 text-red-500">Assessment not found or access denied.</div>;
  }

  const students = await prisma.student.findMany({
    where: { streamId: assessment.streamId, schoolId: teacher.schoolId, status: "active" },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, admissionNumber: true },
  });

  const existingResults = await prisma.assessmentResult.findMany({
    where: { assessmentId: assessment.id },
    include: { rubricScores: true },
  });

  // Flatten sub-strands for the table columns
  const subStrands = assessment.learningArea.strands.flatMap((strand) =>
    strand.subStrands.map((ss) => ({
      id: ss.id,
      name: ss.name,
      strandName: strand.name,
    }))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{assessment.title}</h1>
          <p className="text-muted-foreground">
            {assessment.learningArea.name} • {assessment.stream.name} • {assessment.term.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={assessment.status === "published" ? "default" : "secondary"}>
            {assessment.status.toUpperCase()}
          </Badge>
          <Link href="/teacher/markbook">
            <Button variant="outline">Back to Markbook</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Enter Marks & Rubric Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <MarksEntryTable
            assessmentId={assessment.id}
            students={students}
            subStrands={subStrands}
            existingResults={existingResults.map(r => ({
              ...r,
              marksObtained: r.marksObtained ? Number(r.marksObtained) : null
            }))}
            isLocked={assessment.status === "locked" || assessment.status === "published"}
            hasRubric={subStrands.length > 0}
            maxMarks={assessment.maxMarks ? Number(assessment.maxMarks) : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}