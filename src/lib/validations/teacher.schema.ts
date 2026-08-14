import { z } from "zod";

export const teacherSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().regex(/^254\d{9}$/, "Use format: 2547XXXXXXXX").optional().or(z.literal("")),
  nationalId: z.string().max(20).optional().or(z.literal("")),
  tscNumber: z.string().max(20).optional().or(z.literal("")),
  employmentType: z.enum(["tsc", "bom"]).default("bom"),
  specialisation: z.array(z.string()).default([]),
  isClassTeacher: z.boolean().default(false),
  classTeacherStreamId: z.string().uuid().optional().or(z.literal("")),
});

export const updateTeacherSchema = teacherSchema.partial();