import { z } from 'zod';

/**
 * R1-18 / SEC-13: Strict validation for school settings updates.
 * - Enforces 50m–500m geofence radius bounds.
 * - Validates Kenyan phone number format.
 * - Uses .strict() to prevent mass-assignment of sensitive fields (e.g., smsBalance).
 */
export const schoolSettingsSchema = z.object({
  name: z
    .string()
    .min(2, 'School name must be at least 2 characters')
    .max(200, 'School name must be at most 200 characters')
    .optional(),
  
  phone: z
    .string()
    .regex(/^(?:\+254|0)[17]\d{8}$/, 'Invalid Kenyan phone number format (e.g., 0712345678 or +254712345678)')
    .optional(),
  
  email: z
    .string()
    .email('Invalid email address')
    .optional(),
  
  logoUrl: z
    .string()
    .url('Invalid logo URL')
    .optional(),
  
  latitude: z
    .coerce.number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
    .optional(),
  
  longitude: z
    .coerce.number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
    .optional(),
  
  geofenceRadius: z
    .coerce.number()
    .min(50, 'Geofence radius must be at least 50 meters')
    .max(500, 'Geofence radius must be at most 500 meters')
    .optional(),
}).strict();