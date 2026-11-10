import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { schoolSettingsSchema } from '@/lib/validations/school.schema';

// ── GET: Fetch school settings ──────────────────────────────
export async function GET(req: NextRequest) {
  // 1. Allow all authenticated roles within the school
  const guard = await requireUser(['admin', 'deputy', 'teacher', 'bursar', 'parent', 'it_admin']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  // 2. Conditionally select geofence fields ONLY for admin/it_admin (SEC-13)
  const isPrivileged = user.role === 'admin' || user.role === 'it_admin';

  const school = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: {
      id: true,
      name: true,
      knecCode: true,
      address: true,
      county: true,
      subCounty: true,
      phone: true,
      email: true,
      logoUrl: true,
      ...(isPrivileged ? {
        latitude: true,
        longitude: true,
        geofenceRadius: true,
      } : {}),
    },
  });

  if (!school) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  return NextResponse.json({ school }, { status: 200 });
}

// ── PUT: Update school settings ─────────────────────────────
export async function PUT(req: NextRequest) {
  // 1. Strict role gating: Only admin or it_admin can update settings (R1-18)
  const guard = await requireUser(['admin', 'it_admin']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  // 2. Parse and validate payload
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = schoolSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 });
  }

  const dataToUpdate = parsed.data;

  // 3. Fetch old data for the audit log
  const oldSchool = await prisma.school.findUnique({
    where: { id: user.schoolId },
    select: {
      name: true,
      phone: true,
      email: true,
      logoUrl: true,
      latitude: true,
      longitude: true,
      geofenceRadius: true,
    },
  });

  if (!oldSchool) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);

  // 4. Atomic update + Audit Log (R5-01)
  const updatedSchool = await prisma.$transaction(async (tx) => {
    const updated = await tx.school.update({
      where: { id: user.schoolId },
      data: dataToUpdate,
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'SCHOOL_SETTINGS_UPDATED', // As requested
      tableName: 'schools',
      recordId: user.schoolId,
      oldData: oldSchool,
      newData: dataToUpdate,
      ipAddress,
      userAgent,
    }, tx);

    return updated;
  });

  return NextResponse.json({ success: true, school: updatedSchool }, { status: 200 });
}