// src/app/api/results/reports/generate/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTermReportSchema } from "@/lib/validations/term-report.schema";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { teacher: true },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Only class teachers and admins can generate reports
  const isClassTeacher = user.teacher?.isClassTeacher;
  const isAdmin = user.role === "admin" || user.role === "deputy";

  if (!isClassTeacher && !isAdmin) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const data = generateTermReportSchema.parse(body);

    // 1. Calculate attendance summary
    const term = await prisma.term.findUnique({
      where: { id: data.termId },
    });

    if (!term) {
      return NextResponse.json({ error: "Term not found" }, { status: 404 });
    }

    // Get student's stream
    const student = await prisma.student.findUnique({
      where: { id: data.studentId },
      select: { streamId: true, schoolId: true },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Count total lessons and attended lessons for this term
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
          status: "present",
        },
      }),
    ]);

    // 2. Calculate overall score from published assessments
    const assessments = await prisma.assessment.findMany({
      where: {
        schoolId: student.schoolId,
        streamId: student.streamId,
        termId: data.termId,
        status: "published",
      },
      include: {
        results: {
          where: { studentId: data.studentId },
          select: { marksObtained: true },
        },
      },
    });

    let overallScore: number | null = null;
    let totalMarks = 0;
    let totalMaxMarks = 0;

    assessments.forEach((assessment) => {
      const result = assessment.results[0];
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
        schoolId: student.schoolId,
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

    return NextResponse.json(report);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    console.error("Term report generation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}