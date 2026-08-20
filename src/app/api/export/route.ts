import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { exportQueue, ExportType } from "@/lib/export/queue";

export async function POST(req: NextRequest) {
  try {
    const { userId, sessionClaims } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { type, filters, format = "csv" } = body;

    // Validate export type
    const validTypes: ExportType[] = [
      "attendance-class",
      "attendance-student",
      "attendance-teacher",
      "fees-daily",
      "fees-term",
      "fees-defaulters",
      "results-markbook",
      "results-portfolio",
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
    }

    const schoolId = (sessionClaims as any)?.metadata?.schoolId;
    if (!schoolId) {
      return NextResponse.json({ error: "School context not found" }, { status: 400 });
    }

    // Enqueue the export job
    const job = await exportQueue.add(`export-${type}`, {
      type,
      schoolId,
      userId,
      filters,
      format,
    });

    return NextResponse.json({
      jobId: job.id,
      message: "Export job queued. Poll /api/export/status for completion.",
    });
  } catch (error) {
    console.error("Export queue error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}