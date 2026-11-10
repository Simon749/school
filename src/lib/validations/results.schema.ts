// src/lib/validations/results.schema.ts
import { z } from 'zod';

export const rubricScoreSchema = z.object({
  subStrandId: z.string().uuid(),
  score: z.enum(['EE', 'ME', 'AE', 'BE']),
  comment: z.string().max(500).optional().nullable(),
});

/** A blank mark means "not marked yet" (null). It must never silently become 0. */
const blankToNull = (value: unknown) => (value === '' ? null : value);

export const assessmentResultInputSchema = z.object({
  studentId: z.string().uuid(),
  marksObtained: z.preprocess(blankToNull, z.coerce.number().min(0).optional().nullable()),
  teacherComment: z.string().max(1000).optional().nullable(),
  rubricScores: z.array(rubricScoreSchema).max(100).optional(),
});

export const bulkUpsertResultsSchema = z
  .object({
    results: z.array(assessmentResultInputSchema).max(500),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.results.forEach((r, i) => {
      if (seen.has(r.studentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['results', i, 'studentId'],
          message: 'Each student can appear only once',
        });
      }
      seen.add(r.studentId);
    });
  });

export type BulkUpsertResultsInput = z.infer<typeof bulkUpsertResultsSchema>;
