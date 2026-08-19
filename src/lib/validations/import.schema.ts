import { z } from "zod";

export const csvStudentRowSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  nemis_number: z.string().min(1, "NEMIS number is required").max(20),
  admission_number: z.string().max(20).optional(),
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  grade_name: z.string().min(1, "Grade name is required (e.g., Grade 7)"),
  stream_name: z.string().min(1, "Stream name is required (e.g., A)"),
  is_boarding: z.string().transform((val) => val.toLowerCase() === "true" || val === "1").optional(),
  guardian_first_name: z.string().min(1, "Guardian first name is required"),
  guardian_last_name: z.string().min(1, "Guardian last name is required"),
  guardian_phone: z.string().regex(/^254\d{9}$/, "Guardian phone must be 2547XXXXXXXX"),
  guardian_relationship: z.enum(["father", "mother", "guardian", "aunt", "uncle", "grandparent", "sibling"]),
});

export type CsvStudentRow = z.infer<typeof csvStudentRowSchema>;