/*src\app\api\export\status\[jobId]\route.ts*/

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/current-user';
import { EXPORT_ROLES, GENERIC_EXPORT_FAILURE, getOwnedExportJob } from '@/lib/export/access';

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const guard = await requireUser(EXPORT_ROLES);
  if (!guard.ok) return guard.response;

  try {
    const job = await getOwnedExportJob(params.jobId, guard.user);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const state = await job.getState();

    if (state === 'completed') {
      return NextResponse.json({
        status: 'completed',
        downloadUrl: job.returnvalue?.downloadUrl,
        filename: job.returnvalue?.filename,
      });
    }
    if (state === 'failed') {
      return NextResponse.json({ status: 'failed', error: GENERIC_EXPORT_FAILURE });
    }
    return NextResponse.json({ status: state }); // "waiting", "active", "delayed"
  } catch (error) {
    console.error('Export status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
