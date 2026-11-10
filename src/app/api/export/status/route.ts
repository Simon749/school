import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { EXPORT_ROLES, GENERIC_EXPORT_FAILURE, getOwnedExportJob } from '@/lib/export/access';

/** Query-string variant used by the IT-admin export page: /api/export/status?jobId=... */
export async function GET(req: NextRequest) {
  const guard = await requireUser(EXPORT_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const jobId = new URL(req.url).searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const job = await getOwnedExportJob(jobId, guard.user);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const state = await job.getState(); // 'waiting', 'active', 'completed', 'failed'
    return NextResponse.json({
      state,
      data: state === 'completed' ? job.returnvalue : undefined, // { downloadUrl, filename }
      failedReason: state === 'failed' ? GENERIC_EXPORT_FAILURE : undefined,
    });
  } catch (error) {
    console.error('[EXPORT_STATUS_ERROR]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
