import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { exportQueue } from "@/lib/export/queue";

// Never cache this route — it must reflect live system state
export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function measure(fn: () => Promise<unknown>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export async function GET() {
  // 1. Database — critical. If this is down, the app is down.
  const database = await measure(() => prisma.$queryRaw`SELECT 1`);

  // 2. Redis — degraded mode. App still serves pages, but
  //    queues (SMS, exports, notifications) will fail.
  const redisCheck = await measure(() => redis.ping());

  // 3. BullMQ queues — visibility into backlog/failures.
  let queueStats = { waiting: 0, active: 0, failed: 0 };
  const queues = await measure(async () => {
    queueStats = {
      waiting: await exportQueue.getWaitingCount(),
      active: await exportQueue.getActiveCount(),
      failed: await exportQueue.getFailedCount(),
    };
  });

  const healthy = database.ok;
  const degraded = !redisCheck.ok || !queues.ok;

  return NextResponse.json(
    {
      status: healthy ? (degraded ? "degraded" : "ok") : "down",
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis: redisCheck,
        queues: { ...queues, ...queueStats },
      },
    },
    { status: healthy ? 200 : 503 }
  );
}