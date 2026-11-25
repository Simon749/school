// src/lib/validations/assessment.schema.ts
import { z } from 'zod';

export const assessmentTypeSchema = z.enum([
  'cat',
  'exam',
  'assignment',
  'project',
  'portfolio',
  'knec_external',
]);

/** Types that are scored with marks, so they need a maximum to be scored against and ranked. */
export const MARK_BASED_TYPES = ['cat', 'exam', 'assignment'] as const;

const createAssessmentBase = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  type: assessmentTypeSchema,
  assessmentDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid date format',
  }),
  // dueDate is intentionally absent: the database has no due_date column yet (design: SCH-03).
  maxMarks: z.coerce.number().min(1).optional(),
  weightPercent: z.coerce.number().min(0).max(100).optional(),
  streamId: z.string().uuid('Invalid stream ID'),
  learningAreaId: z.string().uuid('Invalid learning area ID'),
  termId: z.string().uuid('Invalid term ID'),
  instructions: z.string().max(1000).optional(),
});

export const createAssessmentSchema = createAssessmentBase.superRefine((value, ctx) => {
  // Without a maximum there is no marks box in the markbook and the assessment cannot be ranked.
  if ((MARK_BASED_TYPES as readonly string[]).includes(value.type) && value.maxMarks == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxMarks'],
      message: 'Enter the maximum marks for this CAT, exam or assignment. Example: 50.',
    });
  }
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
