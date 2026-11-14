import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Base worker processor with structured logging and error handling.
 */
export function createWorker<T>(queueName: string, processor: (job: Job<T>) => Promise<void>) {
  const worker = new Worker<T>(
    queueName,
    async (job) => {
      const startTime = Date.now();
      console.log(`[Worker:${queueName}] Starting job ${job.id}`, {
        data: job.data,
        attempt: job.attemptsMade,
      });

      try {
        await processor(job);
        const duration = Date.now() - startTime;
        console.log(`[Worker:${queueName}] Job ${job.id} completed`, { duration });
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[Worker:${queueName}] Job ${job.id} failed`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          attempt: job.attemptsMade,
          duration,
        });
        throw error; // Let BullMQ handle retry/DLQ
      }
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Worker:${queueName}] Job ${job?.id} permanently failed`, {
      error: err.message,
      data: job?.data,
    });
  });

  return worker;
}
