import { envOr } from '@/lib/env';

// BullMQ requires maxRetriesPerRequest: null (it handles retries internally)
export const connection = {
  url: envOr('REDIS_URL', 'redis://localhost:6379'),
  maxRetriesPerRequest: null as null,
};
