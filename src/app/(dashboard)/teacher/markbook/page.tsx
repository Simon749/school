// src/app/(dashboard)/teacher/markbook/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CreateAssessmentDialog } from "@/components/assessment/CreateAssessmentDialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";

// Helper to format status
const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    hod_review: "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    locked: "bg-blue-100 text-blue-800",
  };
  return (
    <Badge className={styles[status] || "bg-gray-100"}>
      {status.replace("_", " ").toUpperCase()}
    </Badge>
  );
};

export default async function TeacherMarkbookPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: {
      school: {
        include: {
          streams: { select: { id: true, name: true } },
          learningAreas: { select: { id: true, name: true } },
          terms: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!teacher) {
    return <div className="p-8 text-red-500">Teacher profile not found. Please contact admin.</div>;
  }

  const assessments = await prisma.assessment.findMany({
    where: { teacherId: teacher.id, schoolId: teacher.schoolId },
    include: {
      stream: { select: { name: true } },
      learningArea: { select: { name: true } },
      term: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Markbook</h1>
          <p className="text-muted-foreground">Manage your assessments and CBC rubric entries.</p>
        </div>
        <CreateAssessmentDialog
          streams={teacher.school.streams}
          learningAreas={teacher.school.learningAreas}
          terms={teacher.school.terms.map(t => ({ id: t.id, name: t.name || "Unnamed Term" }))}
          onSuccess={() => { /* Optional: revalidatePath('/teacher/markbook') if using Next.js cache */ }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No assessments created yet. Click "+ New Assessment" to begin.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((assessment) => (
                  <TableRow key={assessment.id}>
                    <TableCell className="font-medium">{assessment.title}</TableCell>
                    <TableCell>{assessment.learningArea.name}</TableCell>
                    <TableCell>{assessment.stream.name}</TableCell>
                    <TableCell>{assessment.term.name || "Unnamed Term"}</TableCell>
                    <TableCell>
                      {new Date(assessment.assessmentDate!).toLocaleDateString("en-KE")}
                    </TableCell>
                    <TableCell>{getStatusBadge(assessment.status)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/teacher/markbook/${assessment.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Enter Marks
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}