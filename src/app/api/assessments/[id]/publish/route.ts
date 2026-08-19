// src/app/api/assessments/[id]/publish/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notificationQueue } from "@/lib/queue";

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
const students = await prisma.student.findMany({
  where: { streamId: assessment.streamId },
  include: {
    guardians: {
      where: { isPrimary: true },
      select: { userId: true },
    },
  },
});

for (const student of students) {
  const parent = student.guardians[0];
  if (parent) {
    await notificationQueue.add("result-published", {
      userId: parent.userId,
      type: "results",
      title: "Results Published",
      body: `${student.firstName}'s ${assessment.title} results are now available`,
      data: {
        studentId: student.id,
        assessmentId: assessment.id,
        url: `/parent/${student.id}/results`,
      },
    });
  }
}

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Publish assessment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}