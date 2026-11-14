import { Worker, Job } from 'bullmq';
import { connection } from '@/lib/queue/connection'; // Ensure this path matches your setup
import { prisma } from '@/lib/db';
import { notificationQueue } from '@/lib/queue';

export const attendanceWorker = new Worker(
  'attendance-queue', // Fixed: was 'attendance' (PIPE-02 mismatch)
  async (job: Job) => {
    const { type, payload } = job.data;

    if (type === 'teacher-check-in') {
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

      // PIPE-06: Re-validate school exists and is active
      const school = await prisma.school.findUnique({
        where: { id: schoolId, deletedAt: null },
      });
      if (!school) throw new Error(`School ${schoolId} not found or deleted`);

      // PIPE-06: Re-validate teacher belongs to this school
      const teacher = await prisma.teacher.findFirst({
        where: { id: teacherId, schoolId },
      });
      if (!teacher) throw new Error(`Teacher ${teacherId} not found in school ${schoolId}`);

      // PIPE-06: Re-validate slot belongs to this school and is published
      const slot = await prisma.timetableSlot.findFirst({
        where: { id: slotId, schoolId, isPublished: true },
        select: { secondPeriodId: true, learningArea: { select: { name: true } } },
      });
      if (!slot) throw new Error(`Slot ${slotId} not found, unpublished, or wrong school`);

      // 1. ATT-12: Check for existing record to prevent silent overwrites
      const existingRecord = await prisma.teacherAttendance.findUnique({
        where: {
          teacherId_slotId_date: { teacherId, slotId, date: new Date(date) },
        },
      });

      if (existingRecord?.checkedInAt) {
        throw new Error('TEACHER_ALREADY_CHECKED_IN');
      }

      // 3. Perform the upsert (safe create/update)
      const record = await prisma.teacherAttendance.upsert({
        where: {
          teacherId_slotId_date: { teacherId, slotId, date: new Date(date) },
        },
        update: {
          checkedInAt: existingRecord?.checkedInAt || new Date(checkedInAt),
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

      // 4. ATT-12: Double-lesson auto-cover
      if (slot.secondPeriodId) {
        await prisma.teacherAttendance.upsert({
          where: {
            teacherId_slotId_date: {
              teacherId,
              slotId: slot.secondPeriodId,
              date: new Date(date),
            },
          },
          update: {
            status: 'covered',
            lessonNotes: `Auto-covered via double lesson from slot ${slotId}`,
          },
          create: {
            schoolId,
            teacherId,
            slotId: slot.secondPeriodId,
            date: new Date(date),
            status: 'covered',
            lessonNotes: `Auto-covered via double lesson from slot ${slotId}`,
          },
        });
      }

      console.log(`[AttendanceWorker] Teacher ${teacherId} checked in → ${record.id}`);
      return record;
    }

    if (type === 'student-register') {
      const { schoolId, slotId, date, markedBy, entries } = payload;

      // PIPE-06: Re-validate slot belongs to school
      const slot = await prisma.timetableSlot.findFirst({
        where: { id: slotId, schoolId },
        include: { learningArea: true },
      });
      if (!slot) throw new Error(`Slot ${slotId} not found in school ${schoolId}`);

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

      for (const entry of entries) {
        if (entry.status !== 'absent') continue;
        const reason = entry.absenceReason || 'unknown';
        if (reason !== 'unknown') continue;

        const notifyJob = await notificationQueue.add(
          'absence-alert',
          {
            studentId: entry.studentId,
            slotId,
            date,
            lessonName: slot.learningArea.name || 'Lesson',
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

attendanceWorker.on('completed', (job) => {
  console.log(`[AttendanceWorker] Job ${job.id} completed`);
});

attendanceWorker.on('failed', (job, err) => {
  console.error(`[AttendanceWorker] Job ${job?.id} failed:`, err.message);
});
