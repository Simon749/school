import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: { termId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const termId = body.termId;
  if (typeof termId !== 'string' || !termId) {
    return NextResponse.json({ error: 'termId required' }, { status: 400 });
  }

  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId: user.schoolId },
  });
  if (!term) return NextResponse.json({ error: 'Invalid term' }, { status: 400 });

  const { count } = await prisma.timetableSlot.updateMany({
    where: { termId, schoolId: user.schoolId, isPublished: false },
    data: { isPublished: true },
  });

  await logAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    action: 'timetable.published',
    tableName: 'timetable_slots',
    newData: { termId, publishedCount: count },
  });

  return NextResponse.json({ success: true, publishedCount: count });
}
