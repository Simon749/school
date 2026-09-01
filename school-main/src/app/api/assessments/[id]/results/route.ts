// src/app/api/assessments/[id]/results/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { bulkUpsertResultsSchema } from "@/lib/validations/results.schema";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 403 });

  const assessmentId = params.id;

  // Verify ownership and school isolation
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment || assessment.teacherId !== teacher.id || assessment.schoolId !== teacher.schoolId) {
    return NextResponse.json({ error: "Assessment not found or access denied" }, { status: 404 });
  }

  if (assessment.status === "locked") {
    return NextResponse.json({ error: "Assessment is locked and cannot be edited" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { results } = bulkUpsertResultsSchema.parse(body);

    await prisma.$transaction(async (tx) => {
      for (const result of results) {
        // 1. Upsert the main AssessmentResult
        const assessmentResult = await tx.assessmentResult.upsert({
          where: {
            assessmentId_studentId: { assessmentId, studentId: result.studentId },
          },
          update: {
            marksObtained: result.marksObtained,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
          },
          create: {
            assessmentId,
            studentId: result.studentId,
            marksObtained: result.marksObtained,
            teacherComment: result.teacherComment,
            submittedAt: new Date(),
          },
        });

        // 2. Handle Rubric Scores if provided
        if (result.rubricScores && result.rubricScores.length > 0) {
          // Delete existing scores for this student/assessment to avoid duplicates
          await tx.rubricScore.deleteMany({ where: { resultId: assessmentResult.id } });

          // Create new scores
          await tx.rubricScore.createMany({
            data: result.rubricScores.map((score) => ({
              resultId: assessmentResult.id,
              subStrandId: score.subStrandId,
              score: score.score,
              comment: score.comment,
            })),
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    console.error("Bulk upsert results error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}