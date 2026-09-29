import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });

  if (!user?.schoolId || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone")?.trim();
  const email = searchParams.get("email")?.trim();

  if (!phone && !email) {
    return NextResponse.json({ error: "Provide phone or email" }, { status: 400 });
  }

  const where: any = { schoolId: user.schoolId, role: "parent" };
  if (phone) where.phone = { contains: phone, mode: "insensitive" };
  if (email) where.email = { contains: email, mode: "insensitive" };

  const users = await prisma.user.findMany({
    where,
    take: 10,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
    },
  });

  return NextResponse.json({ users });
}