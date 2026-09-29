import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { gradeStreamSchema } from "@/lib/validations/onboarding";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true },
  });

  if (!user?.schoolId) {
    return NextResponse.json({ error: "School not found for user" }, { status: 404 });
  }

  const schoolId = user.schoolId;

  const body = await req.json();
  const parsed = gradeStreamSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { grades } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      for (const grade of grades) {
        const createdGrade = await tx.grade.create({
          data: {
            schoolId,
            name: grade.name,
            level: grade.level,
            cbcStage: grade.cbcStage,
          },
        });

        for (const stream of grade.streams) {
          await tx.stream.create({
            data: {
              schoolId,
              gradeId: createdGrade.id,
              name: stream.name,
              capacity: stream.capacity,
            },
          });
        }
      }

      await tx.school.update({
        where: { id: schoolId },
        data: { onboardingStep: 4 },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Onboarding step 4 error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save grades and streams" },
      { status: 500 }
    );
  }
}