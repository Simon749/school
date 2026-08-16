import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!user?.schoolId || !["admin", "bursar"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { termId, name, appliesTo, items } = body;

  const structure = await prisma.feeStructure.create({
    data: {
      schoolId: user.schoolId,
      termId,
      name,
      appliesTo,
      feeItems: { create: items },
    },
    include: { feeItems: true },
  });

  return NextResponse.json({ success: true, structure }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId");

  const structures = await prisma.feeStructure.findMany({
    where: { schoolId: user.schoolId, ...(termId ? { termId } : {}) },
    include: { feeItems: { orderBy: { orderIndex: "asc" } } },
  });

  return NextResponse.json({ structures });
}