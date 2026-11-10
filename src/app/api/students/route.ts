import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import { studentSchema } from '@/lib/validations/student.schema';

// GET: List students (Admin only, scoped to school)
export async function GET(req: NextRequest) {
  // R1-14: Use central guard. Automatically checks auth, isActive, deletedAt, and role.
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const search = searchParams.get('search')?.trim();
  const gradeId = searchParams.get('gradeId');
  const streamId = searchParams.get('streamId');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    schoolId: user.schoolId, // SEC-11: Strictly scoped to caller's school
    deletedAt: null,
  };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { nemisNumber: { contains: search, mode: 'insensitive' } },
      { admissionNumber: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (streamId) {
    where.streamId = streamId;
  } else if (gradeId) {
    where.stream = { gradeId };
  }

  const skip = (page - 1) * limit;

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        stream: { include: { grade: true } },
        _count: { select: { guardians: true } },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return NextResponse.json({
    students,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

// POST: Create a new student (Admin only)
export async function POST(req: NextRequest) {
  // R1-14: Use central guard
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = studentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // SEC-11: Verify stream belongs to the caller's school
  const stream = await prisma.stream.findFirst({
    where: { id: parsed.data.streamId, schoolId: user.schoolId },
  });
  if (!stream) {
    return NextResponse.json({ error: 'Invalid stream' }, { status: 400 });
  }

  // Check NEMIS uniqueness within the school (ignoring soft-deleted records)
  const existing = await prisma.student.findFirst({
    where: { 
      nemisNumber: parsed.data.nemisNumber, 
      schoolId: user.schoolId,
      deletedAt: null 
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: `NEMIS number ${parsed.data.nemisNumber} already exists` },
      { status: 409 }
    );
  }

  const student = await prisma.student.create({
    data: {
      schoolId: user.schoolId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      nemisNumber: parsed.data.nemisNumber,
      admissionNumber: parsed.data.admissionNumber || null,
      dateOfBirth: parsed.data.dateOfBirth ? new Date(parsed.data.dateOfBirth) : null,
      gender: parsed.data.gender || null,
      streamId: parsed.data.streamId,
      isBoarding: parsed.data.isBoarding,
      photoUrl: parsed.data.photoUrl || null,
      medicalNotes: parsed.data.medicalNotes || null,
      previousSchool: parsed.data.previousSchool || null,
    },
  });

  return NextResponse.json({ success: true, student }, { status: 201 });
}