import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { schoolIdentitySchema } from "@/lib/validations/onboarding";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { schoolId, ...data } = body;

  const parsed = schoolIdentitySchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    let school;

    if (schoolId) {
      // Update existing
      school = await prisma.school.update({
        where: { id: schoolId },
        data: {
          name: parsed.data.name,
          knecCode: parsed.data.knecCode || null,
          county: parsed.data.county,
          subCounty: parsed.data.subCounty,
          phone: parsed.data.phone,
          email: parsed.data.email,
          logoUrl: parsed.data.logoUrl || null,
          onboardingStep: 1,
        },
      });
    } else {
      // Create new school
      school = await prisma.school.create({
        data: {
          name: parsed.data.name,
          knecCode: parsed.data.knecCode || null,
          county: parsed.data.county,
          subCounty: parsed.data.subCounty,
          phone: parsed.data.phone,
          email: parsed.data.email,
          logoUrl: parsed.data.logoUrl || null,
          onboardingStep: 1,
        },
      });

      // Link current Clerk user as admin of this school
      await prisma.user.upsert({
        where: { clerkId },
        update: { schoolId: school.id },
        create: {
          clerkId,
          schoolId: school.id,
          email: parsed.data.email,
          firstName: "Admin",
          lastName: "User",
          role: "admin",
        },
      });
    }

    return NextResponse.json({ success: true, school });
  } catch (error: any) {
    console.error("Onboarding step 1 error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save school" },
      { status: 500 }
    );
  }
}