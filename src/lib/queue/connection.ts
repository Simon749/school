// BullMQ requires maxRetriesPerRequest: null (it handles retries internally)
export const connection = {
  url: process.env.REDIS_URL || "redis://localhost:6379",
  maxRetriesPerRequest: null as null,
};