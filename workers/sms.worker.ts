import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms/africastalking";

export const smsWorker = new Worker(
  "sms",
  async (job) => {
    const { to, message, schoolId, type, metadata } = job.data as {
      to: string;
      message: string;
      schoolId?: string;
      type?: string;
      metadata?: Record<string, unknown>;
    };

    const result = await sendSms(to, message);

    if (schoolId && metadata?.senderId) {
      await prisma.message.create({
        data: {
          schoolId,
          senderId: metadata?.senderId as string,
          recipientId: metadata?.recipientId as string | undefined,
          body: message,
          messageType: type || "automated",
          sentVia: ["sms"],
          smsSent: result.sent,
          smsMessageId: result.messageId,
        },
      });
    }

    return result;
  },
  { connection, concurrency: 3 }
);

smsWorker.on("failed", (job, err) => {
  console.error(`[SMSWorker] Job ${job?.id} failed:`, err.message);
});
