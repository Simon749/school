// src/workers/index.ts
import { smsWorker } from "./sms.worker";
import { notificationWorker } from "./notification.worker";

console.log("[Workers] All workers started");
console.log("[Workers] - SMS Worker: listening for jobs");
console.log("[Workers] - Notification Worker: listening for jobs");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Workers] SIGTERM received, shutting down gracefully");
  await smsWorker.close();
  await notificationWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Workers] SIGINT received, shutting down gracefully");
  await smsWorker.close();
  await notificationWorker.close();
  process.exit(0);
});