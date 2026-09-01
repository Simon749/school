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

  if (!user?.schoolId) {
    return NextResponse.json({ error: "No school assigned" }, { status: 400 });
  }

  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const grades = await prisma.grade.findMany({
    where: { schoolId: user.schoolId },
    orderBy: { level: "asc" },
    include: {
      streams: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: { students: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ grades });
}