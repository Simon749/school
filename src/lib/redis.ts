import { Redis } from 'ioredis';
import { envOr } from '@/lib/env';

export const redis = new Redis(envOr('REDIS_URL', 'redis://localhost:6379'), {
  // FIX: BullMQ REQUIRES this to be null for blocking commands to work
  maxRetriesPerRequest: null,

  retryStrategy(times) {
    // Don't retry during `next build` — keeps build logs clean
    if (process.env.NEXT_PHASE === 'phase-production-build') return null;
    return Math.min(times * 50, 2000);
  },
});
