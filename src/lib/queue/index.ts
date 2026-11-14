import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';

/**
 * Default job options for all queues (PIPE-04).
 * Ensures jobs retry, backoff, and don't clog Redis with completed/failed history.
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep completed jobs for 24h
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // Keep failed jobs for 7 days for debugging
  },
};

export const attendanceQueue = new Queue('attendance-queue', {
  connection: redis,
  defaultJobOptions,
});

export const notificationQueue = new Queue('notification-queue', {
  connection: redis,
  defaultJobOptions,
});

export const smsQueue = new Queue('sms-queue', {
  connection: redis,
  defaultJobOptions,
});

export const mpesaQueue = new Queue('mpesa-queue', {
  connection: redis,
  defaultJobOptions,
});

export const exportQueue = new Queue('export-queue', {
  connection: redis,
  defaultJobOptions,
});
