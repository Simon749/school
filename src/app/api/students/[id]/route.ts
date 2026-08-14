import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { updateStudentSchema } from "@/lib/validations/student.schema";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
    include: {
      stream: { include: { grade: true } },
      guardians: {
        where: { isActive: true },
        include: { user: true },
        orderBy: { isPrimary: "desc" },
      },
    },
  });

  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ student });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
  const parsed = updateStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If changing stream, verify it
  if (parsed.data.streamId) {
    const stream = await prisma.stream.findFirst({
      where: { id: parsed.data.streamId, schoolId: user.schoolId },
    });
    if (!stream) return NextResponse.json({ error: "Invalid stream" }, { status: 400 });
  }

  // If changing NEMIS, check uniqueness
  if (parsed.data.nemisNumber && parsed.data.nemisNumber !== existing.nemisNumber) {
    const duplicate = await prisma.student.findFirst({
      where: { nemisNumber: parsed.data.nemisNumber, schoolId: user.schoolId, NOT: { id: params.id } },
    });
    if (duplicate) {
      return NextResponse.json({ error: "NEMIS number already in use" }, { status: 409 });
    }
  }

  const updateData: any = {};
  if (parsed.data.firstName !== undefined) updateData.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) updateData.lastName = parsed.data.lastName;
  if (parsed.data.nemisNumber !== undefined) updateData.nemisNumber = parsed.data.nemisNumber;
  if (parsed.data.admissionNumber !== undefined) updateData.admissionNumber = parsed.data.admissionNumber || null;
  if (parsed.data.dateOfBirth !== undefined) updateData.dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null;
  if (parsed.data.gender !== undefined) updateData.gender = parsed.data.gender || null;
  if (parsed.data.streamId !== undefined) updateData.streamId = parsed.data.streamId;
  if (parsed.data.isBoarding !== undefined) updateData.isBoarding = parsed.data.isBoarding;
  if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl || null;
  if (parsed.data.medicalNotes !== undefined) updateData.medicalNotes = parsed.data.medicalNotes || null;
  if (parsed.data.previousSchool !== undefined) updateData.previousSchool = parsed.data.previousSchool || null;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

  const student = await prisma.student.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ success: true, student });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
  });
  if (!student) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.student.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: "withdrawn" },
  });

  return NextResponse.json({ success: true });
}