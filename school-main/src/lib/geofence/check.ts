/**
 * Haversine distance between two GPS coordinates.
 * Returns distance in metres.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function isInsideGeofence(
  lat: number,
  lng: number,
  schoolLat: number,
  schoolLng: number,
  radiusMetres: number
): { distance: number; isInside: boolean } {
  const distance = haversineDistance(lat, lng, schoolLat, schoolLng);
  return { distance, isInside: distance <= radiusMetres };
}