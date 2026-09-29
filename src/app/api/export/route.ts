import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { exportQueue } from "@/lib/export/queue"; // Adjust path if needed

export async function POST(req: NextRequest) {
  try {
    // FIX 1: Await auth() to properly resolve the session
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // FIX 2: Verify role and schoolId via Prisma (Single Source of Truth)
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      select: { id: true, role: true, schoolId: true },
    });

    if (!user || !["it_admin", "admin", "bursar"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized: Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const { type, filters, format = "csv" } = body;

    // Validate export type
    const validTypes = [
      "attendance-class",
      "attendance-student",
      "attendance-teacher",
      "fees-daily",
      "fees-term",
      "fees-defaulters",
      "results-markbook",
      "results-portfolio",
      "students", // Added to match your frontend
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
    }

    // Enqueue the export job
    const job = await exportQueue.add(`export-${type}`, {
      type,
      schoolId: user.schoolId, // Safely derived from Prisma
      userId: user.id,         // Use internal DB ID for the worker, not Clerk ID
      filters,
      format,
    });

    return NextResponse.json({
      jobId: job.id,
      message: "Export job queued successfully.",
    });
  } catch (error) {
    console.error("[EXPORT_QUEUE_ERROR]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}