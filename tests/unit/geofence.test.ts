import { describe, expect, it } from 'vitest';
import { haversineDistance, isInsideGeofence } from '@/lib/geofence/check';

// Sanity test: proves the harness runs, and pins current (correct) geofence maths.
describe('geofence maths', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(-1.286389, 36.817223, -1.286389, 36.817223)).toBe(0);
  });

  it('is about 111.2 km per degree of latitude', () => {
    const d = haversineDistance(0, 36.8, 1, 36.8);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('flags points outside the radius', () => {
    // ~111 m north of the centre
    const inside = isInsideGeofence(-1.285389, 36.817223, -1.286389, 36.817223, 150);
    const outside = isInsideGeofence(-1.285389, 36.817223, -1.286389, 36.817223, 50);
    expect(inside.isInside).toBe(true);
    expect(outside.isInside).toBe(false);
  });
});
