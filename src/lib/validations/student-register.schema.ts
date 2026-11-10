import { z } from 'zod';

export const registerStatusSchema = z.enum(['present', 'absent', 'late', 'excused']);

/**
 * Body of POST /api/attendance/student. The date's real-calendar / weekday / future rules need
 * the timetable slot, so they live in lib/attendance/register-date.ts.
 * `absenceReason` is free text (max 50) until the reason list is confirmed (tracker 2.1 lists
 * Sick | Parent pickup | School activity | Unknown; the design lists more).
 */
export const submitRegisterSchema = z
  .object({
    slotId: z.string().min(1).max(64),
    date: z.string().min(1).max(10),
    confirmed: z.boolean().optional(),
    entries: z
      .array(
        z.object({
          studentId: z.string().min(1).max(64),
          status: registerStatusSchema,
          absenceReason: z.string().max(50).optional(),
        })
      )
      .min(1, 'The register has no students')
      .max(500),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, entry] of value.entries.entries()) {
      if (seen.has(entry.studentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['entries', i, 'studentId'],
          message: 'Each student can appear only once in a register',
        });
      }
      seen.add(entry.studentId);
    }
  });

export type SubmitRegisterInput = z.infer<typeof submitRegisterSchema>;
