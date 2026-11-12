import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.fn();
const userFindUnique = vi.fn();
const queueAdd = vi.fn();
const queueGetJob = vi.fn();
const logAudit = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: () => authMock() }));
vi.mock('@/lib/audit', () => ({ logAudit: (e: unknown) => logAudit(e) }));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => userFindUnique(...a) } },
}));
vi.mock('@/lib/export/queue', () => ({
  exportQueue: {
    add: (...a: unknown[]) => queueAdd(...a),
    getJob: (...a: unknown[]) => queueGetJob(...a),
  },
}));
vi.mock('@/lib/redis', () => ({ redis: {} }));
vi.mock('bullmq', () => ({
  Queue: class {
    getJob = (...a: unknown[]) => queueGetJob(...a);
  },
}));

import { POST } from '@/app/api/export/route';
import { GET as statusByQuery } from '@/app/api/export/status/route';
import { GET as statusByPath } from '@/app/api/export/status/[jobId]/route';

const post = (body: unknown) =>
  POST(
    new Request('http://x/api/export', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never
  );

const signedInAs = (role: string, over: Record<string, unknown> = {}) => {
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  userFindUnique.mockResolvedValue({
    id: 'u-1',
    clerkId: 'clerk_1',
    role,
    schoolId: 'school-A',
    isActive: true,
    deletedAt: null,
    ...over,
  });
};

const job = (over: Record<string, unknown> = {}) => ({
  data: { schoolId: 'school-A', userId: 'u-1', type: 'fees-term' },
  getState: async () => 'completed',
  returnvalue: { downloadUrl: 'https://s3.example/signed', filename: 'fees.csv' },
  failedReason: 'ECONNREFUSED 10.0.3.7:5432 (secret internal detail)',
  ...over,
});

beforeEach(() => {
  for (const m of [authMock, userFindUnique, queueAdd, queueGetJob, logAudit]) m.mockReset();
  queueAdd.mockResolvedValue({ id: '7' });
  queueGetJob.mockResolvedValue(job());
});

describe('POST /api/export (SEC-06)', () => {
  it('401 anonymous, 403 deactivated', async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await post({ type: 'fees-term' })).status).toBe(401);
    signedInAs('admin', { isActive: false });
    expect((await post({ type: 'fees-term' })).status).toBe(403);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  // D19: teachers have an export page but the API has always refused them; kept refused until decided.
  it.each(['parent', 'teacher', 'deputy'])('403 for role %s', async (role) => {
    signedInAs(role);
    expect((await post({ type: 'fees-term' })).status).toBe(403);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it.each(['fees-daily', 'fees-term', 'fees-defaulters'])('bursar may request %s', async (type) => {
    signedInAs('bursar');
    expect((await post({ type })).status).toBe(200);
  });

  it.each([
    'attendance-class',
    'attendance-student',
    'attendance-teacher',
    'results-markbook',
    'results-portfolio',
    'students',
  ])('bursar may NOT request %s (design RBAC: bursar = fees only)', async (type) => {
    signedInAs('bursar');
    expect((await post({ type })).status).toBe(403);
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it.each(['admin', 'it_admin'])('%s may request any valid type', async (role) => {
    signedInAs(role);
    for (const type of ['attendance-class', 'fees-term', 'results-markbook', 'students']) {
      expect((await post({ type })).status).toBe(200);
    }
  });

  it('validates input: bad JSON, unknown type, bad format, non-object filters', async () => {
    signedInAs('admin');
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ type: 'drop-database' })).status).toBe(400);
    expect((await post({ type: 'fees-term', format: 'exe' })).status).toBe(400);
    expect((await post({ type: 'fees-term', filters: ['x'] })).status).toBe(400);
    expect((await post({ type: 'fees-term', filters: { big: 'x'.repeat(5000) } })).status).toBe(
      400
    );
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('takes school and user ONLY from the session, never from the request body', async () => {
    signedInAs('admin');
    await post({
      type: 'fees-term',
      schoolId: 'school-EVIL',
      userId: 'u-EVIL',
      filters: { termId: 't1' },
    });
    const data = queueAdd.mock.calls[0]![1]!;
    expect(data).toMatchObject({
      type: 'fees-term',
      schoolId: 'school-A',
      userId: 'u-1',
      format: 'csv',
      filters: { termId: 't1' },
    });
  });

  it('audits the request (an export is a data-exfiltration point)', async () => {
    signedInAs('admin');
    await post({ type: 'fees-defaulters' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-A',
        actorId: 'u-1',
        action: 'export.requested',
        newData: expect.objectContaining({ type: 'fees-defaulters' }),
      })
    );
  });
});

describe.each([
  [
    'status/[jobId]',
    (id: string) =>
      statusByPath(new Request(`http://x/api/export/status/${id}`) as never, {
        params: { jobId: id },
      }),
  ],
  [
    'status?jobId=',
    (id: string) => statusByQuery(new Request(`http://x/api/export/status?jobId=${id}`) as never),
  ],
] as const)(
  'export %s (SEC-06): job ids are guessable counters, so ownership is checked',
  (_n, run) => {
    it('401 anonymous, 403 deactivated, 403 for roles that cannot export', async () => {
      authMock.mockResolvedValue({ userId: null });
      expect((await run('7')).status).toBe(401);
      signedInAs('admin', { isActive: false });
      expect((await run('7')).status).toBe(403);
      signedInAs('parent');
      expect((await run('7')).status).toBe(403);
      expect(queueGetJob).not.toHaveBeenCalled();
    });

    it('the requester gets their download link', async () => {
      signedInAs('admin');
      const res = await run('7');
      expect(res.status).toBe(200);
      expect(JSON.stringify(await res.json())).toContain('https://s3.example/signed');
    });

    it("someone else's job in the SAME school is a 404 (no link leaked)", async () => {
      signedInAs('bursar');
      queueGetJob.mockResolvedValue(job({ data: { schoolId: 'school-A', userId: 'u-other' } }));
      const res = await run('7');
      expect(res.status).toBe(404);
      expect(JSON.stringify(await res.json())).not.toContain('s3.example');
    });

    it('a job from ANOTHER school is a 404', async () => {
      signedInAs('admin');
      queueGetJob.mockResolvedValue(job({ data: { schoolId: 'school-B', userId: 'u-1' } }));
      expect((await run('7')).status).toBe(404);
    });

    it('unknown job is a 404', async () => {
      signedInAs('admin');
      queueGetJob.mockResolvedValue(undefined);
      expect((await run('999')).status).toBe(404);
    });

    it('a failed job reports a generic message, never the raw worker error', async () => {
      signedInAs('admin');
      queueGetJob.mockResolvedValue(job({ getState: async () => 'failed' }));
      const text = JSON.stringify(await (await run('7')).json());
      expect(text).not.toContain('ECONNREFUSED');
      expect(text).not.toContain('10.0.3.7');
      expect(text).toContain('failed');
    });

    it('an unfinished job reports its state without a link', async () => {
      signedInAs('admin');
      queueGetJob.mockResolvedValue(
        job({ getState: async () => 'active', returnvalue: undefined })
      );
      const text = JSON.stringify(await (await run('7')).json());
      expect(text).toContain('active');
      expect(text).not.toContain('downloadUrl":"http');
    });
  }
);

describe('legacy download route', () => {
  it('is deleted: it could only ever read arbitrary .csv files via path traversal (nothing writes public/exports)', () => {
    expect(existsSync(join(process.cwd(), 'src/app/api/export/download/route.ts'))).toBe(false);
  });
});
