import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import Papa from "papaparse";
import { csvStudentRowSchema } from "@/lib/validations/import.schema";
import { Queue } from "bullmq";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit, getRequestMetadata } from "@/lib/audit";

const smsQueue = new Queue("sms", { connection: redis });

export async function POST(req: NextRequest) {
  try {
    const { userId, sessionClaims } = auth();
    if (!userId || (sessionClaims as any)?.metadata?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const rateLimit = await checkRateLimit({
      uniqueKey: `import:execute:${userId}`,
      limit: 2, // Max 2 actual imports per minute (prevents accidental double-clicks or spam)
      windowInSeconds: 60,
    });

    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many import requests. Please wait before trying again." },
        { status: 429 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const execute = formData.get("execute") === "true";

    if (!file || !execute) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const text = await file.text();
    const parseResult = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parseResult.data as any[];

    const schoolId = (sessionClaims as any)?.metadata?.schoolId;
    if (!schoolId) {
      return NextResponse.json({ error: "School context not found" }, { status: 400 });
    }

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, id: true } });
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const streams = await prisma.stream.findMany({ where: { schoolId }, include: { grade: true } });
    const streamMap = new Map<string, string>();
    streams.forEach((s: any) => {
      streamMap.set(`${s.grade.name}-${s.name}`, s.id);
    });

    let successCount = 0;
    let errorCount = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const parsed = csvStudentRowSchema.safeParse(row);
      if (!parsed.success) {
        errorCount++;
        errors.push({ row: rowNum, message: parsed.error.errors[0].message });
        continue;
      }

      const data = parsed.data;
      const streamId = streamMap.get(`${data.grade_name}-${data.stream_name}`);

      if (!streamId) {
        errorCount++;
        errors.push({ row: rowNum, message: `Grade/Stream '${data.grade_name}-${data.stream_name}' not found` });
        continue;
      }

      const existingNemis = await prisma.student.findFirst({
        where: { nemisNumber: data.nemis_number, schoolId, deletedAt: null },
      });

      if (existingNemis) {
        errorCount++;
        errors.push({ row: rowNum, message: "NEMIS number already exists" });
        continue;
      }

      try {
        await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              schoolId,
              phone: data.guardian_phone,
              role: "parent",
              firstName: data.guardian_first_name,
              lastName: data.guardian_last_name,
              notificationPref: "immediate",
              isActive: true,
            },
          });

          const student = await tx.student.create({
            data: {
              schoolId,
              nemisNumber: data.nemis_number,
              admissionNumber: data.admission_number || null,
              firstName: data.first_name,
              lastName: data.last_name,
              dateOfBirth: data.date_of_birth ? new Date(data.date_of_birth) : null,
              gender: data.gender || null,
              streamId,
              isBoarding: data.is_boarding || false,
              status: "active",
            },
          });

          await tx.guardian.create({
            data: {
              userId: user.id,
              studentId: student.id,
              relationship: data.guardian_relationship,
              isPrimary: true,
              canPickup: true,
              verified: false,
              isActive: true,
            },
          });

          return { user, student };
        });

        await smsQueue.add("send-welcome-sms", {
          phone: data.guardian_phone,
          studentName: `${data.first_name} ${data.last_name}`,
          schoolName: school.name,
        });

        successCount++;
      } catch (dbError: any) {
        console.error(`DB Error on row ${rowNum}:`, dbError);
        errorCount++;
        if (dbError.code === "P2002") {
          errors.push({ row: rowNum, message: "Duplicate NEMIS or Phone Number in database" });
        } else {
          errors.push({ row: rowNum, message: "Database error occurred" });
        }
      }
    }

    // Audit the bulk import as a single event: who ran it, against which school,
    // and the outcome counts. Per-row student/guardian creation already happens
    // inside its own transaction above; this entry is the record-of-record that
    // an import was executed at all, and what it did in aggregate.
    const { ipAddress, userAgent } = getRequestMetadata(req);
    await logAudit({
      schoolId,
      actorId: userId,
      action: "student.import.bulk",
      tableName: "students",
      newData: {
        totalProcessed: rows.length,
        successCount,
        errorCount,
      },
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      successCount,
      errorCount,
      totalProcessed: rows.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    console.error("Import execution error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}