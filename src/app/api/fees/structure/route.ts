import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';

/**
 * Fee structures (admin/bursar only). Items are WHITELISTED field by field: the request body is
 * no longer passed straight into Prisma (mass assignment, SEC-11).
 * The 10,000,000 per-item ceiling is a typo guard (extra zeros), not a fee policy.
 */
const feeItemSchema = z.object({
  name: z.string().trim().min(1, 'Fee item name is required').max(100),
  amount: z.coerce.number().min(0).max(10_000_000),
  isMandatory: z.boolean().default(true),
  isOptionalActivity: z.boolean().default(false),
  priorityOrder: z.number().int().min(0).max(1000).default(0),
});

const structureSchema = z.object({
  termId: z.string().min(1).max(64),
  name: z.string().trim().min(1, 'Structure name is required').max(100),
  appliesTo: z.enum(['all', 'boarding', 'day']).default('all'),
  items: z.array(feeItemSchema).min(1, 'Add at least one fee item').max(50),
});

export async function POST(req: NextRequest) {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  const parsed = structureSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { termId, name, appliesTo, items } = parsed.data;

  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId: user.schoolId },
    select: { id: true },
  });
  if (!term) return NextResponse.json({ error: 'Term not found' }, { status: 400 });

  const structure = await prisma.feeStructure.create({
    data: {
      schoolId: user.schoolId,
      termId,
      name,
      appliesTo,
      feeItems: {
        create: items.map((item, index) => ({
          name: item.name,
          amount: item.amount,
          isMandatory: item.isMandatory,
          isOptionalActivity: item.isOptionalActivity,
          priorityOrder: item.priorityOrder,
          orderIndex: index,
        })),
      },
    },
    include: { feeItems: true },
  });

  await logAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    action: 'fees.structure_created',
    tableName: 'fee_structures',
    recordId: structure.id,
    newData: { termId, name, appliesTo, itemCount: items.length },
  });

  return NextResponse.json({ success: true, structure }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const guard = await requireUser(['admin', 'bursar']);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get('termId');

  const structures = await prisma.feeStructure.findMany({
    where: { schoolId: user.schoolId, ...(termId ? { termId } : {}) },
    include: { feeItems: { orderBy: { orderIndex: 'asc' } } },
  });

  return NextResponse.json({ structures });
}
