import { z } from "zod";

export const createStreamSchema = z.object({
  gradeId: z.string().uuid("Invalid grade ID"),
  name: z.string().min(1, "Stream name is required").max(10, "Too long"),
  capacity: z.coerce.number().min(1).max(100).default(40),
});

export const updateStreamSchema = z.object({
  name: z.string().min(1).max(10).optional(),
  capacity: z.coerce.number().min(1).max(100).optional(),
});