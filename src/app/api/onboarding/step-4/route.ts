import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { gradeStreamSchema } from "@/lib/validations/onboarding";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = gradeStreamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { schoolId, grades } = parsed.data;

  try {
    // Use transaction to create grades + streams atomically
    await prisma.$transaction(async (tx: { grade: { create: (arg0: { data: { schoolId: any; name: string; level: number; cbcStage: "pre_primary" | "lower_primary" | "upper_primary" | "jss"; }; }) => any; }; stream: { create: (arg0: { data: { schoolId: any; gradeId: any; name: string; capacity: number; }; }) => any; }; school: { update: (arg0: { where: { id: any; }; data: { onboardingStep: number; }; }) => any; }; }) => {
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

      // Update onboarding progress
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