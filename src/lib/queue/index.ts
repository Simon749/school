import { Queue } from "bullmq";
import { connection } from "./connection";

export const attendanceQueue = new Queue("attendance", { connection });
export const notificationQueue = new Queue("notification", { connection });
export const smsQueue = new Queue("sms", { connection });
export const mpesaQueue = new Queue("mpesa", { connection });

export async function closeQueues() {
  await Promise.all([
    attendanceQueue.close(),
    notificationQueue.close(),
    smsQueue.close(),
    mpesaQueue.close(),
  ]);
}