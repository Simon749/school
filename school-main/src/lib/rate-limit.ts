import { redis } from "@/lib/redis";

export interface RateLimitConfig {
  uniqueKey: string; // e.g., "import:validate:userId" or "stk-push:ipAddress"
  limit: number;     // Max requests allowed
  windowInSeconds: number; // Time window
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Timestamp when the window resets
}

export async function checkRateLimit({
  uniqueKey,
  limit,
  windowInSeconds,
}: RateLimitConfig): Promise<RateLimitResult> {
  const key = `ratelimit:${uniqueKey}`;
  
  // Atomically increment the counter
  const current = await redis.incr(key);
  
  // If this is the first request, set the expiry time
  if (current === 1) {
    await redis.expire(key, windowInSeconds);
  }

  const ttl = await redis.ttl(key);
  const reset = Date.now() + (ttl > 0 ? ttl : windowInSeconds) * 1000;

  return {
    success: current <= limit,
    limit,
    remaining: Math.max(0, limit - current),
    reset,
  };
}