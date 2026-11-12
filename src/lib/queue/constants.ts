/**
 * Single source of truth for queue names.
 * Producers and workers MUST use these constants — no hardcoded strings.
 */
export const QUEUE_NAMES = {
  ATTENDANCE: 'attendance-queue',
  MPESA: 'mpesa-queue',
  SMS: 'sms-queue',
  NOTIFICATION: 'notification-queue',
  EXPORT: 'export-queue',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

/**
 * Default job options for all queues.
 * Constitution §56-57: jobs must retry, backoff, and eventually land in DLQ.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000, // 2s, 4s, 8s
  },
  removeOnComplete: {
    age: 24 * 3600, // keep completed jobs for 24h
    count: 1000, // keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // keep failed jobs for 7 days
  },
} as const;