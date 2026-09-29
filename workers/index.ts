import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { exportWorker } from "./export.worker";

console.log("[Workers] Starting all workers...");

// 1. Notification Worker
export const notificationWorker = new Worker(
  "notification-queue",
  async (job) => {
    console.log(`[Notification Worker] Processing job ${job.id}:`, job.data);
    // TODO: Add FCM / Africa's Talking logic here
  },
  { connection: redis }
);

// 2. SMS Worker
export const smsWorker = new Worker(
  "sms-queue",
  async (job) => {
    console.log(`[SMS Worker] Processing job ${job.id}:`, job.data);
    // TODO: Add Africa's Talking SMS logic here
  },
  { connection: redis }
);

// 3. Attendance Worker (Prevents jobs from hanging)
export const attendanceWorker = new Worker(
  "attendance-queue",
  async (job) => {
    console.log(`[Attendance Worker] Processing job ${job.id}:`, job.data);
    // Example: await prisma.teacherAttendance.create({ data: job.data });
  },
  { connection: redis }
);

// 4. MPesa Worker (Prevents jobs from hanging)
export const mpesaWorker = new Worker(
  "mpesa-queue",
  async (job) => {
    console.log(`[MPesa Worker] Processing job ${job.id}:`, job.data);
    // Example: Process callback and update fee_payments
  },
  { connection: redis }
);

console.log("✅ All workers are now listening.");

// Graceful shutdown
const closeWorkers = async () => {
  console.log("[Workers] Shutting down gracefully...");
  await Promise.all([
    notificationWorker.close(),
    smsWorker.close(),
    attendanceWorker.close(),
    mpesaWorker.close(),
    exportWorker.close(),
  ]);
  process.exit(0);
};

process.on("SIGTERM", closeWorkers);
process.on("SIGINT", closeWorkers);