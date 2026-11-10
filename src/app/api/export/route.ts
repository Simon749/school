import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/current-user';
import { logAudit } from '@/lib/audit';
import { exportQueue } from '@/lib/export/queue';
import { EXPORT_ROLES, EXPORT_TYPES, mayRequestExport } from '@/lib/export/access';

const requestSchema = z.object({
  type: z.enum(EXPORT_TYPES),
  format: z.enum(['csv', 'pdf']).default('csv'),
  // Free-form per export type for now (typed per export in R6-06), but bounded.
  filters: z
    .record(z.unknown())
    .default({})
    .refine((f) => JSON.stringify(f).length <= 4000, 'Filters are too large'),
});

export async function POST(req: NextRequest) {
  const guard = await requireUser(EXPORT_ROLES);
  if (!guard.ok) return guard.response;
  const { user } = guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid export request' }, { status: 400 });
  }
  const { type, format, filters } = parsed.data;

  if (!mayRequestExport(user.role, type)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const job = await exportQueue.add(`export-${type}`, {
      type,
      schoolId: user.schoolId, // from the session only, never from the request
      userId: user.id,
      filters,
      format,
    });

    await logAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      action: 'export.requested',
      tableName: 'export_jobs',
      newData: { type, format, jobId: job.id ?? null, filters },
    });

    return NextResponse.json({ jobId: job.id, message: 'Export job queued successfully.' });
  } catch (error) {
    console.error('[EXPORT_QUEUE_ERROR]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
