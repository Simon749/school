import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';
import { calculateBalance } from '@/lib/fees/balance';

export async function GET(req: Request) {
  // SEC-11: Use the central guard (not hand-rolled auth)
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get('termId');

  if (!termId) {
    return NextResponse.json({ error: 'termId is required' }, { status: 400 });
  }

  // SEC-11: Verify the term belongs to this school
  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId: user.schoolId },
    select: { id: true, name: true },
  });
  if (!term) {
    return NextResponse.json({ error: 'Term not found' }, { status: 404 });
  }

  // Fetch all active students in the school
  const students = await prisma.student.findMany({
    where: { schoolId: user.schoolId, status: 'active', deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      stream: { select: { name: true, grade: { select: { name: true } } } },
    },
  });

  const defaulters = [];

  // R3-07: Reuse the exact same single source of truth
  for (const student of students) {
    const ledger = await calculateBalance(student.id, termId, user.schoolId);

    if (ledger.balance > 0) {
      defaulters.push({
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        stream: `${student.stream.grade.name} ${student.stream.name}`,
        totalDue: ledger.totalDue,
        totalPaid: ledger.totalPaid,
        balance: ledger.balance,
      });
    }
  }

  // Sort by highest balance first
  defaulters.sort((a, b) => b.balance - a.balance);

  return NextResponse.json({ term: term.name, defaulters });
}
