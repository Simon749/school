import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { createStreamSchema } from "@/lib/validations/grade-stream";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createStreamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { gradeId, name, capacity } = parsed.data;

  // Verify grade belongs to user's school
  const grade = await prisma.grade.findFirst({
    where: { id: gradeId, schoolId: user.schoolId },
  });

  if (!grade) {
    return NextResponse.json({ error: "Grade not found" }, { status: 404 });
  }

  // Check for duplicate stream name within this grade
  const existing = await prisma.stream.findFirst({
    where: { gradeId, name: { equals: name, mode: "insensitive" } },
  });

  if (existing) {
    return NextResponse.json(
      { error: `Stream "${name}" already exists for ${grade.name}` },
      { status: 409 }
    );
  }

  const stream = await prisma.stream.create({
    data: {
      schoolId: user.schoolId,
      gradeId,
      name,
      capacity,
    },
  });

  return NextResponse.json({ success: true, stream }, { status: 201 });
}