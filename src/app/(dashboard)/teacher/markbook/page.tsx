import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/auth/current-user';
import { CreateAssessmentDialog } from '@/components/assessment/CreateAssessmentDialog';
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
  const user = await requirePageUser(['teacher']);

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

  const [assessments, slots] = await Promise.all([
    prisma.assessment.findMany({
      where: { teacherId: teacher.id, schoolId: teacher.schoolId },
      include: {
        stream: { select: { name: true, grade: { select: { name: true } } } },
        learningArea: { select: { name: true } },
        term: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.timetableSlot.findMany({
      where: { teacherId: teacher.id, schoolId: teacher.schoolId },
      select: {
        term: { select: { id: true, name: true, startDate: true, isCurrent: true } },
        stream: {
          select: {
            id: true,
            name: true,
            grade: { select: { name: true, level: true } },
          },
        },
        learningArea: { select: { id: true, name: true } },
      },
      orderBy: [
        { term: { startDate: 'asc' } },
        { stream: { grade: { level: 'asc' } } },
        { learningArea: { name: 'asc' } },
      ],
    }),
  ]);

  // 🔒 P0 FIX: Deduplicate slots to build the allowed combos for the dialog.
  // This enforces D20 by construction: teachers can only pick what they teach.
  const seen = new Set<string>();
  const streamsMap = new Map<string, { id: string; name: string }>();
  const learningAreasMap = new Map<string, { id: string; name: string }>();
  const termsMap = new Map<string, { id: string; name: string; isCurrent: boolean }>();

  for (const s of slots) {
    const key = `${s.term.id}|${s.stream.id}|${s.learningArea.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    
    // 🔒 P0 FIX: Combine grade name and stream name for clarity (e.g., "Grade 5 A")
    streamsMap.set(s.stream.id, { 
      id: s.stream.id, 
      name: `${s.stream.grade.name} ${s.stream.name}` 
    });
    learningAreasMap.set(s.learningArea.id, { 
      id: s.learningArea.id, 
      name: s.learningArea.name 
    });
    termsMap.set(s.term.id, { 
      id: s.term.id, 
      name: s.term.name || 'Unnamed Term',
      isCurrent: s.term.isCurrent,
    });
  }

  const allowedStreams = Array.from(streamsMap.values());
  const allowedLearningAreas = Array.from(learningAreasMap.values());
  const allowedTerms = Array.from(termsMap.values());

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Markbook</h1>
          <p className="text-muted-foreground">Manage your assessments and CBC rubric entries.</p>
        </div>
        {/* 🔒 P0 FIX: Pass the three filtered arrays that the dialog actually expects */}
        <CreateAssessmentDialog combos={[]} classes={[]} learningAreas={[]} terms={[]} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No assessments created yet. Click &quot;+ New Assessment&quot; to begin.
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
                {assessments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell>{a.learningArea.name}</TableCell>
                    <TableCell>
                      {a.stream.grade.name} {a.stream.name}
                    </TableCell>
                    <TableCell>{a.term.name || 'Unnamed Term'}</TableCell>
                    <TableCell>
                      {a.assessmentDate
                        ? new Date(a.assessmentDate).toLocaleDateString('en-KE')
                        : 'Not set'}
                    </TableCell>
                    <TableCell>{getStatusBadge(a.status)}</TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/teacher/markbook/${a.id}`}
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