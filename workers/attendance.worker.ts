import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db";

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
      // Phase 2.1 — placeholder
      console.log(`[AttendanceWorker] 📋 Student register batch`, payload);
      return { ok: true };
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