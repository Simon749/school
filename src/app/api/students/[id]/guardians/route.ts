import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { guardianLinkSchema } from "@/lib/validations/student.schema";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true, id: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const body = await req.json();
  const parsed = guardianLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  let guardianUserId = parsed.data.userId;

  // Create new user if not linking existing
  if (!guardianUserId) {
    if (!parsed.data.firstName || !parsed.data.lastName || !parsed.data.phone) {
      return NextResponse.json(
        { error: "First name, last name, and phone are required for new guardians" },
        { status: 400 }
      );
    }

    // Check if user with this phone already exists in school
    const existingUser = await prisma.user.findFirst({
      where: { phone: parsed.data.phone, schoolId: user.schoolId },
    });

    if (existingUser) {
      guardianUserId = existingUser.id;
    } else {
      const newUser = await prisma.user.create({
        data: {
          clerkId: `guardian_${Date.now()}`,
          schoolId: user.schoolId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: parsed.data.phone,
          email: parsed.data.email || null,
          role: "parent",
        },
      });
      guardianUserId = newUser.id;
    }
  } else {
    // Verify existing user belongs to this school
    const existingUser = await prisma.user.findFirst({
      where: { id: guardianUserId, schoolId: user.schoolId },
    });
    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  // Check if already linked
  const existingLink = await prisma.guardian.findUnique({
    where: { userId_studentId: { userId: guardianUserId, studentId: student.id } },
  });
  if (existingLink) {
    return NextResponse.json(
      { error: "This guardian is already linked to this student" },
      { status: 409 }
    );
  }

  // If setting as primary, unset others
  if (parsed.data.isPrimary) {
    await prisma.guardian.updateMany({
      where: { studentId: student.id, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const guardian = await prisma.guardian.create({
    data: {
      userId: guardianUserId,
      studentId: student.id,
      relationship: parsed.data.relationship,
      isPrimary: parsed.data.isPrimary,
      canPickup: parsed.data.canPickup,
      verified: true,
      verifiedAt: new Date(),
      verifiedBy: user.id,
    },
    include: { user: true },
  });

  return NextResponse.json({ success: true, guardian }, { status: 201 });
}