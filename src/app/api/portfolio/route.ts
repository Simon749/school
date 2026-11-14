import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { z } from 'zod';

const portfolioSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  learningAreaId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  artefactType: z.enum(['photo', 'document', 'video', 'reflection']),
  fileUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  // 1. Teachers (for their students) or admins can upload
  const guard = await requireUser(['admin', 'teacher']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const parsed = portfolioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { studentId, termId, learningAreaId, title, description, artefactType, fileUrl } =
    parsed.data;

  // 2. Verify entities belong to caller's school
  const [student, term, learningArea] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId, schoolId: user.schoolId, status: 'active' },
    }),
    prisma.term.findUnique({ where: { id: termId, schoolId: user.schoolId } }),
    prisma.learningArea.findUnique({ where: { id: learningAreaId, schoolId: user.schoolId } }),
  ]);

  if (!student || !term || !learningArea) {
    return NextResponse.json(
      { error: 'Invalid student, term, or learning area for your school' },
      { status: 400 }
    );
  }

  const { ipAddress, userAgent } = getRequestMetadata(req);

  // 3. Atomic creation + Audit (R5-01)
  const artefact = await prisma.$transaction(async (tx) => {
    const record = await tx.portfolioArtefact.create({
      data: {
        schoolId: user.schoolId, // ➕ R5-04: Strict tenancy
        studentId,
        termId,
        learningAreaId,
        title,
        description: description || null,
        artefactType,
        fileUrl,
        uploadedById: user.id,
      },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'PORTFOLIO_ARTEFACT_UPLOADED',
        tableName: 'portfolio_artefacts',
        recordId: record.id,
        newData: { studentId, artefactType, fileUrl },
        ipAddress,
        userAgent,
      },
      tx
    );

    return record;
  });

  return NextResponse.json({ success: true, artefact }, { status: 201 });
}
