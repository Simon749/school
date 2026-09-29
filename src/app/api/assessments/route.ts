// src/app/api/assessments/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db"; // Adjust path to your Prisma singleton
import { createAssessmentSchema } from "@/lib/validations/assessment.schema";

// GET: List assessments for the logged-in teacher
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: { school: true },
  });

  if (!teacher) {
    return NextResponse.json({ error: "Teacher profile not found" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("termId");
  const streamId = searchParams.get("streamId");

  const assessments = await prisma.assessment.findMany({
    where: {
      schoolId: teacher.schoolId,
      teacherId: teacher.id,
      ...(termId && { termId }),
      ...(streamId && { streamId }),
    },
    include: {
      stream: { select: { name: true, grade: { select: { name: true } } } },
      learningArea: { select: { name: true, code: true } },
      term: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assessments);
}

// POST: Create a new assessment (starts in 'draft' status)
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
  });

  if (!teacher) {
    return NextResponse.json({ error: "Teacher profile not found" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const validatedData = createAssessmentSchema.parse(body);

    const assessment = await prisma.assessment.create({
      data: {
        ...validatedData,
        schoolId: teacher.schoolId,
        teacherId: teacher.id,
        status: "draft", // Always starts as draft
      },
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 400 });
    }
    console.error("Assessment creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}