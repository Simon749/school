// src/app/api/results/parent/[studentId]/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { studentId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const studentId = params.studentId;

  // 1. Verify the logged-in user is a guardian of this student
  const guardian = await prisma.guardian.findFirst({
    where: {
      userId,
      studentId,
      isActive: true,
      hasRestrictedAccess: false, // Can't see results if restricted
    },
    include: {
      student: {
        select: { schoolId: true, streamId: true },
      },
    },
  });

  if (!guardian) {
    return NextResponse.json(
      { error: "Access denied. You are not a guardian of this student." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("termId");

  // 2. Fetch only PUBLISHED assessments for this student's stream
  const assessments = await prisma.assessment.findMany({
    where: {
      schoolId: guardian.student.schoolId,
      streamId: guardian.student.streamId,
      status: "published", // CRITICAL: Only published results visible to parents
      ...(termId && { termId }),
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
        where: { studentId },
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

  // 3. Filter to only include assessments where this student has results
  const assessmentsWithResults = assessments.filter((a) => a.AssessmentResult.length > 0);

  return NextResponse.json(assessmentsWithResults);
}