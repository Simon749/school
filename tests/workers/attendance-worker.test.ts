import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const slotFindUnique = vi.fn();
const calendarFindUnique = vi.fn();
const teacherAttUpsert = vi.fn();
const studentAttUpsert = vi.fn();
const lessonRegisterUpsert = vi.fn();
const userFindFirst = vi.fn();
const notifAdd = vi.fn().mockResolvedValue({ id: 'notif-1' });

vi.mock('@/lib/db', () => {
  const mockPrisma: any = {};
  Object.defineProperty(mockPrisma, 'timetableSlot', { get: () => ({ findUnique: (...a: unknown[]) => slotFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'schoolCalendarDay', { get: () => ({ findUnique: (...a: unknown[]) => calendarFindUnique(...a) }) });
  Object.defineProperty(mockPrisma, 'teacherAttendance', { get: () => ({ upsert: (...a: unknown[]) => teacherAttUpsert(...a) }) });
  Object.defineProperty(mockPrisma, 'studentLessonAttendance', { get: () => ({ upsert: (...a: unknown[]) => studentAttUpsert(...a) }) });
  Object.defineProperty(mockPrisma, 'lessonRegister', { get: () => ({ upsert: (...a: unknown[]) => lessonRegisterUpsert(...a) }) });
  Object.defineProperty(mockPrisma, 'user', { get: () => ({ findFirst: (...a: unknown[]) => userFindFirst(...a) }) });
  
  // ✅ FIX: Handle BOTH array and callback forms of Prisma $transaction
  mockPrisma.$transaction = async (arg: any) => {
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    if (typeof arg === 'function') {
      return arg(mockPrisma);
    }
    return arg;
  };
  
  return { prisma: mockPrisma };
});

vi.mock('@/lib/queue', () => ({
  notificationQueue: { add: (...a: unknown[]) => notifAdd(...a) },
}));

vi.mock('@/lib/calendar', () => ({
  getCalendarDay: (...a: unknown[]) => calendarFindUnique(...a),
}));

// Import the extracted processor function directly, NOT the Worker class instance
import { processAttendanceJob } from '../../workers/attendance';

const SLOT = '55555555-5555-4555-8555-555555555555';
const TODAY = '2026-10-26';

beforeEach(() => {
  for (const m of [slotFindUnique, calendarFindUnique, teacherAttUpsert, studentAttUpsert, lessonRegisterUpsert, userFindFirst, notifAdd]) {
    m.mockReset();
  }
  slotFindUnique.mockResolvedValue({ schoolId: 'school-A', isPublished: true, learningArea: { name: 'Math' } });
  calendarFindUnique.mockResolvedValue({ dayType: 'school_day', timetableType: 'normal' });
  teacherAttUpsert.mockResolvedValue({ id: 'att-1' });
  studentAttUpsert.mockResolvedValue({ id: 's-att-1' });
  lessonRegisterUpsert.mockResolvedValue({ id: 'reg-1' });
});

describe('Attendance Worker Processor (R2-05 / R4-11)', () => {
  describe('teacher-check-in job', () => {
    it('processes successfully when slot and calendar are valid', async () => {
      const job = {
        data: {
          type: 'teacher-check-in',
          payload: { teacherId: 't-1', schoolId: 'school-A', slotId: SLOT, date: TODAY, checkedInAt: new Date().toISOString(), checkInLat: 0, checkInLng: 0, geofencePassed: true, qrScanned: true, status: 'present', minutesLate: 0, lessonNotes: 'test' }
        }
      };
      
      const result = await processAttendanceJob(job);
      expect(result).toHaveProperty('id', 'att-1');
      expect(teacherAttUpsert).toHaveBeenCalled();
    });

    it('throws (triggers retry) if calendar day is not a school_day (R2-05)', async () => {
      calendarFindUnique.mockResolvedValue({ dayType: 'holiday', timetableType: 'none' });
      const job = {
        data: {
          type: 'teacher-check-in',
          payload: { teacherId: 't-1', schoolId: 'school-A', slotId: SLOT, date: TODAY, checkedInAt: new Date().toISOString(), checkInLat: 0, checkInLng: 0, geofencePassed: true, qrScanned: true, status: 'present', minutesLate: 0, lessonNotes: 'test' }
        }
      };
      
      await expect(processAttendanceJob(job)).rejects.toThrow('Cannot process check-in: holiday day');
      expect(teacherAttUpsert).not.toHaveBeenCalled();
    });

    it('throws if slot schoolId does not match payload (R2-05)', async () => {
      slotFindUnique.mockResolvedValue({ schoolId: 'school-B', isPublished: true });
      const job = {
        data: {
          type: 'teacher-check-in',
          payload: { teacherId: 't-1', schoolId: 'school-A', slotId: SLOT, date: TODAY, checkedInAt: new Date().toISOString(), checkInLat: 0, checkInLng: 0, geofencePassed: true, qrScanned: true, status: 'present', minutesLate: 0, lessonNotes: 'test' }
        }
      };
      
      await expect(processAttendanceJob(job)).rejects.toThrow('Invalid or unpublished slot at execution time');
    });
  });

  describe('student-register job', () => {
    it('processes successfully, locks register, and queues absence alerts for unknown reasons', async () => {
      userFindFirst.mockResolvedValue({ id: 'parent-1' });
      const job = {
        data: {
          type: 'student-register',
          payload: {
            schoolId: 'school-A',
            slotId: SLOT,
            date: TODAY,
            markedBy: 't-1',
            entries: [
              { studentId: 's1', status: 'present' },
              { studentId: 's2', status: 'absent', absenceReason: 'unknown' }
            ]
          }
        }
      };
      
      const result = await processAttendanceJob(job);
      // 2 student upserts + 1 register upsert = 3. The worker returns length - 1 (which is 2)
      expect(result).toEqual({ ok: true, count: 2 }); 
      
      expect(lessonRegisterUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { isLocked: true }, create: expect.objectContaining({ isLocked: true }) })
      );
      expect(notifAdd).toHaveBeenCalledWith(
        'absence-alert',
        expect.objectContaining({ data: expect.objectContaining({ studentId: 's2' }) }),
        expect.objectContaining({ delay: 15 * 60 * 1000 })
      );
    });

    it('throws (triggers retry) if calendar day is not a school_day (R2-05)', async () => {
      calendarFindUnique.mockResolvedValue({ dayType: 'exam_day', timetableType: 'exam' });
      const job = {
        data: {
          type: 'student-register',
          payload: { schoolId: 'school-A', slotId: SLOT, date: TODAY, markedBy: 't-1', entries: [] }
        }
      };
      
      await expect(processAttendanceJob(job)).rejects.toThrow('Cannot process register: exam_day day');
      expect(studentAttUpsert).not.toHaveBeenCalled();
    });
  });
});