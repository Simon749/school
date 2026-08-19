import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import Papa from "papaparse";
import { csvStudentRowSchema } from "@/lib/validations/import.schema";

export async function POST(req: NextRequest) {
  try {
    const { userId, sessionClaims } = auth();
    // Enforce admin-only access for bulk imports
    if (!userId || (sessionClaims as any)?.metadata?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    
    // Parse CSV synchronously to get data array
    const parseResult = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = parseResult.data as any[];
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV file is empty or has no valid rows" }, { status: 400 });
    }
    
    // Batch fetch existing data for efficient validation
    const nemisNumbers = rows.map((r: any) => r.nemis_number).filter(Boolean);
    const existingNemis = await db.student.findMany({
      where: { nemisNumber: { in: nemisNumbers }, deletedAt: null },
      select: { nemisNumber: true },
    });
    const existingNemisSet = new Set(existingNemis.map(s => s.nemisNumber));

    const streams = await db.stream.findMany({
      include: { grade: true },
    });
    const streamMap = new Map<string, string>();
    streams.forEach(s => {
      streamMap.set(`${s.grade.name}-${s.name}`, s.id);
    });

    const validationResults = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, accounting for header row
      
      // 1. Zod Schema Validation
      const parsed = csvStudentRowSchema.safeParse(row);
      if (!parsed.success) {
        validationResults.push({
          row: rowNum,
          status: "error",
          errors: parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", "),
          data: row,
        });
        continue;
      }

      const data = parsed.data;
      const errors: string[] = [];

      // 2. Business Logic Validation
      if (existingNemisSet.has(data.nemis_number)) {
        errors.push("NEMIS number already exists in the system");
      }

      const streamKey = `${data.grade_name}-${data.stream_name}`;
      const streamId = streamMap.get(streamKey);
      if (!streamId) {
        errors.push(`Grade/Stream '${data.grade_name} - ${data.stream_name}' not found. Please create it first.`);
      }

      if (errors.length > 0) {
        validationResults.push({
          row: rowNum,
          status: "error",
          errors: errors.join("; "),
          data: row,
        });
      } else {
        validationResults.push({
          row: rowNum,
          status: "valid",
          data: { ...data, streamId },
        });
      }
    }

    return NextResponse.json({
      totalRows: rows.length,
      validCount: validationResults.filter(r => r.status === "valid").length,
      errorCount: validationResults.filter(r => r.status === "error").length,
      results: validationResults,
    });
  } catch (error) {
    console.error("Import validation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}