// src/lib/validations/results.schema.ts
import { z } from 'zod';

export const resultStatusSchema = z.enum(['scored', 'absent', 'not_entered']);

export const rubricScoreSchema = z.object({
  subStrandId: z.string().uuid(),
  score: z.enum(['EE', 'ME', 'AE', 'BE']),
  comment: z.string().max(500).optional().nullable(),
});

/** Preserve null/empty marks as null; only convert non-empty numeric strings. */
const parseOptionalNumber = (value: unknown) => {
  if (value === '') return null;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return Number(value);
  return value;
};

export const assessmentResultInputSchema = z.object({
  studentId: z.string().uuid(),
  resultStatus: resultStatusSchema.optional(),
  marksObtained: z.preprocess(
    parseOptionalNumber,
    z.number().finite().min(0).optional().nullable()
  ),
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

      const rubricIds = new Set<string>();
      (r.rubricScores ?? []).forEach((score, scoreIndex) => {
        if (rubricIds.has(score.subStrandId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['results', i, 'rubricScores', scoreIndex, 'subStrandId'],
            message: 'A sub-strand can only be scored once per learner',
          });
        }
        rubricIds.add(score.subStrandId);
      });
    });
  });

export type BulkUpsertResultsInput = z.infer<typeof bulkUpsertResultsSchema>;

/**
 * The ONLY edit allowed after results are published: a learner who was ABSENT and later sat a
 * special exam. A reason is mandatory because it goes into the audit trail.
 */
export const specialExamSchema = z.object({
  studentId: z.string().uuid(),
  marksObtained: z.coerce.number().finite().min(0, 'Marks cannot be negative'),
  reason: z
    .string()
    .trim()
    .min(5, 'Say why this learner is sitting a special exam (at least 5 characters)')
    .max(500),
});

export type SpecialExamInput = z.infer<typeof specialExamSchema>;
