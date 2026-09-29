import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // FIX 1: Await the auth() function
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // FIX 3: Verify role and schoolId via Prisma to perfectly match the Dashboard's logic
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { role: true, schoolId: true },
    });

    if (!user || (user.role !== "admin" && user.role !== "it_admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const logs = await prisma.auditLog.findMany({
      where: { schoolId: user.schoolId },
      include: {
        actor: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    // FIX 2: Serialize BigInt IDs to strings to prevent Next.js JSON crash
    const serializedLogs = logs.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));

    return NextResponse.json(serializedLogs);
  } catch (error) {
    console.error("Audit logs fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}