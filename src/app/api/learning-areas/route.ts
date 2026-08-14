import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const areas = await prisma.learningArea.findMany({
    where: { schoolId: user.schoolId },
    orderBy: [{ cbcStage: "asc" }, { name: "asc" }],
    select: { id: true, name: true, cbcStage: true },
  });

  return NextResponse.json({ areas });
}