// src/workers/notification.worker.ts
import { Worker, Job } from "bullmq";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { sendPushNotification } from "@/lib/firebase/admin";

interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: "high" | "normal" | "low";
}

export const notificationWorker = new Worker<NotificationJobData>(
  "notification-queue",
  async (job: Job<NotificationJobData>) => {
    const { userId, type, title, body, data, priority } = job.data;

    console.log(`[Notification Worker] Processing notification for user ${userId}`);

    // Fetch user with device tokens
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        deviceTokens: true,
        notificationPref: true,
        hasAppInstalled: true,
      },
    });

    if (!user) {
      console.log(`[Notification Worker] User ${userId} not found`);
      return;
    }

    // Check notification preference
    if (user.notificationPref === "none") {
      console.log(`[Notification Worker] User ${userId} has opted out of notifications`);
      return;
    }

    // Store notification in database
    await prisma.notification.create({
      data: {
        userId: user.id,
        type,
        title,
        body,
        data: data || {},
      },
    });

    // Send push notification if user has device tokens
    if (user.deviceTokens && user.deviceTokens.length > 0) {
      try {
        await sendPushNotification({
          tokens: user.deviceTokens,
          title,
          body,
          data: {
            ...data,
            type,
            userId: user.id,
          },
        });

        console.log(`[Notification Worker] Push sent to user ${userId}`);
      } catch (error: any) {
        console.error(`[Notification Worker] Failed to send push to user ${userId}:`, error);
        // Don't throw - notification is still saved in DB
      }
    } else {
      console.log(`[Notification Worker] User ${userId} has no device tokens, skipping push`);
    }

    return { success: true };
  },
  {
    connection: redis,
    concurrency: 10,
  }
);

notificationWorker.on("completed", (job) => {
  console.log(`[Notification Worker] Job ${job.id} completed`);
});

notificationWorker.on("failed", (job, err) => {
  console.error(`[Notification Worker] Job ${job?.id} failed:`, err);
});