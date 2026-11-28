import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/auth/current-user';
import { CreateAssessmentDialog } from '@/components/assessment/CreateAssessmentDialog';
import { buildTeachingOptions } from '@/lib/assessments/teaching-options';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

// Helper to format status
const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    hod_review: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    locked: 'bg-blue-100 text-blue-800',
  };
  return (
    <Badge className={styles[status] || 'bg-gray-100'}>
      {status.replace('_', ' ').toUpperCase()}
    </Badge>
  );
};

export default async function TeacherMarkbookPage() {
  // Not signed in -> /login; deactivated, deleted or non-teacher -> /unauthorized (SEC-09 / SEC-21).
  const user = await requirePageUser(['teacher']);

  // Found by the INTERNAL user id and the caller's school (FEAT-01 / SEC-11).
  const teacher = await prisma.teacher.findFirst({
    where: { userId: user.id, schoolId: user.schoolId },
    select: { id: true, schoolId: true },
  });

  if (!teacher) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-red-500">Teacher profile not found</h2>
        <p className="text-muted-foreground mt-2">Please contact your school administrator.</p>
      </div>
    );
  }

  // Only the term + class + subject combinations this teacher is timetabled to teach: the server
  // refuses anything else (D20), so the form must not offer it. Classes are shown as "Grade 5 A".
  const slots = await prisma.timetableSlot.findMany({
    where: { teacherId: teacher.id, schoolId: teacher.schoolId },
    select: {
      termId: true,
      streamId: true,
      learningAreaId: true,
      term: { select: { id: true, name: true, isCurrent: true } },
      stream: { select: { id: true, name: true, grade: { select: { name: true, level: true } } } },
      learningArea: { select: { id: true, name: true } },
    },
  });
  const options = buildTeachingOptions(slots);

  const assessments = await prisma.assessment.findMany({
    where: { teacherId: teacher.id, schoolId: teacher.schoolId },
    include: {
      stream: { select: { name: true, grade: { select: { name: true } } } },
      learningArea: { select: { name: true } },
      term: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Markbook</h1>
          <p className="text-muted-foreground">Manage your assessments and CBC rubric entries.</p>
        </div>
        {/* FIX: Removed the onSuccess prop to prevent Server -> Client function passing error */}
        <CreateAssessmentDialog
          terms={options.terms}
          classes={options.classes}
          learningAreas={options.learningAreas}
          combos={options.combos}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No assessments created yet. Click "+ New Assessment" to begin.
            </p>
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
                    <TableCell>{`${assessment.stream.grade.name} ${assessment.stream.name}`}</TableCell>
                    <TableCell>{assessment.term.name || 'Unnamed Term'}</TableCell>
                    <TableCell>
                      {assessment.assessmentDate
                        ? new Date(assessment.assessmentDate).toLocaleDateString('en-KE')
                        : 'Not set'}
                    </TableCell>
                    <TableCell>{getStatusBadge(assessment.status)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/teacher/markbook/${assessment.id}`}
                        className="text-blue-600 hover:underline text-sm font-medium"
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