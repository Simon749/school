import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = auth();
  if (!clerkId) return new NextResponse("Unauthorized", { status: 401 });

  const authUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true },
  });
  if (!authUser) return new NextResponse("Unauthorized", { status: 401 });

  const terms = await prisma.term.findMany({
    where: { schoolId: authUser.schoolId },
    orderBy: { startDate: "asc" },
  });

  return NextResponse.json(terms);
}