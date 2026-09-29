import { z } from "zod";

export const schoolIdentitySchema = z.object({
  name: z.string().min(2, "School name is required"),
  knecCode: z.string().max(20).optional(),
  county: z.string().min(1, "County is required"),
  subCounty: z.string().min(1, "Sub-county is required"),
  phone: z.string().regex(/^254\d{9}$/, "Use format: 2547XXXXXXXX"),
  email: z.string().email("Valid email required"),
  logoUrl: z.string().url().optional().or(z.literal("")),
});

export const calendarSchema = z.object({
  yearName: z.string().min(4, "Academic year name required"),
  terms: z.array(
    z.object({
      termNumber: z.number().min(1).max(3),
      name: z.string().min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
      midTermStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      midTermEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    })
  ).length(3),
});

export const gradeStreamSchema = z.object({
  grades: z.array(
    z.object({
      name: z.string().min(1),
      level: z.number().min(0).max(10),
      cbcStage: z.enum(["pre_primary", "lower_primary", "upper_primary", "jss"]),
      streams: z.array(
        z.object({
          name: z.string().min(1, "Stream name required"),
          capacity: z.coerce.number().min(1).max(100).default(40),
        })
      ).min(1, "At least one stream per grade"),
    })
  ).min(1, "Select at least one grade"),
});