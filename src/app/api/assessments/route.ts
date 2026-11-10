// src/app/api/assessments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTeacher } from '@/lib/auth/current-user';
import { createAssessmentSchema } from '@/lib/validations/assessment.schema';

// GET: List assessments for the logged-in teacher
export async function GET(request: NextRequest) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get('termId');
  const streamId = searchParams.get('streamId');

  const assessments = await prisma.assessment.findMany({
    where: {
      schoolId: user.schoolId,
      teacherId: teacher.id,
      ...(termId && { termId }),
      ...(streamId && { streamId }),
    },
    include: {
      stream: { select: { name: true, grade: { select: { name: true } } } },
      learningArea: { select: { name: true, code: true } },
      term: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(assessments);
}

// POST: Create a new assessment (always starts in 'draft' status)
export async function POST(request: NextRequest) {
  const guard = await requireTeacher();
  if (!guard.ok) return guard.response;
  const { user, teacher } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = createAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.errors },
      { status: 400 }
    );
  }
  const input = parsed.data;

  try {
    // The class, term and learning area must all belong to the caller's own school.
    const [stream, term, learningArea] = await Promise.all([
      prisma.stream.findFirst({
        where: { id: input.streamId, schoolId: user.schoolId },
        select: { id: true },
      }),
      prisma.term.findFirst({
        where: { id: input.termId, schoolId: user.schoolId },
        select: { id: true },
      }),
      prisma.learningArea.findFirst({
        where: { id: input.learningAreaId, schoolId: user.schoolId },
        select: { id: true },
      }),
    ]);
    if (!stream) return NextResponse.json({ error: 'Class not found' }, { status: 400 });
    if (!term) return NextResponse.json({ error: 'Term not found' }, { status: 400 });
    if (!learningArea)
      return NextResponse.json({ error: 'Learning area not found' }, { status: 400 });

    // D20: a teacher may only set assessments for a class and learning area they are
    // timetabled to teach in this term.
    const slot = await prisma.timetableSlot.findFirst({
      where: {
        schoolId: user.schoolId,
        teacherId: teacher.id,
        streamId: input.streamId,
        learningAreaId: input.learningAreaId,
        termId: input.termId,
      },
      select: { id: true },
    });
    if (!slot) {
      return NextResponse.json(
        {
          error:
            'You are not timetabled to teach this learning area in this class this term. Ask the school admin to add it to the timetable.',
        },
        { status: 403 }
      );
    }

    const assessment = await prisma.assessment.create({
      data: {
        title: input.title,
        type: input.type,
        // Real Date objects: a bare "2026-10-26" string is not a valid Prisma DateTime.
        assessmentDate: new Date(input.assessmentDate),
        maxMarks: input.maxMarks,
        weightPercent: input.weightPercent,
        instructions: input.instructions,
        streamId: input.streamId,
        learningAreaId: input.learningAreaId,
        termId: input.termId,
        schoolId: user.schoolId, // from the session, never the request
        teacherId: teacher.id,
        status: 'draft', // always starts as draft
      },
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (error) {
    console.error('Assessment creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
