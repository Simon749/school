import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const user = guard.user;

  const guardian = await prisma.guardian.findFirst({
    where: { id: params.id, student: { schoolId: user.schoolId } },
  });

  if (!guardian) {
    return NextResponse.json({ error: 'Guardian not found' }, { status: 404 });
  }

  if (guardian.isActive) {
    return NextResponse.json({ error: 'Guardian is already active' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.guardian.update({
      where: { id: params.id },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      },
    });

    await logAudit(
      {
        schoolId: user.schoolId,
        actorId: user.id,
        action: 'guardian.reactivated',
        tableName: 'guardians',
        recordId: params.id,
        oldData: { isActive: false },
        newData: { isActive: true },
      },
      tx
    );
  });

  return NextResponse.json({ success: true, message: 'Guardian reactivated' });
}