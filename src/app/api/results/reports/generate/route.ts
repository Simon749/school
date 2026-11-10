// src/app/api/results/reports/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { generateTermReportSchema } from '@/lib/validations/term-report.schema';

/**
 * Create/refresh a student's term report.
 *
 * Who may do it (SEC-26; tracker 3.4):
 *  - admin / deputy: any student in their own school
 *  - a class teacher: only students in THEIR OWN class stream
 *  - only an admin may set the principal's comment
 *  - a report that has already been published is never silently regenerated
 *
 * NOTE: the score/attendance calculation below is unchanged on purpose. It is not the CBC
 * report the design needs (finding FEAT-10 / decision D13) and is replaced in R6-03.
 */
export async function POST(request: NextRequest) {
  const guard = await requireUser(['admin', 'deputy', 'teacher']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = generateTermReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.errors },
      { status: 400 }
    );
  }
  const data = parsed.data;

  if (data.principalComment !== undefined && user.role !== 'admin') {
    return NextResponse.json(
      { error: "Only the school admin can set the principal's comment" },
      { status: 403 }
    );
  }

  try {
    // Term and student must both belong to the caller's school.
    const [term, student] = await Promise.all([
      prisma.term.findFirst({ where: { id: data.termId, schoolId: user.schoolId } }),
      prisma.student.findFirst({
        where: { id: data.studentId, schoolId: user.schoolId, deletedAt: null },
        select: { streamId: true, schoolId: true },
      }),
    ]);
    if (!term) return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // A class teacher may only report on their own class.
    if (user.role === 'teacher') {
      const teacher = await prisma.teacher.findFirst({
        where: { userId: user.id, schoolId: user.schoolId },
        select: { isClassTeacher: true, classTeacherStreamId: true },
      });
      if (
        !teacher?.isClassTeacher ||
        !teacher.classTeacherStreamId ||
        teacher.classTeacherStreamId !== student.streamId
      ) {
        return NextResponse.json(
          { error: "Only the class teacher of this student's class can generate their report" },
          { status: 403 }
        );
      }
    }

    const existing = await prisma.termReport.findUnique({
      where: { studentId_termId: { studentId: data.studentId, termId: data.termId } },
      select: { id: true, publishedAt: true },
    });
    if (existing?.publishedAt) {
      return NextResponse.json(
        { error: 'This report has already been published and cannot be regenerated' },
        { status: 409 }
      );
    }

    // 1. Attendance summary
    const [totalLessons, lessonsAttended] = await Promise.all([
      prisma.studentLessonAttendance.count({
        where: {
          studentId: data.studentId,
          date: { gte: term.startDate, lte: term.endDate },
        },
      }),
      prisma.studentLessonAttendance.count({
        where: {
          studentId: data.studentId,
          date: { gte: term.startDate, lte: term.endDate },
          status: 'present',
        },
      }),
    ]);

    // 2. Overall score from published assessments (replaced by the CBC model in R6-03)
    const assessments = await prisma.assessment.findMany({
      where: {
        schoolId: student.schoolId,
        streamId: student.streamId,
        termId: data.termId,
        status: 'published',
      },
      include: {
        AssessmentResult: {
          where: { studentId: data.studentId },
          select: { marksObtained: true },
        },
      },
    });

    let overallScore: number | null = null;
    let totalMarks = 0;
    let totalMaxMarks = 0;

    assessments.forEach((assessment) => {
      const result = assessment.AssessmentResult[0];
      if (result?.marksObtained && assessment.maxMarks) {
        totalMarks += Number(result.marksObtained);
        totalMaxMarks += Number(assessment.maxMarks);
      }
    });

    if (totalMaxMarks > 0) {
      overallScore = (totalMarks / totalMaxMarks) * 100;
    }

    // 3. Upsert the term report
    const report = await prisma.termReport.upsert({
      where: {
        studentId_termId: {
          studentId: data.studentId,
          termId: data.termId,
        },
      },
      update: {
        classTeacherComment: data.classTeacherComment,
        principalComment: data.principalComment,
        conduct: data.conduct,
        overallScore,
        totalLessons,
        lessonsAttended,
        streamId: student.streamId,
      },
      create: {
        schoolId: user.schoolId,
        studentId: data.studentId,
        termId: data.termId,
        streamId: student.streamId,
        classTeacherComment: data.classTeacherComment,
        principalComment: data.principalComment,
        conduct: data.conduct,
        overallScore,
        totalLessons,
        lessonsAttended,
      },
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'term_report.generated',
      tableName: 'term_reports',
      recordId: report.id,
      newData: {
        studentId: data.studentId,
        termId: data.termId,
        principalCommentSet: data.principalComment !== undefined,
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Term report generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
