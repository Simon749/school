import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import type { FeeItem } from "@prisma/client";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, schoolId: true, role: true },
  });
  if (!user?.schoolId || !["admin", "bursar"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { structureId, streamId, studentIds } = body as {
    structureId: string;
    streamId?: string;
    studentIds?: string[];
  };

  const structure = await prisma.feeStructure.findFirst({
    where: { id: structureId, schoolId: user.schoolId },
    include: { feeItems: true },
  });
  if (!structure) return NextResponse.json({ error: "Structure not found" }, { status: 404 });

  let targets: string[] = studentIds || [];
  if (streamId && !studentIds) {
    const students = await prisma.student.findMany({
      where: { streamId, schoolId: user.schoolId, deletedAt: null, status: "active" },
      select: { id: true },
    });
    targets = students.map((s) => s.id);
  }

  const created = await prisma.$transaction(
    targets.flatMap((studentId: string) =>
      structure.feeItems.map((item: FeeItem) =>
        prisma.studentFee.upsert({
          where: {
            studentId_termId_feeItemId: {
              studentId,
              termId: structure.termId,
              feeItemId: item.id,
            },
          },
          update: { amountDue: item.amount },
          create: {
            schoolId: user.schoolId,
            studentId,
            termId: structure.termId,
            feeItemId: item.id,
            amountDue: item.amount,
          },
        })
      )
    )
  );

  return NextResponse.json({ success: true, assigned: created.length });
}