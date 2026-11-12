import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit, getRequestMetadata } from '@/lib/audit';
import { z } from 'zod';

const deactivateSchema = z.object({
  reason: z.string().min(5, 'Deactivation reason must be at least 5 characters'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Central guard: Admin only
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  // 2. Validate payload
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = deactivateSchema.safeParse(body);
  if (!validation.success) {
    const firstError = validation.error.issues[0]?.message ?? 'Invalid deactivation payload';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  const { reason } = validation.data;
  const guardianId = params.id;

  // 3. Fetch guardian to ensure they belong to this school
  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, student: { schoolId: user.schoolId } },
    include: { user: true },
  });

  if (!guardian) {
    return NextResponse.json({ error: 'Guardian not found or not in your school' }, { status: 404 });
  }

  if (!guardian.isActive) {
    return NextResponse.json({ error: 'Guardian is already deactivated' }, { status: 400 });
  }

  // 4. Deactivate in a transaction with audit logging
  await prisma.$transaction(async (tx) => {
    await tx.guardian.update({
      where: { id: guardianId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivatedBy: user.id,
        deactivationReason: reason,
      },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'guardian.deactivated',
        tableName: 'guardians',
        recordId: guardianId,
        oldData: { isActive: true },
        newData: { isActive: false, reason },
      },
      tx
    );
  });

  // 5. Return specific code so frontend can force a logout if the deactivated user is the current session
  return NextResponse.json({ 
    success: true, 
    message: 'Guardian deactivated successfully',
    clerkId: guardian.user.clerkId // Frontend can use this to target session revocation if needed
  }, { status: 200 });
}