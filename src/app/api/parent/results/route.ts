import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parent = await prisma.user.findUnique({
    where: { clerkId },
    include: {
      guardians: {
        include: {
          student: {
            include: {
              stream: {
                include: {
                  grade: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!parent) return NextResponse.json({ error: "Parent not found" }, { status: 404 });

  const children = await Promise.all(
    parent.guardians.map(async (guardian) => {
      const student = guardian.student;

      // Get all assessments for this student
      const assessments = await prisma.assessmentResult.findMany({
        where: { studentId: student.id },
        include: {
          assessment: {
            include: {
              learningArea: { select: { name: true } },
              term: { select: { name: true } },
            },
          },
        },
        orderBy: {
          assessment: {
            assessmentDate: "desc",
          },
        },
      });

      // Get term reports
      const termReports = await prisma.termReport.findMany({
        where: { studentId: student.id },
        orderBy: { term: { startDate: "desc" } },
        include: {
          term: { select: { name: true, startDate: true } },
        },
      });

      // Calculate subject performance across terms
      const subjectMap = new Map<string, { term1: number[]; term2: number[]; term3: number[] }>();
      
      assessments.forEach((result) => {
        const subject = result.assessment.learningArea.name;
        const percentage = result.marksObtained && result.assessment.maxMarks ? (Number(result.marksObtained) / Number(result.assessment.maxMarks)) * 100 : 0;
        const termName = result.assessment.term.name || "";
        const termNum = termName.includes("1") ? 1 : termName.includes("2") ? 2 : 3;

        if (!subjectMap.has(subject)) {
          subjectMap.set(subject, { term1: [], term2: [], term3: [] });
        }

        if (termNum === 1) subjectMap.get(subject)!.term1.push(percentage);
        else if (termNum === 2) subjectMap.get(subject)!.term2.push(percentage);
        else subjectMap.get(subject)!.term3.push(percentage);
      });

      const subjectPerformance = Array.from(subjectMap.entries()).map(([subject, data]) => {
        const term1Avg = data.term1.length > 0 ? data.term1.reduce((a, b) => a + b, 0) / data.term1.length : 0;
        const term2Avg = data.term2.length > 0 ? data.term2.reduce((a, b) => a + b, 0) / data.term2.length : 0;
        const term3Avg = data.term3.length > 0 ? data.term3.reduce((a, b) => a + b, 0) / data.term3.length : 0;
        const overallAvg = [term1Avg, term2Avg, term3Avg].filter((v) => v > 0).reduce((a, b) => a + b, 0) / 
                          [term1Avg, term2Avg, term3Avg].filter((v) => v > 0).length || 0;

        // Determine trend
        let trend: "improving" | "declining" | "stable" = "stable";
        if (term3Avg > term1Avg + 5) trend = "improving";
        else if (term3Avg < term1Avg - 5) trend = "declining";

        return {
          subject,
          term1: Math.round(term1Avg * 10) / 10,
          term2: Math.round(term2Avg * 10) / 10,
          term3: Math.round(term3Avg * 10) / 10,
          average: Math.round(overallAvg * 10) / 10,
          trend,
          needsAttention: overallAvg < 50 || trend === "declining",
        };
      });

      // Calculate overall average
      const allPercentages = assessments.map((a) => 
        a.marksObtained ? (Number(a.marksObtained) / Number(a.assessment.maxMarks)) * 100 : 0
      );
      const overallAverage = allPercentages.length > 0 
        ? allPercentages.reduce((a, b) => a + b, 0) / allPercentages.length 
        : 0;

      // Identify strengths and weaknesses
      const strengths = subjectPerformance
        .filter((s) => s.average >= 70)
        .map((s) => s.subject);
      
      const needsImprovement = subjectPerformance
        .filter((s) => s.average < 50 || s.trend === "declining")
        .map((s) => s.subject);

      return {
        studentId: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.stream.grade.name,
        stream: student.stream.name,
        overallAverage: Math.round(overallAverage * 10) / 10,
        classPosition: termReports[0]?.position,
        totalStudents: termReports[0]?.outOf,
        assessments: assessments.map((a) => ({
          id: a.id,
          title: a.assessment.title,
          type: a.assessment.type as "cat" | "exam" | "assignment" | "project",
          learningArea: { name: a.assessment.learningArea.name },
          term: { name: a.assessment.term.name },
          assessmentDate: a.assessment.assessmentDate ? a.assessment.assessmentDate.toISOString() : null,
          maxMarks: a.assessment.maxMarks,
          weightPercent: a.assessment.weightPercent,
          marksObtained: a.marksObtained,
          percentage: a.marksObtained && a.assessment.maxMarks ? Math.round((Number(a.marksObtained) / Number(a.assessment.maxMarks)) * 100 * 10) / 10 : 0,
          grade: "",
          teacherComment: a.teacherComment || undefined,
        })),
        termSummaries: termReports.map((r) => ({
          term: r.term.name,
          totalAssessments: assessments.filter((a) => a.assessment.term.name === r.term.name).length,
          averageScore: Math.round((Number(r.overallScore) || 0) * 10) / 10,
          position: r.position || undefined,
          outOf: r.outOf || undefined,
          classTeacherComment: r.classTeacherComment || undefined,
        })),
        subjectPerformance,
        strengths,
        needsImprovement,
      };
    })
  );

  return NextResponse.json({ children });
}