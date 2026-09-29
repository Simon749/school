import { z } from "zod";

export const studentSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  nemisNumber: z.string().min(1, "NEMIS number is required").max(20),
  admissionNumber: z.string().max(20).optional().or(z.literal("")),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional(),
  streamId: z.string().uuid("Select a valid stream"),
  isBoarding: z.boolean().default(false),
  photoUrl: z.string().url().optional().or(z.literal("")),
  medicalNotes: z.string().optional(),
  previousSchool: z.string().optional(),
});

export const updateStudentSchema = studentSchema.partial().extend({
  status: z.enum(["active", "transferred_out", "graduated", "withdrawn", "deceased"]).optional(),
});

export const guardianLinkSchema = z.object({
  userId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^254\d{9}$/, "Use format: 2547XXXXXXXX").optional(),
  email: z.string().email().optional().or(z.literal("")),
  relationship: z.enum(["father", "mother", "guardian", "aunt", "uncle", "grandparent", "sibling"]),
  isPrimary: z.boolean().default(false),
  canPickup: z.boolean().default(true),
});