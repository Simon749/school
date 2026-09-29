import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { updateStreamSchema } from "@/lib/validations/grade-stream";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stream = await prisma.stream.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
  });

  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateStreamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // If renaming, check for duplicates within the same grade
  if (parsed.data.name && parsed.data.name !== stream.name) {
    const duplicate = await prisma.stream.findFirst({
      where: {
        gradeId: stream.gradeId,
        name: { equals: parsed.data.name, mode: "insensitive" },
        NOT: { id: params.id },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: `Stream "${parsed.data.name}" already exists for this grade` },
        { status: 409 }
      );
    }
  }

  const updated = await prisma.stream.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ success: true, stream: updated });
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

  const stream = await prisma.stream.findFirst({
    where: { id: params.id, schoolId: user.schoolId },
    include: {
      _count: {
        select: { students: true },
      },
    },
  });

  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (stream._count.students > 0) {
    return NextResponse.json(
      { error: "Cannot delete a stream that has enrolled students. Transfer or remove students first." },
      { status: 400 }
    );
  }

  await prisma.stream.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}