import { z } from "zod";

export const studentCreateSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  nemisNumber: z.string().min(1, "NEMIS number is required").max(20),
  admissionNumber: z.string().max(20).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  streamId: z.string().uuid("Valid stream is required"),
  isBoarding: z.boolean().default(false),
  photoUrl: z.string().url().optional().or(z.literal("")),
  medicalNotes: z.string().optional(),
  previousSchool: z.string().max(200).optional(),
});

export const studentUpdateSchema = studentCreateSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(["active", "transferred_out", "graduated", "withdrawn", "deceased"]).optional(),
  leavingDate: z.coerce.date().optional(),
  leavingReason: z.string().max(50).optional(),
  leavingCertificateRef: z.string().max(50).optional(),
});

export type StudentCreateInput = z.infer<typeof studentCreateSchema>;
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;