/**
 * Earth radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Average urban vehicle speed in km/h for ETA estimation
 */
export const AVG_SPEED_KMH = 25;

/**
 * Calculates the Haversine distance between two coordinates in kilometers.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers (rounded to 2 decimal places)
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined || lon1 === undefined ||
    lat2 === undefined || lon2 === undefined ||
    lat1 === null || lon1 === null ||
    lat2 === null || lon2 === null
  ) {
    return 0;
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Converts degrees to radians.
 */
function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 */
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/**
 * Calculates initial bearing from point 1 to point 2 in degrees (0 - 360).
 */
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return Math.round(bearing * 10) / 10;
}

/**
 * Estimates trip duration in minutes given a distance in kilometers.
 * @param {number} distanceKm
 * @param {number} [speedKmh=AVG_SPEED_KMH]
 * @returns {number} Estimated minutes
 */
export function estimateDurationMinutes(distanceKm, speedKmh = AVG_SPEED_KMH) {
  if (!distanceKm || distanceKm <= 0) return 2;
  const hours = distanceKm / speedKmh;
  return Math.max(2, Math.round(hours * 60));
}
