// src/app/api/assessments/[id]/publish/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacher = await prisma.teacher.findUnique({ where: { userId } });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 403 });

  const assessmentId = params.id;

  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment || assessment.teacherId !== teacher.id || assessment.schoolId !== teacher.schoolId) {
    return NextResponse.json({ error: "Assessment not found or access denied" }, { status: 404 });
  }

  if (assessment.status === "locked") {
    return NextResponse.json({ error: "Assessment is locked" }, { status: 403 });
  }

  try {
    const updated = await prisma.assessment.update({
      where: { id: assessmentId },
      data: { status: "published", publishedAt: new Date() },
    });

    // TODO: Phase 3.6 - Queue notification to parents that results are published

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Publish assessment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}