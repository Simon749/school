import { prisma } from '@/lib/db';

export type CalendarDay = {
  id: string;
  date: Date;
  dayType: string; // e.g., 'school_day', 'holiday', 'mid_term_break', 'exam_day', 'closure'
  timetableType: string; // e.g., 'normal', 'exam', 'event', 'none'
};

/**
 * Fetches the calendar day record for a specific school and date.
 * Returns null if no record exists (which is treated as a non-school day).
 */
export async function getCalendarDay(schoolId: string, date: Date): Promise<CalendarDay | null> {
  // Force the date to midnight UTC to match Prisma's DATE column behavior reliably
  const dateStr = date.toISOString().split('T')[0];
  const queryDate = new Date(`${dateStr}T00:00:00.000Z`);

  const day = await prisma.schoolCalendarDay.findUnique({
    where: {
      schoolId_date: {
        schoolId,
        date: queryDate,
      },
    },
    select: {
      id: true,
      date: true,
      dayType: true,
      timetableType: true,
    },
  });

  if (!day) return null;

  return {
    id: day.id,
    date: day.date,
    dayType: day.dayType,
    timetableType: day.timetableType || 'none',
  };
}

/**
 * Checks if a given date is a valid 'school_day' for the school.
 */
export async function isSchoolDay(schoolId: string, date: Date): Promise<boolean> {
  const day = await getCalendarDay(schoolId, date);
  return day?.dayType === 'school_day';
}