import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { generateQrToken } from '@/lib/qr/token';

export async function GET(_req: NextRequest, { params }: { params: { slotId: string } }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { schoolId: true, role: true, id: true, isActive: true, deletedAt: true },
  });

  // ATT-01: Only admin or deputy can fetch/generate classroom QR tokens.
  // Teachers must NOT be able to fetch the token for their own slot.
  if (!user?.schoolId || (user.role !== 'admin' && user.role !== 'deputy') || !user.isActive || user.deletedAt) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const slot = await prisma.timetableSlot.findFirst({
    where: { id: params.slotId, schoolId: user.schoolId },
    include: { period: true, school: true },
  });
  if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

  // Use Nairobi time for "today" to avoid UTC skew at midnight
  const nairobiTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  // Look for existing valid token
  let tokenRecord = await prisma.classroomQrToken.findFirst({
    where: {
      slotId: params.slotId,
      validFrom: { lte: new Date() },
      validUntil: { gte: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Generate new one if none exists
  if (!tokenRecord) {
    // Safely extract time string whether Prisma returns a Date object or string
    const getTimeStr = (t: any) => {
      if (typeof t === 'string') return t.substring(0, 5); // "HH:MM"
      if (t instanceof Date) return t.toISOString().substring(11, 16);
      return "00:00";
    };
    
    const startTimeStr = getTimeStr(slot.period.startTime);
    
    // Nairobi is UTC+3. We append +03:00 to ensure correct absolute time comparison
    const periodStart = new Date(`${nairobiTodayStr}T${startTimeStr}+03:00`);
    
    const validFrom = new Date(periodStart.getTime() - 5 * 60 * 1000); // 5 min before
    const validUntil = new Date(periodStart.getTime() + 10 * 60 * 1000); // 10 min after

    const token = generateQrToken(params.slotId, nairobiTodayStr);

    tokenRecord = await prisma.classroomQrToken.create({
      data: {
        schoolId: user.schoolId,
        slotId: params.slotId,
        token,
        validFrom,
        validUntil,
      },
    });
  }

  return NextResponse.json({
    token: tokenRecord.token,
    validFrom: tokenRecord.validFrom,
    validUntil: tokenRecord.validUntil,
    slotName: slot.period.name,
  });
}