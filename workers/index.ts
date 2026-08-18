import "@/lib/db";
import { attendanceWorker } from "./attendance.worker";
import { mpesaWorker } from "./mpesa.worker";
import { notificationWorker } from "./notification.worker";
import { smsWorker } from "./sms.worker";

console.log(" EduTrack workers started");
console.log("   Listening on queues: attendance, notification, sms, mpesa");
console.log("   Press Ctrl+C to stop\n");

const workers = [attendanceWorker, mpesaWorker, notificationWorker, smsWorker];

process.on("SIGINT", async () => {
  console.log("\n SIGINT received, closing workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n SIGTERM received, closing workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
});