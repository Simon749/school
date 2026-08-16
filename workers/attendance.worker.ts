import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db";
import { attendanceQueue } from "@/lib/queue";

export const attendanceWorker = new Worker(
  "attendance",
  async (job) => {
    const { type, payload } = job.data;

    if (type === "teacher-check-in") {
      const {
        teacherId,
        schoolId,
        slotId,
        date,
        checkedInAt,
        checkInLat,
        checkInLng,
        geofencePassed,
        qrScanned,
        status,
        minutesLate,
        lessonNotes,
      } = payload;

      const record = await prisma.teacherAttendance.upsert({
        where: {
          teacherId_slotId_date: {
            teacherId,
            slotId,
            date: new Date(date),
          },
        },
        update: {
          checkedInAt: new Date(checkedInAt),
          checkInLat,
          checkInLng,
          geofencePassed,
          qrScanned,
          status,
          minutesLate,
          lessonNotes,
          updatedAt: new Date(),
        },
        create: {
          schoolId,
          teacherId,
          slotId,
          date: new Date(date),
          checkedInAt: new Date(checkedInAt),
          checkInLat,
          checkInLng,
          geofencePassed,
          qrScanned,
          status,
          minutesLate,
          lessonNotes,
        },
      });

      console.log(`[AttendanceWorker] ✅ Teacher ${teacherId} checked in → ${record.id}`);
      return record;
    }

    if (type === "student-register") {
      const { schoolId, slotId, date, markedBy, entries } = payload;

      const results = await prisma.$transaction(
        entries.map((entry: any) =>
          prisma.studentLessonAttendance.upsert({
            where: {
              studentId_slotId_date: {
                studentId: entry.studentId,
                slotId,
                date: new Date(date),
              },
            },
            update: {
              status: entry.status,
              absenceReason: entry.absenceReason || null,
              markedBy,
              updatedAt: new Date(),
            },
            create: {
              schoolId,
              studentId: entry.studentId,
              slotId,
              date: new Date(date),
              status: entry.status,
              absenceReason: entry.absenceReason || null,
              markedBy,
            },
          })
        )
      );

      // Queue notifications for absent students (delayed 15 min buffer)
      for (const entry of entries) {
        if (type === "absence-alert") {
          const { studentId, slotId, date, reason } = payload;
          // Re-fetch to see if teacher corrected it
          const record = await prisma.studentLessonAttendance.findUnique({
            where: { studentId_slotId_date: { studentId, slotId, date: new Date(date) } },
          });
          if (!record || record.status !== "absent") return { cancelled: true };

          const guardian = await prisma.guardian.findFirst({
            where: { studentId, isPrimary: true, isActive: true },
            include: { user: true },
          });
          if (!guardian) return { noGuardian: true };

          // TODO: send SMS/push via notification worker
          await prisma.studentLessonAttendance.update({
            where: { id: record.id },
            data: { parentNotified: true, notificationSentAt: new Date() },
          });

          console.log(`[AttendanceWorker]  Absence alert sent for student ${studentId}`);
          return { notified: true };
        }
      }

      console.log(`[AttendanceWorker] Register saved: ${results.length} records`);
      return { ok: true, count: results.length };
    }

    throw new Error(`Unknown attendance job type: ${type}`);
  },
  { connection, concurrency: 5 }
);

attendanceWorker.on("completed", (job) => {
  console.log(`[AttendanceWorker] Job ${job.id} completed`);
});

attendanceWorker.on("failed", (job, err) => {
  console.error(`[AttendanceWorker] Job ${job?.id} failed:`, err.message);
});