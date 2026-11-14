// src/workers/sms.worker.ts
import { Worker, Job } from 'bullmq';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/redis';
import { sendSMS } from '@/lib/sms/africastalking';

interface SMSJobData {
  messageIds: string[];
  priority?: 'high' | 'normal' | 'low';
}

export const smsWorker = new Worker<SMSJobData>(
  'sms-queue',
  async (job: Job<SMSJobData>) => {
    const { messageIds, priority } = job.data;

    console.log(`[SMS Worker] Processing ${messageIds.length} messages`);

    // Fetch all messages
    const messages = await prisma.message.findMany({
      where: { id: { in: messageIds } },
      include: {
        school: { select: { smsBalance: true, name: true } },
        recipient: {
          select: {
            id: true,
            phone: true,
            hasAppInstalled: true,
            notificationPref: true,
          },
        },
      },
    });

    // Group by school for balance checking
    const messagesBySchool = messages.reduce<Record<string, typeof messages>>((acc, msg) => {
      if (!msg.schoolId) return acc;

      const schoolMessages = acc[msg.schoolId] ?? [];
      schoolMessages.push(msg);
      acc[msg.schoolId] = schoolMessages;

      return acc;
    }, {});

    for (const [schoolId, schoolMessages] of Object.entries(messagesBySchool)) {
      const firstMsg = schoolMessages[0];
      if (!firstMsg) continue;
      const school = firstMsg.school;
      let availableBalance = school.smsBalance;

      for (const message of schoolMessages) {
        // Check if recipient has app installed (skip SMS unless high priority)
        if (message.recipient?.hasAppInstalled && priority !== 'high') {
          console.log(
            `[SMS Worker] Skipping SMS for ${message.recipient?.phone ?? 'unknown'} - has app`
          );
          await prisma.message.update({
            where: { id: message.id },
            data: {
              sentVia: { set: message.sentVia.filter((v) => v !== 'sms') },
            },
          });
          continue;
        }

        // Check if recipient has phone number
        if (!message.recipient?.phone) {
          console.log(`[SMS Worker] No phone number for recipient ${message.recipientId}`);
          continue;
        }

        const recipientPhone = message.recipient.phone;

        // Check SMS balance
        const smsCount = Math.ceil(message.body.length / 160);
        const cost = smsCount; // 1 SMS unit per 160 chars

        if (availableBalance < cost) {
          console.log(`[SMS Worker] Insufficient SMS balance for school ${schoolId}`);
          // Mark message as failed due to insufficient balance
          await prisma.message.update({
            where: { id: message.id },
            data: {
              smsSent: false,
              sentVia: { set: message.sentVia.filter((v) => v !== 'sms') },
            },
          });
          continue;
        }

        try {
          // Send SMS
          const result = await sendSMS({
            to: [recipientPhone],
            message: message.body,
          });

          const recipient = result.recipients?.[0];

          // PIPE-08: Atomic transaction for balance decrement and status update
          if (recipient && recipient.status === 'Success') {
            await prisma.$transaction(async (tx) => {
              // 1. Update message status
              await tx.message.update({
                where: { id: message.id },
                data: {
                  smsSent: true,
                  smsMessageId: recipient.messageId,
                },
              });

              // 2. Atomically decrement school balance
              await tx.school.update({
                where: { id: schoolId },
                data: {
                  smsBalance: { decrement: cost },
                },
              });
            });

            availableBalance -= cost; // Update local tracker for subsequent messages in this batch

            console.log(
              `[SMS Worker] SMS sent to ${recipientPhone} - Message ID: ${recipient.messageId}`
            );
          } else {
            const failureStatus = recipient?.status ?? 'unknown';

            console.error(`[SMS Worker] SMS failed for ${recipientPhone}: ${failureStatus}`);
            await prisma.message.update({
              where: { id: message.id },
              data: {
                smsSent: false,
                sentVia: { set: message.sentVia.filter((v) => v !== 'sms') },
              },
            });
          }
        } catch (error: any) {
          console.error(`[SMS Worker] Error sending SMS to ${recipientPhone}:`, error);
          // Don't deduct balance on error
          await prisma.message.update({
            where: { id: message.id },
            data: {
              smsSent: false,
              sentVia: { set: message.sentVia.filter((v) => v !== 'sms') },
            },
          });
        }
      }
    }

    return { success: true, processed: messageIds.length };
  },
  {
    connection: redis,
    concurrency: 5, // Process 5 jobs at a time
    limiter: {
      max: 100, // Max 100 SMS per minute (Africa's Talking rate limit)
      duration: 60000,
    },
  }
);

smsWorker.on('completed', (job) => {
  console.log(`[SMS Worker] Job ${job.id} completed`);
});

smsWorker.on('failed', (job, err) => {
  console.error(`[SMS Worker] Job ${job?.id} failed:`, err);
});
