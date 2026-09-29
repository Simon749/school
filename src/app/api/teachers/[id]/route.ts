import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { updateTeacherSchema } from "@/lib/validations/teacher.schema";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nationalId: true,
          isActive: true,
          clerkId: true,
        },
      },
      classTeacherStream: { include: { grade: true } },
    },
  });

  if (!teacher) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ teacher });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!admin?.schoolId || admin.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateTeacherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId: admin.schoolId },
    include: { user: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = parsed.data;

  // Validate stream
  if (data.isClassTeacher && data.classTeacherStreamId) {
    const stream = await prisma.stream.findFirst({
      where: { id: data.classTeacherStreamId, schoolId: admin.schoolId },
    });
    if (!stream) return NextResponse.json({ error: "Invalid stream" }, { status: 400 });
  }

  // Check TSC uniqueness if changing
  if (data.tscNumber && data.tscNumber !== existing.tscNumber) {
    const dup = await prisma.teacher.findFirst({
      where: { tscNumber: data.tscNumber, schoolId: admin.schoolId, NOT: { id: params.id } },
    });
    if (dup) return NextResponse.json({ error: "TSC number already in use" }, { status: 409 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Unassign previous class teacher if taking over a stream
    if (data.isClassTeacher && data.classTeacherStreamId && data.classTeacherStreamId !== existing.classTeacherStreamId) {
      await tx.teacher.updateMany({
        where: { classTeacherStreamId: data.classTeacherStreamId, schoolId: admin.schoolId, NOT: { id: params.id } },
        data: { isClassTeacher: false, classTeacherStreamId: null },
      });
    }

    // Update user
    const userUpdate: any = {};
    if (data.firstName !== undefined) userUpdate.firstName = data.firstName;
    if (data.lastName !== undefined) userUpdate.lastName = data.lastName;
    if (data.email !== undefined) userUpdate.email = data.email || null;
    if (data.phone !== undefined) userUpdate.phone = data.phone || null;
    if (data.nationalId !== undefined) userUpdate.nationalId = data.nationalId || null;

    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: existing.userId }, data: userUpdate });
    }

    // Update teacher
    const teacherUpdate: any = {};
    if (data.tscNumber !== undefined) teacherUpdate.tscNumber = data.tscNumber || null;
    if (data.employmentType !== undefined) teacherUpdate.employmentType = data.employmentType;
    if (data.specialisation !== undefined) teacherUpdate.specialisation = data.specialisation.join(", ");
    if (data.isClassTeacher !== undefined) teacherUpdate.isClassTeacher = data.isClassTeacher;
    if (data.isClassTeacher === false) {
      teacherUpdate.classTeacherStreamId = null;
    } else if (data.classTeacherStreamId !== undefined) {
      teacherUpdate.classTeacherStreamId = data.classTeacherStreamId || null;
    }

    const teacher = await tx.teacher.update({
      where: { id: params.id },
      data: teacherUpdate,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            nationalId: true,
            isActive: true,
          },
        },
        classTeacherStream: { include: { grade: true } },
      },
    });

    return teacher;
  });

  return NextResponse.json({ success: true, teacher: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!admin?.schoolId || admin.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teacher = await prisma.teacher.findFirst({
    where: { id: params.id, schoolId: admin.schoolId },
    include: { user: true },
  });
  if (!teacher) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.teacher.delete({ where: { id: params.id } }),
    prisma.user.update({ where: { id: teacher.userId }, data: { deletedAt: new Date(), isActive: false } }),
  ]);

  return NextResponse.json({ success: true });
}