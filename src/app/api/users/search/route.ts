import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  // R1-14 / R1-22: Use central guard. Strictly limit directory search to admin and it_admin
  // to prevent broad PII exposure (phone, email) to lower-tier roles.
  const guard = await requireUser(['admin', 'it_admin']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone')?.trim();
  const email = searchParams.get('email')?.trim();

  // Allow searching specific roles, defaulting to 'parent' for guardian linking workflows
  const role = searchParams.get('role')?.trim() || 'parent';

  if (!phone && !email) {
    return NextResponse.json({ error: 'Provide phone or email' }, { status: 400 });
  }

  // SEC-21: Strictly scope to the caller's school AND only return active, non-deleted users
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    schoolId: user.schoolId,
    isActive: true,
    deletedAt: null,
  };

  if (role) {
    where.role = role;
  }

  if (phone) {
    where.phone = { contains: phone, mode: 'insensitive' };
  }
  if (email) {
    where.email = { contains: email, mode: 'insensitive' };
  }

  const users = await prisma.user.findMany({
    where,
    take: 10, // Prevent mass enumeration
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      // R1-22: PII (phone/email) is safely returned here ONLY because the central guard
      // above strictly guarantees the caller is an admin or it_admin.
      phone: true,
      email: true,
    },
  });

  return NextResponse.json({ users });
}
