// src/lib/queue/index.ts
import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

// Attendance queue
export const attendanceQueue = new Queue("attendance-queue", {
  connection: redis,
});

// Notification queue (with delay support for buffer)
export const notificationQueue = new Queue("notification-queue", {
  connection: redis,
});

// SMS queue
export const smsQueue = new Queue("sms-queue", {
  connection: redis,
});

// MPesa queue
export const mpesaQueue = new Queue("mpesa-queue", {
  connection: redis,
});

// Export queue
export const exportQueue = new Queue("export-queue", {
  connection: redis,
});