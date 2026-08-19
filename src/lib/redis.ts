import { Redis } from "ioredis";

<<<<<<< HEAD
// Upstash Redis singleton. Falls back to local Redis for dev.
// See SYSTEM_DESIGN.md §3 — Redis is used for:
//   sessions, fee-balance cache, notification state, rate limiting,
//   BullMQ job queues, and geofence token TTL.

const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// Health-check helper used by /api/health
export async function redisHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
=======
export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: process.env.NEXT_PHASE === "phase-build" ? 0 : 3,
  retryStrategy(times) {
    // Don't retry during `next build` — keeps build logs clean
    if (process.env.NEXT_PHASE === "phase-build") return null;
    return Math.min(times * 50, 2000);
  },
});
>>>>>>> 7c557d8 (phase 5)
