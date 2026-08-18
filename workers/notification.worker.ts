import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db";
import { smsQueue } from "@/lib/queue";

export const notificationWorker = new Worker(
  "notification",
  async (job) => {
    if (job.name === "absence-alert") {
      const { studentId, slotId, date, lessonName, reason } = job.data as {
        studentId: string;
        slotId: string;
        date: string;
        lessonName: string;
        reason: string;
      };

      const record = await prisma.studentLessonAttendance.findUnique({
        where: { studentId_slotId_date: { studentId, slotId, date: new Date(date) } },
      });
      if (!record || record.status !== "absent") return { cancelled: true };

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true, schoolId: true },
      });
      if (!student) return { missing: true };

      const guardian = await prisma.guardian.findFirst({
        where: { studentId, isPrimary: true, isActive: true },
        include: { user: true },
      });
      if (!guardian?.user.phone) return { noPhone: true };

      const message = `${student.firstName} was absent from ${lessonName} today. Reason: ${reason}. Contact the school if you have questions.`;

      await smsQueue.add("send-sms", {
        to: guardian.user.phone,
        message,
        schoolId: student.schoolId,
        type: "automated",
        metadata: { recipientId: guardian.userId },
      });

      await prisma.studentLessonAttendance.update({
        where: { id: record.id },
        data: {
          parentNotified: true,
          notificationHeld: false,
          notificationSentAt: new Date(),
        },
      });

      return { notified: true };
    }

    if (job.name === "payment-confirmation") {
      const { userId, studentName, amount, receiptNumber } = job.data as {
        userId: string;
        studentName: string;
        amount: number;
        receiptNumber: string;
      };

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.phone) return { noPhone: true };

      await smsQueue.add("send-sms", {
        to: user.phone,
        message: `Payment of KES ${amount.toLocaleString()} for ${studentName} received. Receipt: ${receiptNumber}.`,
        schoolId: user.schoolId,
        type: "automated",
        metadata: { recipientId: user.id },
      });

      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "payment_confirmation",
          title: "Payment received",
          body: `KES ${amount.toLocaleString()} paid for ${studentName}`,
          data: { receiptNumber, amount },
        },
      });

      return { notified: true };
    }

    throw new Error(`Unknown notification job: ${job.name}`);
  },
  { connection, concurrency: 5 }
);

notificationWorker.on("failed", (job, err) => {
  console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message);
});
