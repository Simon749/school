import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import * as fs from "fs";
import * as path from "path";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const filepath = path.join(process.cwd(), "public", "exports", `${jobId}.csv`);

    if (!fs.existsSync(filepath)) {
      return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(filepath);
    
    // Optional: Delete file after download to save disk space
    // fs.unlinkSync(filepath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="export-${jobId}.csv"`,
      },
    });
  } catch (error) {
    console.error("[EXPORT_DOWNLOAD_ERROR]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}