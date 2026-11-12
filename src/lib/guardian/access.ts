import { Guardian, Student } from '@prisma/client';

type RestrictedGuardianSensitiveData = Partial<{
  arrivedAt: Date | null;
  departedAt: Date | null;
  lastArrival: Date | null;
  checkInLat: number | null;
  checkInLng: number | null;
  geofencePassed: boolean | null;
}>;

/**
 * Sanitizes student/attendance data based on guardian restrictions.
 * Per DESIGN §7 / D4: Restricted guardians cannot see arrival/departure times 
 * or precise location data, but can still see attendance status and results.
 */
export function sanitizeForRestrictedGuardian<T extends Record<string, any>>(
  guardian: { hasRestrictedAccess: boolean },
  data: T
): T {
  if (!guardian.hasRestrictedAccess) {
    return data; // Full access, return as-is
  }

  // Create a shallow copy to avoid mutating the original object
  const sanitized = { ...data } as any;

  // Remove sensitive temporal/location fields if they exist
  if ('arrivedAt' in sanitized) sanitized.arrivedAt = null;
  if ('departedAt' in sanitized) sanitized.departedAt = null;
  if ('lastArrival' in sanitized) sanitized.lastArrival = null;
  if ('checkInLat' in sanitized) sanitized.checkInLat = null;
  if ('checkInLng' in sanitized) sanitized.checkInLng = null;
  if ('geofencePassed' in sanitized) sanitized.geofencePassed = null;

  return sanitized as T;
}