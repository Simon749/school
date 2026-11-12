import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';

const restrictSchema = z.object({
  hasRestrictedAccess: z.boolean(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = restrictSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.errors[0];
    return NextResponse.json(
      { error: firstError?.message ?? 'Invalid request data' },
      { status: 400 }
    );
  }

  const { hasRestrictedAccess } = validation.data;

  const guardian = await prisma.guardian.findFirst({
    where: { id: params.id, student: { schoolId: user.schoolId } },
  });

  if (!guardian) {
    return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
  }

  if (!guardian.isActive) {
    return NextResponse.json({ error: 'Cannot modify a deactivated guardian' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.guardian.update({
      where: { id: params.id },
      data: { hasRestrictedAccess },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'guardian.access_restricted',
        tableName: 'guardians',
        recordId: params.id,
        oldData: { hasRestrictedAccess: guardian.hasRestrictedAccess },
        newData: { hasRestrictedAccess },
      },
      tx
    );
  });

  return NextResponse.json({
    success: true,
    message: hasRestrictedAccess
      ? 'Guardian access restricted (arrival times hidden)'
      : 'Full access restored',
  });
}