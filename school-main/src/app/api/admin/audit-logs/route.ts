import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { userId, sessionClaims } = auth();
    
    // Only admins can view audit logs
    if (!userId || (sessionClaims as any)?.metadata?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const schoolId = (sessionClaims as any)?.metadata?.schoolId;
    if (!schoolId) {
      return NextResponse.json({ error: "School context not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    const logs = await prisma.auditLog.findMany({
      where: { schoolId },
      include: {
        actor: {
          select: { firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error("Audit logs fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}