import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

const exportQueue = new Queue("exports", { connection: redis });

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const job = await exportQueue.getJob(params.jobId);
    
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const state = await job.getState();
    
    if (state === "completed") {
      return NextResponse.json({
        status: "completed",
        downloadUrl: job.returnvalue?.downloadUrl,
        filename: job.returnvalue?.filename,
      });
    } else if (state === "failed") {
      return NextResponse.json({
        status: "failed",
        error: job.failedReason,
      });
    } else {
      return NextResponse.json({
        status: state, // "waiting", "active", "delayed"
      });
    }
  } catch (error) {
    console.error("Export status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}