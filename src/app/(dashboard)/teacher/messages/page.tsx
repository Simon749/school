import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { MessageList } from '@/components/messages/MessageList';
import { TeacherComposeMessage } from '@/components/messages/TeacherComposeMessage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export default async function TeacherMessagesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      teacher: {
        include: {
          classTeacherStream: {
            include: {
              grade: { select: { name: true } },
              students: {
                where: { status: 'active' },
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  admissionNumber: true,
                  guardians: {
                    where: { isPrimary: true, isActive: true },
                    select: { userId: true },
                    take: 1,
                  },
                },
              },
            },
          },
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
  const students = teacher.classTeacherStream?.students || [];
  const streamName = teacher.classTeacherStream
    ? `${teacher.classTeacherStream.grade?.name ?? 'Class'} ${teacher.classTeacherStream.name}`
    : 'Class';
  const TeacherComposeMessageComponent = TeacherComposeMessage as unknown as (props: {
    students: typeof students;
  }) => JSX.Element;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-8 w-8 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
            <p className="text-muted-foreground">
              Communicate with parents and school administration.
            </p>
          </div>
        </div>
        <TeacherComposeMessage
          students={students}
          teacherId={teacher.id}
          isClassTeacher={teacher.isClassTeacher}
          streamId={teacher.classTeacherStream?.id}
          streamName={streamName}
        />
      </div>

      {teacher.isClassTeacher && teacher.classTeacherStream && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <p className="text-sm text-blue-900">
              <strong>Class Teacher Mode:</strong> You can message parents of students in{' '}
              <strong>
                {teacher.classTeacherStream.grade?.name ?? 'Class'} {teacher.classTeacherStream.name}
              </strong>
              . ({students.length} students available)
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <MessageList teacherId={teacher.id} userId={user.id} />
        </CardContent>
      </Card>
    </div>
  );
}