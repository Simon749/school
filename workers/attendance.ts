import { Worker, Job } from 'bullmq';
import { connection } from '@/lib/queue/connection';
import { prisma } from '@/lib/db';
import { notificationQueue } from '@/lib/queue';
import { getCalendarDay } from '@/lib/calendar';

// 1. Extract the processor logic into a testable, exported function
export async function processAttendanceJob(job: { data: any }) {
  const { type, payload } = job.data;

  if (type === 'teacher-check-in') {
    const { teacherId, schoolId, slotId, date, checkedInAt, checkInLat, checkInLng, geofencePassed, qrScanned, status, minutesLate, lessonNotes } = payload;

    // R2-05: Re-validate slot and school at execution time
    const slot = await prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: { schoolId: true, isPublished: true },
    });
    if (!slot || slot.schoolId !== schoolId || !slot.isPublished) {
      throw new Error('Invalid or unpublished slot at execution time');
    }

    // R2-05: Re-validate calendar day
    const calendarDay = await getCalendarDay(schoolId, new Date(date));
    if (!calendarDay || calendarDay.dayType !== 'school_day') {
      throw new Error(`Cannot process check-in: ${calendarDay?.dayType || 'non-school'} day`);
    }

    const record = await prisma.teacherAttendance.upsert({
      where: { teacherId_slotId_date: { teacherId, slotId, date: new Date(date) } },
      update: { checkedInAt: new Date(checkedInAt), checkInLat, checkInLng, geofencePassed, qrScanned, status, minutesLate, lessonNotes },
      create: { schoolId, teacherId, slotId, date: new Date(date), checkedInAt: new Date(checkedInAt), checkInLat, checkInLng, geofencePassed, qrScanned, status, minutesLate, lessonNotes },
    });

    return record;
  }

  if (type === 'student-register') {
    const { schoolId, slotId, date, markedBy, entries } = payload;

    // R2-05: Re-validate slot and school
    const slot = await prisma.timetableSlot.findUnique({
      where: { id: slotId },
      select: { schoolId: true, learningArea: { select: { name: true } } },
    });
    if (!slot || slot.schoolId !== schoolId) {
      throw new Error('Invalid slot or school mismatch at execution time');
    }

    // R2-05: Re-validate calendar day
    const calendarDay = await getCalendarDay(schoolId, new Date(date));
    if (!calendarDay || calendarDay.dayType !== 'school_day') {
      throw new Error(`Cannot process register: ${calendarDay?.dayType || 'non-school'} day`);
    }

    const results = await prisma.$transaction([
      ...entries.map((entry: { studentId: string; status: string; absenceReason?: string; notificationJobId?: string | null; notificationHeld?: boolean }) =>
        prisma.studentLessonAttendance.upsert({
          where: { studentId_slotId_date: { studentId: entry.studentId, slotId, date: new Date(date) } },
          update: { status: entry.status, absenceReason: entry.absenceReason || null, markedBy, notificationJobId: entry.notificationJobId, notificationHeld: entry.notificationHeld },
          create: { schoolId, studentId: entry.studentId, slotId, date: new Date(date), status: entry.status, absenceReason: entry.absenceReason || null, markedBy, notificationJobId: entry.notificationJobId, notificationHeld: entry.notificationHeld },
        })
      ),
      prisma.lessonRegister.upsert({
        where: { slotId_date: { slotId, date: new Date(date) } },
        update: { isLocked: true },
        create: { schoolId, slotId, date: new Date(date), isLocked: true },
      }),
    ]);

    // Fallback notification queueing for 'unknown' absences
    for (const entry of entries) {
      if (entry.status === 'absent' && (!entry.absenceReason || entry.absenceReason === 'unknown')) {
        const parent = await prisma.user.findFirst({
          where: {
            isActive: true,
            deletedAt: null,
            guardians: { some: { studentId: entry.studentId, isPrimary: true, isActive: true } },
          },
          select: { id: true },
        });

        if (parent) {
          await notificationQueue.add(
            'absence-alert',
            {
              userId: parent.id,
              type: 'attendance',
              title: 'Absence Alert',
              body: `Your child was absent from ${slot.learningArea?.name || 'Lesson'}. Reason: Unknown.`,
              data: { studentId: entry.studentId, date, url: `/parent/${entry.studentId}/attendance` },
            },
            { delay: 15 * 60 * 1000, jobId: `absence-${entry.studentId}-${slotId}-${date}` }
          );
        }
      }
    }

    return { ok: true, count: results.length - 1 };
  }

  throw new Error(`Unknown attendance job type: ${type}`);
}

// 2. The actual worker simply delegates to this extracted function
export const attendanceWorker = new Worker(
  'attendance',
  processAttendanceJob,
  { connection, concurrency: 5 }
);

attendanceWorker.on('completed', (job) => {
  console.log(`[AttendanceWorker] Job ${job.id} completed`);
});

attendanceWorker.on('failed', (job, err) => {
  console.error(`[AttendanceWorker] Job ${job?.id} failed:`, err.message);
});