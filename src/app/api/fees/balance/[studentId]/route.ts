import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import { calculateBalance } from '@/lib/fees/balance';

export async function GET(
  req: Request,
  { params }: { params: { studentId: string } }
) {
  const guard = await requireUser(['admin', 'bursar', 'parent']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  let termId = searchParams.get('termId');

  // 1. SEC-05 / SEC-11: Role-based access control + student/guardian existence check FIRST
  if (user.role === 'parent') {
    const link = await prisma.guardian.findFirst({
      where: { userId: user.id, studentId: params.studentId, isActive: true },
      select: { id: true },
    });
    if (!link) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
  } else {
    const student = await prisma.student.findFirst({
      where: { id: params.studentId, schoolId: user.schoolId, deletedAt: null },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
  }

  // 2. If termId is not provided, default to the current active term for the school
  if (!termId) {
    const currentTerm = await prisma.term.findFirst({
      where: { schoolId: user.schoolId, isCurrent: true },
      select: { id: true },
    });
    
    if (currentTerm) {
      termId = currentTerm.id;
    } else {
      // Fallback if no explicit current term is flagged, grab the latest term
      const latestTerm = await prisma.term.findFirst({
        where: { schoolId: user.schoolId },
        orderBy: { startDate: 'desc' },
        select: { id: true },
      });
      termId = latestTerm ? latestTerm.id : '';
    }
  }

  // R3-07: Use the single source of truth for balance calculation
  const balance = await calculateBalance(params.studentId, termId, user.schoolId);

  return NextResponse.json(balance);
}