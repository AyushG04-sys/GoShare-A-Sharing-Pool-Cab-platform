import { calculateHaversineDistance, estimateDurationMinutes } from '../utils/geo.js';

/**
 * Optimizes the waypoint order for shared rides.
 * Guarantees that each rider's pickup occurs before their dropoff.
 * 
 * @param {object} startLocation { lat, lng }
 * @param {Array<object>} riderSegments Array of { id, name, pickup: { lat, lng, label }, dropoff: { lat, lng, label } }
 * @returns {Array<object>} Ordered waypoints array
 */
export function buildOptimizedWaypoints(startLocation, riderSegments) {
  if (!riderSegments || riderSegments.length === 0) return [];

  if (riderSegments.length === 1) {
    const r = riderSegments[0];
    return [
      {
        stopIndex: 1,
        type: 'pickup',
        passengerId: r.id,
        passengerName: r.name,
        label: r.pickup.label,
        lat: r.pickup.lat,
        lng: r.pickup.lng,
      },
      {
        stopIndex: 2,
        type: 'dropoff',
        passengerId: r.id,
        passengerName: r.name,
        label: r.dropoff.label,
        lat: r.dropoff.lat,
        lng: r.dropoff.lng,
      },
    ];
  }

  // For 2 shared riders:
  // We need to visit Pickup 1 and Pickup 2 before any dropoff.
  const [r1, r2] = riderSegments;
  const start = startLocation || r1.pickup;

  const distToP1 = calculateHaversineDistance(start.lat, start.lng, r1.pickup.lat, r1.pickup.lng);
  const distToP2 = calculateHaversineDistance(start.lat, start.lng, r2.pickup.lat, r2.pickup.lng);

  // Pick the nearest pickup first
  const firstPickupRider = distToP1 <= distToP2 ? r1 : r2;
  const secondPickupRider = distToP1 <= distToP2 ? r2 : r1;

  // After second pickup, evaluate which dropoff is closer
  const lastPickupPos = secondPickupRider.pickup;
  const distToD1 = calculateHaversineDistance(
    lastPickupPos.lat,
    lastPickupPos.lng,
    firstPickupRider.dropoff.lat,
    firstPickupRider.dropoff.lng
  );
  const distToD2 = calculateHaversineDistance(
    lastPickupPos.lat,
    lastPickupPos.lng,
    secondPickupRider.dropoff.lat,
    secondPickupRider.dropoff.lng
  );

  const firstDropoffRider = distToD1 <= distToD2 ? firstPickupRider : secondPickupRider;
  const secondDropoffRider = distToD1 <= distToD2 ? secondPickupRider : firstPickupRider;

  return [
    {
      stopIndex: 1,
      type: 'pickup',
      passengerId: firstPickupRider.id,
      passengerName: firstPickupRider.name,
      label: firstPickupRider.pickup.label,
      lat: firstPickupRider.pickup.lat,
      lng: firstPickupRider.pickup.lng,
    },
    {
      stopIndex: 2,
      type: 'pickup',
      passengerId: secondPickupRider.id,
      passengerName: secondPickupRider.name,
      label: secondPickupRider.pickup.label,
      lat: secondPickupRider.pickup.lat,
      lng: secondPickupRider.pickup.lng,
    },
    {
      stopIndex: 3,
      type: 'dropoff',
      passengerId: firstDropoffRider.id,
      passengerName: firstDropoffRider.name,
      label: firstDropoffRider.dropoff.label,
      lat: firstDropoffRider.dropoff.lat,
      lng: firstDropoffRider.dropoff.lng,
    },
    {
      stopIndex: 4,
      type: 'dropoff',
      passengerId: secondDropoffRider.id,
      passengerName: secondDropoffRider.name,
      label: secondDropoffRider.dropoff.label,
      lat: secondDropoffRider.dropoff.lat,
      lng: secondDropoffRider.dropoff.lng,
    },
  ];
}

/**
 * Calculates the total path distance through a sequence of waypoints.
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {number} Distance in kilometers
 */
export function calculatePathDistance(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calculateHaversineDistance(
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng
    );
  }
  return Math.round(total * 100) / 100;
}
