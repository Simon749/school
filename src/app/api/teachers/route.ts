import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import { teacherSchema } from '@/lib/validations/teacher.schema';

// GET: List teachers (Admin only, scoped to school)
export async function GET(req: NextRequest) {
  // R1-14 / R1-16: Use central guard. Automatically checks auth, isActive, deletedAt, and role.
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    schoolId: user.schoolId, // SEC-11: Strictly scoped to caller's school
    user: { deletedAt: null },
  };

  if (search) {
    where.OR = [
      { user: { firstName: { contains: search, mode: 'insensitive' } } },
      { user: { lastName: { contains: search, mode: 'insensitive' } } },
      { tscNumber: { contains: search, mode: 'insensitive' } },
      { user: { nationalId: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const teachers = await prisma.teacher.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nationalId: true,
          isActive: true,
        },
      },
      classTeacherStream: {
        include: { grade: true },
      },
    },
  });

  return NextResponse.json({ teachers });
}

// POST: Create a new teacher (Admin only)
export async function POST(req: NextRequest) {
  // R1-14 / R1-16: Use central guard
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = teacherSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // SEC-11: Validate stream belongs to the caller's school if assigning as class teacher
  if (data.isClassTeacher && data.classTeacherStreamId) {
    const stream = await prisma.stream.findFirst({
      where: { id: data.classTeacherStreamId, schoolId: user.schoolId },
    });
    if (!stream) {
      return NextResponse.json({ error: 'Invalid stream for class teacher' }, { status: 400 });
    }
  }

  // Check TSC number uniqueness within the school
  if (data.tscNumber) {
    const existing = await prisma.teacher.findFirst({
      where: { tscNumber: data.tscNumber, schoolId: user.schoolId },
    });
    if (existing) {
      return NextResponse.json(
        { error: `TSC number ${data.tscNumber} already exists` },
        { status: 409 }
      );
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // If assigning as class teacher, unassign any existing class teacher of this stream (scoped to school)
      if (data.isClassTeacher && data.classTeacherStreamId) {
        await tx.teacher.updateMany({
          where: { classTeacherStreamId: data.classTeacherStreamId, schoolId: user.schoolId },
          data: { isClassTeacher: false, classTeacherStreamId: null },
        });
      }

      // Create user record (clerkId is a placeholder until the Clerk invitation is sent)
      const newUser = await tx.user.create({
        data: {
          clerkId: `teacher_${Date.now()}`,
          schoolId: user.schoolId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
          nationalId: data.nationalId || null,
          role: 'teacher',
        },
      });

      // Create teacher record
      const teacher = await tx.teacher.create({
        data: {
          userId: newUser.id,
          schoolId: user.schoolId,
          tscNumber: data.tscNumber || null,
          employmentType: data.employmentType,
          specialisation: data.specialisation.join(', '),
          isClassTeacher: data.isClassTeacher,
          classTeacherStreamId: data.isClassTeacher ? data.classTeacherStreamId || null : null,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              nationalId: true,
            },
          },
          classTeacherStream: { include: { grade: true } },
        },
      });

      return { user: newUser, teacher };
    });

    return NextResponse.json(
      {
        success: true,
        teacher: result.teacher,
        message: 'Teacher created. They will need to be invited via Clerk to log in.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Create teacher error:', error);
    // SEC-19: Safe error wrapper, no raw stack traces or DB errors leaked to client
    const message = error.code === 'P2002' ? 'Duplicate record in database' : 'Failed to create teacher';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}