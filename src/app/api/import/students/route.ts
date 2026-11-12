import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import Papa from 'papaparse';
import { csvStudentRowSchema } from '@/lib/validations/import.schema';
import { smsQueue } from '@/lib/queue';
import { redis } from '@/lib/redis';
import { checkRateLimit } from '@/lib/rate-limit';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { v4 as uuidv4 } from 'uuid';

const MAX_ROWS = 500;
const PREVIEW_TTL_SECONDS = 15 * 60; // 15 minutes

export async function POST(req: NextRequest) {
  // R1-14: Use central guard (Admins and IT Admins can import)
  const guard = await requireUser(['admin', 'it_admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const rateLimit = await checkRateLimit({
    uniqueKey: `import:execute:${user.id}`,
    limit: 5,
    windowInSeconds: 60,
  });
  if (!rateLimit.success) {
    return NextResponse.json({ error: 'Too many import requests. Please wait.' }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const previewToken = formData.get('previewToken') as string | null;
  const execute = formData.get('execute') === 'true';

  // --- STEP 2: EXECUTE ---
  if (execute && previewToken) {
    return await executeImport(user.schoolId, user.id, previewToken, req);
  }

  // --- STEP 1: PREVIEW ---
  if (file && !execute) {
    return await previewImport(user.schoolId, file);
  }

  return NextResponse.json(
    { error: 'Invalid request. Provide a file for preview, or a previewToken to execute.' },
    { status: 400 }
  );
}

async function previewImport(schoolId: string, file: File) {
  const text = await file.text();
  const parseResult = Papa.parse(text, { header: true, skipEmptyLines: true });
  const rows = parseResult.data as any[];

  if (rows.length === 0) {
    return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `File too large. Maximum ${MAX_ROWS} rows allowed per import.` }, { status: 400 });
  }

  const streams = await prisma.stream.findMany({ where: { schoolId }, include: { grade: true } });
  const streamMap = new Map<string, string>();
  streams.forEach((s) => streamMap.set(`${s.grade.name}-${s.name}`.toLowerCase(), s.id));

  // Fetch existing NEMIS to check for duplicates
  const existingStudents = await prisma.student.findMany({
    where: { schoolId, deletedAt: null },
    select: { nemisNumber: true },
  });
  const existingNemisSet = new Set(existingStudents.map((s) => s.nemisNumber));

  const errors: { row: number; message: string }[] = [];
  const validRows: any[] = [];
  const seenNemisInCsv = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based index + header

    const parsed = csvStudentRowSchema.safeParse(row);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      errors.push({ row: rowNum, message: firstError?.message ?? 'Validation error' });
      continue;
    }

    const data = parsed.data;
    const streamId = streamMap.get(`${data.grade_name}-${data.stream_name}`.toLowerCase());

    if (!streamId) {
      errors.push({ row: rowNum, message: `Grade/Stream '${data.grade_name}-${data.stream_name}' not found` });
      continue;
    }

    if (existingNemisSet.has(data.nemis_number) || seenNemisInCsv.has(data.nemis_number)) {
      errors.push({ row: rowNum, message: 'Duplicate NEMIS number (exists in DB or earlier in CSV)' });
      continue;
    }

    seenNemisInCsv.add(data.nemis_number);
    
    validRows.push({
      ...data,
      streamId,
      cleanPhone: data.guardian_phone.replace(/\D/g, ''),
    });
  }

  if (validRows.length === 0) {
    return NextResponse.json({
      success: false,
      totalRows: rows.length,
      validCount: 0,
      errorCount: errors.length,
      errors: errors.slice(0, 50),
    });
  }

  const previewToken = uuidv4();
  const redisKey = `import:preview:${schoolId}:${previewToken}`;
  
  // Store valid rows in Redis for 15 minutes
  await redis.setex(redisKey, PREVIEW_TTL_SECONDS, JSON.stringify(validRows));

  return NextResponse.json({
    success: true,
    previewToken,
    totalRows: rows.length,
    validCount: validRows.length,
    errorCount: errors.length,
    errors: errors.slice(0, 50),
  });
}

async function executeImport(schoolId: string, actorId: string, previewToken: string, req: NextRequest) {
  const redisKey = `import:preview:${schoolId}:${previewToken}`;
  const cachedData = await redis.get(redisKey);

  if (!cachedData) {
    return NextResponse.json(
      { error: 'Preview token expired or not found. Please upload the file again.' },
      { status: 400 }
    );
  }

  const validRows = JSON.parse(cachedData) as any[];
  
  // Fetch existing users by phone to reuse them (Parent Dedupe)
  const phones = [...new Set(validRows.map((r) => r.cleanPhone))];
  const existingUsers = await prisma.user.findMany({
    where: { phone: { in: phones }, schoolId, deletedAt: null },
    select: { id: true, phone: true },
  });
  const userMap = new Map<string, string>();
  existingUsers.forEach((u) => {
    if (u.phone) userMap.set(u.phone.replace(/\D/g, ''), u.id);
  });

  let successCount = 0;
  const errors: { row: number; message: string }[] = [];
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  for (let i = 0; i < validRows.length; i++) {
    const data = validRows[i];
    const rowNum = i + 2;

    try {
      await prisma.$transaction(async (tx) => {
        let userId = userMap.get(data.cleanPhone);

        if (!userId) {
          // Create new parent user if they don't exist
          const newUser = await tx.user.create({
            data: {
              schoolId,
              phone: data.cleanPhone,
              role: 'parent',
              firstName: data.guardian_first_name,
              lastName: data.guardian_last_name,
              notificationPref: 'immediate',
              isActive: true,
            },
          });
          userId = newUser.id;
          userMap.set(data.cleanPhone, userId); // Cache for subsequent rows
        }

        const student = await tx.student.create({
          data: {
            schoolId,
            nemisNumber: data.nemis_number,
            admissionNumber: data.admission_number || null,
            firstName: data.first_name,
            lastName: data.last_name,
            dateOfBirth: data.date_of_birth ? new Date(data.date_of_birth) : null,
            gender: data.gender || null,
            streamId: data.streamId,
            isBoarding: data.is_boarding || false,
            status: 'active',
          },
        });

        // Link guardian (check if link already exists to prevent unique constraint errors)
        const existingGuardian = await tx.guardian.findFirst({
          where: { userId, studentId: student.id },
        });

        if (!existingGuardian) {
          await tx.guardian.create({
            data: {
              userId,
              studentId: student.id,
              relationship: data.guardian_relationship,
              isPrimary: true,
              canPickup: true,
              verified: false,
              isActive: true,
            },
          });
        }
      });

      // Queue SMS outside transaction
      await smsQueue.add('send-welcome-sms', {
        phone: data.cleanPhone,
        studentName: `${data.first_name} ${data.last_name}`,
        schoolName: school?.name || 'our school',
      });

      successCount++;
    } catch (dbError: any) {
      console.error(`DB Error on row ${rowNum}:`, dbError);
      errors.push({
        row: rowNum,
        message: dbError.code === 'P2002' ? 'Duplicate record in database' : 'Database error occurred',
      });
    }
  }

  // Clean up Redis
  await redis.del(redisKey);

  const { ipAddress, userAgent } = getRequestMetadata(req);
  await logAudit({
    schoolId,
    actorId,
    action: 'student.import.bulk',
    tableName: 'students',
    newData: {
      totalProcessed: validRows.length,
      successCount,
      errorCount: errors.length,
    },
    ipAddress,
    userAgent,
  });

  return NextResponse.json({
    success: true,
    successCount,
    errorCount: errors.length,
    totalProcessed: validRows.length,
    errors: errors.slice(0, 50),
  });
}