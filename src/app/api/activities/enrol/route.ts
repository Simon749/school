import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const activities = await prisma.activity.findMany({
    where: { schoolId: user.schoolId, isActive: true },
    include: { _count: { select: { enrolments: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ activities });
}

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
  const { name, description, feePerTerm, maxCapacity } = body;

  const activity = await prisma.activity.create({
    data: {
      schoolId: user.schoolId,
      name,
      description,
      feePerTerm: feePerTerm || 0,
      maxCapacity: maxCapacity || null,
    },
  });

  return NextResponse.json({ activity }, { status: 201 });
}
