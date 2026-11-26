// src/lib/attendance/class-teacher-scope.ts
import { prisma } from '@/lib/db';
import { requirePageTeacher } from '@/lib/auth/current-user';
import { getNairobiDateString } from '@/lib/time';

export type ClassScope =
  | { ok: false; message: string }
  | {
      ok: true;
      schoolId: string;
      stream: { id: string; name: string; grade: { name: string } };
      term: { id: string; name: string | null; startDate: Date; endDate: Date };
      /** Today in Africa/Nairobi, YYYY-MM-DD. */
      todayKey: string;
      /** First and last day of the period analysed: the term start up to today (never the future). */
      from: Date;
      to: Date;
    };

/**
 * Who may see a class's attendance analytics: the CLASS TEACHER of that class, in their own school.
 * Every query the analytics pages make is scoped by the stream and school returned here.
 */
export async function getClassScope(): Promise<ClassScope> {
  const { teacher } = await requirePageTeacher();
  if (!teacher.isClassTeacher || !teacher.classTeacherStreamId) {
    return { ok: false, message: 'Only the class teacher can see class analytics.' };
  }

  const stream = await prisma.stream.findFirst({
    where: { id: teacher.classTeacherStreamId, schoolId: teacher.schoolId },
    select: { id: true, name: true, grade: { select: { name: true } } },
  });
  if (!stream) return { ok: false, message: 'Your class could not be found. Ask the school admin.' };

  const term = await prisma.term.findFirst({
    where: { schoolId: teacher.schoolId, isCurrent: true },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  if (!term) {
    return {
      ok: false,
      message: 'No current term is set for this school. Ask the school admin to mark the current term.',
    };
  }

  const todayKey = getNairobiDateString();
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const to = today < term.endDate ? today : term.endDate;
  return { ok: true, schoolId: teacher.schoolId, stream, term, todayKey, from: term.startDate, to };
}
