import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';

export async function GET() {
  const guard = await requireUser(['parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  // Only this parent's ACTIVE guardian links to students in their school, with an explicit
  // field whitelist (never whole student rows).
  const guardians = await prisma.guardian.findMany({
    where: {
      userId: user.id,
      isActive: true,
      student: { schoolId: user.schoolId, deletedAt: null },
    },
    select: {
      hasRestrictedAccess: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          stream: { select: { name: true, grade: { select: { name: true } } } },
        },
      },
    },
  });

  const children = await Promise.all(
    guardians.map(async (guardian) => {
      const student = guardian.student;

      // Get all assessments for this student
      const assessments = await prisma.assessmentResult.findMany({
        where: {
          schoolId: user.schoolId, // ➕ R5-04: Strict tenancy scoping
          studentId: student.id,
          // Parents only ever see PUBLISHED (or locked-after-publish) results, never drafts.
          assessment: { schoolId: user.schoolId, status: { in: ['published', 'locked'] } },
        },
        include: {
          assessment: {
            include: {
              learningArea: { select: { name: true } },
              term: { select: { name: true, termNumber: true } },
            },
          },
        },
        orderBy: {
          assessment: {
            assessmentDate: 'desc',
          },
        },
      });

      // Get term reports
      const termReports = await prisma.termReport.findMany({
        where: {
          studentId: student.id,
          schoolId: user.schoolId,
          publishedAt: { not: null }, // unpublished report cards are never visible to parents
        },
        orderBy: { term: { startDate: 'desc' } },
        include: {
          term: { select: { name: true, startDate: true } },
        },
      });

      // Percentage of the maximum for one result, or null when there is nothing to count.
      //  - an ABSENT learner counts as zero (school decision; marks are stored as 0)
      //  - "not entered" is NOT zero and is left out of every average
      const percentOf = (r: (typeof assessments)[number]): number | null => {
        if (r.resultStatus === 'absent') return 0;
        if (r.resultStatus !== 'scored') return null;
        if (r.marksObtained === null || r.marksObtained === undefined) return null;
        const max = r.assessment.maxMarks === null ? 0 : Number(r.assessment.maxMarks);
        if (!(max > 0)) return null;
        return (Number(r.marksObtained) / max) * 100;
      };
      const mean = (values: number[]) =>
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;

      // Calculate subject performance across terms. Terms are bucketed by their real term
      // NUMBER (1-3), never by looking for a digit in the term's name: "Term 3 2026" contains a 2.
      const subjectMap = new Map<string, { term1: number[]; term2: number[]; term3: number[] }>();

      assessments.forEach((result) => {
        const percentage = percentOf(result);
        if (percentage === null) return;
        const subject = result.assessment.learningArea.name;
        const termNum = result.assessment.term.termNumber;

        if (!subjectMap.has(subject)) {
          subjectMap.set(subject, { term1: [], term2: [], term3: [] });
        }
        const bucket = subjectMap.get(subject)!;
        if (termNum === 1) bucket.term1.push(percentage);
        else if (termNum === 2) bucket.term2.push(percentage);
        else if (termNum === 3) bucket.term3.push(percentage);
      });

      const subjectPerformance = Array.from(subjectMap.entries()).map(([subject, data]) => {
        const term1Avg = mean(data.term1);
        const term2Avg = mean(data.term2);
        const term3Avg = mean(data.term3);
        // A term whose average is a genuine 0 still counts; only terms with no marks are skipped.
        const termAvgs = [term1Avg, term2Avg, term3Avg].filter((v): v is number => v !== null);
        const overallAvg = mean(termAvgs) ?? 0;

        // Determine trend (only when both ends have marks)
        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (term1Avg !== null && term3Avg !== null) {
          if (term3Avg > term1Avg + 5) trend = 'improving';
          else if (term3Avg < term1Avg - 5) trend = 'declining';
        }

        return {
          subject,
          term1: Math.round((term1Avg ?? 0) * 10) / 10,
          term2: Math.round((term2Avg ?? 0) * 10) / 10,
          term3: Math.round((term3Avg ?? 0) * 10) / 10,
          average: Math.round(overallAvg * 10) / 10,
          trend,
          needsAttention: overallAvg < 50 || trend === 'declining',
        };
      });

      // Calculate overall average (not-entered results are left out, absent counts as zero)
      const allPercentages = assessments
        .map(percentOf)
        .filter((v): v is number => v !== null);
      const overallAverage = mean(allPercentages) ?? 0;

      // Identify strengths and weaknesses
      const strengths = subjectPerformance.filter((s) => s.average >= 70).map((s) => s.subject);

      const needsImprovement = subjectPerformance
        .filter((s) => s.average < 50 || s.trend === 'declining')
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
          type: a.assessment.type as 'cat' | 'exam' | 'assignment' | 'project',
          learningArea: { name: a.assessment.learningArea.name },
          term: { name: a.assessment.term.name },
          assessmentDate: a.assessment.assessmentDate
            ? a.assessment.assessmentDate.toISOString()
            : null,
          maxMarks: a.assessment.maxMarks,
          weightPercent: a.assessment.weightPercent,
          marksObtained: a.marksObtained,
          absent: a.resultStatus === 'absent',
          percentage: Math.round((percentOf(a) ?? 0) * 10) / 10,
          grade: '',
          teacherComment: a.teacherComment || undefined,
        })),
        termSummaries: termReports.map((r) => ({
          term: r.term.name,
          totalAssessments: assessments.filter((a) => a.assessment.term.name === r.term.name)
            .length,
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
