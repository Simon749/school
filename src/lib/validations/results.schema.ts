// src/lib/validations/results.schema.ts
import { z } from "zod";

export const rubricScoreSchema = z.object({
  subStrandId: z.string().uuid(),
  score: z.enum(["EE", "ME", "AE", "BE"]),
  comment: z.string().optional().nullable(),
});

export const assessmentResultInputSchema = z.object({
  studentId: z.string().uuid(),
  marksObtained: z.coerce.number().min(0).optional().nullable(),
  teacherComment: z.string().optional().nullable(),
  rubricScores: z.array(rubricScoreSchema).optional(),
});

export const bulkUpsertResultsSchema = z.object({
  results: z.array(assessmentResultInputSchema),
});

export type BulkUpsertResultsInput = z.infer<typeof bulkUpsertResultsSchema>;