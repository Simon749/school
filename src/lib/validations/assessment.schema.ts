// src/lib/validations/assessment.schema.ts
import { z } from "zod";

export const assessmentTypeSchema = z.enum([
  "cat",
  "exam",
  "assignment",
  "project",
  "portfolio",
  "knec_external",
]);

export const createAssessmentSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  type: assessmentTypeSchema,
  assessmentDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  dueDate: z.string().optional(),
  maxMarks: z.coerce.number().min(1).optional(),
  weightPercent: z.coerce.number().min(0).max(100).optional(),
  streamId: z.string().uuid("Invalid stream ID"),
  learningAreaId: z.string().uuid("Invalid learning area ID"),
  termId: z.string().uuid("Invalid term ID"),
  instructions: z.string().max(1000).optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;