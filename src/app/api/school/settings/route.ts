import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true },
  });

  if (!user?.schoolId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: { latitude: true, longitude: true, geofenceRadius: true, name: true },
  });

  if (!school) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(school);
}