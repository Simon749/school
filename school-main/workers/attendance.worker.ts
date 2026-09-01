import { Worker } from "bullmq";
import { connection } from "@/lib/queue/connection";
import { prisma } from "@/lib/db";
import { notificationQueue } from "@/lib/queue";

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

      console.log(`[AttendanceWorker] Teacher ${teacherId} checked in → ${record.id}`);
      return record;
    }

    if (type === "student-register") {
      const { schoolId, slotId, date, markedBy, entries } = payload;

      const results = await prisma.$transaction([
        ...entries.map((entry: { studentId: string; status: string; absenceReason?: string }) =>
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
        ),
        prisma.lessonRegister.upsert({
          where: { slotId_date: { slotId, date: new Date(date) } },
          update: { isLocked: true, submittedAt: new Date(), submittedBy: markedBy },
          create: {
            schoolId,
            slotId,
            date: new Date(date),
            isLocked: true,
            submittedAt: new Date(),
            submittedBy: markedBy,
          },
        }),
      ]);

      const slot = await prisma.timetableSlot.findUnique({
        where: { id: slotId },
        include: { learningArea: true },
      });

      for (const entry of entries) {
        if (entry.status !== "absent") continue;
        const reason = entry.absenceReason || "unknown";
        if (reason !== "unknown") continue;

        const notifyJob = await notificationQueue.add(
          "absence-alert",
          {
            studentId: entry.studentId,
            slotId,
            date,
            lessonName: slot?.learningArea.name || "Lesson",
            reason,
          },
          { delay: 15 * 60 * 1000, jobId: `absence-${entry.studentId}-${slotId}-${date}` }
        );

        const record = await prisma.studentLessonAttendance.findUnique({
          where: {
            studentId_slotId_date: {
              studentId: entry.studentId,
              slotId,
              date: new Date(date),
            },
          },
        });
        if (record) {
          await prisma.studentLessonAttendance.update({
            where: { id: record.id },
            data: { notificationHeld: true, notificationJobId: notifyJob.id },
          });
        }
      }

      console.log(`[AttendanceWorker] Register saved: ${results.length - 1} records`);
      return { ok: true, count: results.length - 1 };
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
