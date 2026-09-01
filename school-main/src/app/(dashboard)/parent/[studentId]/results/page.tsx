// src/app/(dashboard)/parent/[studentId]/results/page.tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AssessmentDetail } from "@/components/results/AssessmentDetail";

// Helper to get rubric badge color
const getRubricColor = (score: string) => {
  const colors: Record<string, string> = {
    EE: "bg-green-100 text-green-800 border-green-300",
    ME: "bg-blue-100 text-blue-800 border-blue-300",
    AE: "bg-yellow-100 text-yellow-800 border-yellow-300",
    BE: "bg-red-100 text-red-800 border-red-300",
  };
  return colors[score] || "bg-gray-100 text-gray-800";
};

export default async function ParentResultsPage({
  params,
}: {
  params: { studentId: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Verify guardian access
  const guardian = await prisma.guardian.findFirst({
    where: { userId, studentId: params.studentId, isActive: true },
    include: {
      student: {
        include: {
          stream: { select: { name: true } },
          school: {
            include: {
              terms: {
                where: { isCurrent: true },
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  if (!guardian) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-red-600">Access Denied</h2>
        <p className="text-muted-foreground mt-2">
          You are not authorized to view this student's results.
        </p>
      </div>
    );
  }

  const currentTerm = guardian.student.school.terms[0];

  // Fetch published assessments with results
  const assessments = await prisma.assessment.findMany({
    where: {
      schoolId: guardian.student.schoolId,
      streamId: guardian.student.streamId,
      status: "published",
      termId: currentTerm?.id,
    },
    include: {
      learningArea: { select: { name: true, code: true, color: true } },
      term: { select: { name: true } },
      teacher: {
        select: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
      AssessmentResult: {
        where: { studentId: params.studentId },
        include: {
          rubricScores: {
            include: {
              subStrand: {
                include: {
                  strand: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { assessmentDate: "desc" },
  });

  const assessmentsWithResults = assessments.filter(
    (assessment) => assessment.AssessmentResult.length > 0
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {guardian.student.firstName}'s Results
        </h1>
        <p className="text-muted-foreground">
          {guardian.student.stream.name} • {currentTerm?.name || "Current Term"}
        </p>
      </div>

      {assessmentsWithResults.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No published results yet for this term.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {assessmentsWithResults.map((assessment) => {
            const result = assessment.AssessmentResult[0];
            const hasRubric = result.rubricScores.length > 0;

            return (
              <Card key={assessment.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{assessment.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {assessment.learningArea.name} •{" "}
                        {assessment.teacher.user.firstName}{" "}
                        {assessment.teacher.user.lastName}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {new Date(assessment.assessmentDate!).toLocaleDateString("en-KE")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Marks (if not rubric-based) */}
                  {!hasRubric && result.marksObtained && assessment.maxMarks && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Score:</span>
                      <span className="text-lg font-bold">
                        {Number(result.marksObtained)} / {Number(assessment.maxMarks)}
                      </span>
                    </div>
                  )}

                  {/* Rubric Scores */}
                  {hasRubric && (
                    <div>
                      <p className="text-sm font-medium mb-2">CBC Rubric Scores:</p>
                      <div className="flex flex-wrap gap-2">
                        {result.rubricScores.map((score) => (
                          <Badge
                            key={score.id}
                            className={`${getRubricColor(
                              score.score
                            )} border text-xs font-semibold`}
                            title={`${score.subStrand.strand.name} → ${score.subStrand.name}`}
                          >
                            {score.score}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        EE = Exceeding Expectations • ME = Meeting Expectations • AE =
                        Approaching Expectations • BE = Below Expectations
                      </p>
                    </div>
                  )}

                  {/* Teacher Comment */}
                  {result.teacherComment && (
                    <div className="bg-gray-50 p-3 rounded-md">
                      <p className="text-sm font-medium mb-1">Teacher's Comment:</p>
                      <p className="text-sm text-gray-700">{result.teacherComment}</p>
                    </div>
                  )}

                  {/* View Details Button */}
                  <div className="pt-2">
                    <AssessmentDetail
                      assessment={{
                        ...assessment,
                        maxMarks: assessment.maxMarks === null ? null : Number(assessment.maxMarks),
                        assessmentDate: assessment.assessmentDate?.toISOString() ?? null,
                      }}
                      result={{
                        ...result,
                        marksObtained:
                          result.marksObtained === null ? null : Number(result.marksObtained),
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}