import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { updateStudentSchema } from '@/lib/validations/student.schema';

/**
 * Full student profile — ADMIN ONLY (SEC-02). The only caller is the admin profile page.
 * Explicit field whitelist: no `include`, and guardians expose name/phone only (never their
 * email, national ID, Clerk ID or device data). Parents/teachers get their own scoped endpoints.
 */
const STUDENT_PROFILE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  nemisNumber: true,
  admissionNumber: true,
  dateOfBirth: true,
  gender: true,
  isBoarding: true,
  status: true,
  photoUrl: true,
  medicalNotes: true,
  previousSchool: true,
  stream: {
    select: { name: true, capacity: true, grade: { select: { name: true } } },
  },
  guardians: {
    where: { isActive: true },
    orderBy: { isPrimary: 'desc' as const },
    select: {
      id: true,
      relationship: true,
      isPrimary: true,
      canPickup: true,
      user: { select: { firstName: true, lastName: true, phone: true } },
    },
  },
} as const;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
    select: STUDENT_PROFILE_SELECT,
  });

  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ student });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const body = await req.json();
  const parsed = updateStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If changing stream, verify it
  if (parsed.data.streamId) {
    const stream = await prisma.stream.findFirst({
      where: { id: parsed.data.streamId, schoolId: user.schoolId },
    });
    if (!stream) return NextResponse.json({ error: 'Invalid stream' }, { status: 400 });
  }

  // If changing NEMIS, check uniqueness
  if (parsed.data.nemisNumber && parsed.data.nemisNumber !== existing.nemisNumber) {
    const duplicate = await prisma.student.findFirst({
      where: {
        nemisNumber: parsed.data.nemisNumber,
        schoolId: user.schoolId,
        NOT: { id: params.id },
      },
    });
    if (duplicate) {
      return NextResponse.json({ error: 'NEMIS number already in use' }, { status: 409 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};
  if (parsed.data.firstName !== undefined) updateData.firstName = parsed.data.firstName;
  if (parsed.data.lastName !== undefined) updateData.lastName = parsed.data.lastName;
  if (parsed.data.nemisNumber !== undefined) updateData.nemisNumber = parsed.data.nemisNumber;
  if (parsed.data.admissionNumber !== undefined)
    updateData.admissionNumber = parsed.data.admissionNumber || null;
  if (parsed.data.dateOfBirth !== undefined)
    updateData.dateOfBirth = parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null;
  if (parsed.data.gender !== undefined) updateData.gender = parsed.data.gender || null;
  if (parsed.data.streamId !== undefined) updateData.streamId = parsed.data.streamId;
  if (parsed.data.isBoarding !== undefined) updateData.isBoarding = parsed.data.isBoarding;
  if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl || null;
  if (parsed.data.medicalNotes !== undefined)
    updateData.medicalNotes = parsed.data.medicalNotes || null;
  if (parsed.data.previousSchool !== undefined)
    updateData.previousSchool = parsed.data.previousSchool || null;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

  const student = await prisma.student.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ success: true, student });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const student = await prisma.student.findFirst({
    where: { id: params.id, schoolId: user.schoolId, deletedAt: null },
  });
  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.student.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), status: 'withdrawn' },
  });

  return NextResponse.json({ success: true });
}
