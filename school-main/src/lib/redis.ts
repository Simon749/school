import { Redis } from "ioredis";

export const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: process.env.NEXT_PHASE === "phase-build" ? 0 : 3,
  retryStrategy(times) {
    // Don't retry during `next build` — keeps build logs clean
    if (process.env.NEXT_PHASE === "phase-build") return null;
    return Math.min(times * 50, 2000);
  },
});
