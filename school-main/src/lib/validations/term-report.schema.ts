// src/lib/validations/term-report.schema.ts
import { z } from "zod";

export const conductRatingSchema = z.enum([
  "excellent",
  "very_good",
  "good",
  "fair",
  "needs_improvement",
]);

export const generateTermReportSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  classTeacherComment: z.string().max(500).optional(),
  principalComment: z.string().max(500).optional(),
  conduct: conductRatingSchema.optional(),
});

export type GenerateTermReportInput = z.infer<typeof generateTermReportSchema>;