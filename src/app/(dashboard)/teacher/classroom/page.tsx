import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';

export default async function TeacherClassroomPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      teacher: {
        include: {
          school: true,
        },
      },
    },
  });

  if (!user || !user.teacher) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-red-500">Teacher profile not found</h2>
        <p className="text-muted-foreground mt-2">Please contact your school administrator.</p>
      </div>
    );
  }

  const teacher = user.teacher;

  // Guard: Not a class teacher
  if (!teacher.isClassTeacher || !teacher.classTeacherStreamId) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <Users className="h-8 w-8 text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900">Not a Class Teacher</h2>
        <p className="text-muted-foreground mt-2 mb-6">
          You are not currently assigned as a class teacher. Please contact your school administrator if you believe this is an error.
        </p>
        <Link href="/teacher">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  // Fetch stream details (scoped to school implicitly via teacher relation)
  const stream = await prisma.stream.findUnique({
    where: { id: teacher.classTeacherStreamId },
    include: { grade: { select: { name: true } } },
  });

  if (!stream) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-red-500">Class stream not found</h2>
        <p className="text-muted-foreground mt-2">The assigned class stream could not be found.</p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch active students in this stream
  const students = await prisma.student.findMany({
    where: {
      streamId: stream.id,
      schoolId: teacher.schoolId, // SEC-11: Strict school isolation
      status: 'active',
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
    },
    orderBy: { lastName: 'asc' },
  });

  const studentIds = students.map((s) => s.id);

  // Fetch today's attendance for these students
  const todayAttendance =
    studentIds.length > 0
      ? await prisma.studentDailyAttendance.findMany({
          where: {
            studentId: { in: studentIds },
            date: today,
          },
          select: { studentId: true, status: true },
        })
      : [];

  const attendanceMap = new Map(todayAttendance.map((a) => [a.studentId, a.status]));

  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;

  students.forEach((s) => {
    const status = attendanceMap.get(s.id) || 'absent';
    if (status === 'present') presentCount++;
    else if (status === 'late') lateCount++;
    else absentCount++;
  });

  const getStatusBadge = (status: string | undefined) => {
    const s = status || 'absent';
    if (s === 'present')
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Present</Badge>;
    if (s === 'late')
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Late</Badge>;
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Absent</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {stream.grade.name} {stream.name}
          </h1>
          <p className="text-muted-foreground mt-1">Class overview and daily attendance snapshot.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/teacher/attendance">
            <Button variant="outline" className="gap-2">
              <CheckCircle className="h-4 w-4" /> Take Attendance
            </Button>
          </Link>
          <Link href="/teacher/messages">
            <Button variant="outline" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Message Class
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Learners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{presentCount}</div>
            <p className="text-xs text-muted-foreground">{lateCount} late</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent Today</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{absentCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Roster</CardTitle>
        </CardHeader>
        <CardContent>
          {students.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No active students in this class.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Student Name</TableHead>
                    <TableHead>Today's Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => {
                    const status = attendanceMap.get(student.id);
                    return (
                      <TableRow key={student.id}>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {student.admissionNumber || '—'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {student.firstName} {student.lastName}
                        </TableCell>
                        <TableCell>{getStatusBadge(status)}</TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/teacher/reports/${student.id}`}
                            className="text-sm text-blue-600 hover:underline font-medium"
                          >
                            View Report
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}