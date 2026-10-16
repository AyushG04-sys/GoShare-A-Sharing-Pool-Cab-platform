import { calculateHaversineDistance, calculateBearing } from '../utils/geo.js';
import { getSupabaseAdmin } from '../config/supabase.js';

/**
 * Maximum pickup proximity threshold in kilometers for shared matching
 */
export const MAX_PICKUP_PROXIMITY_KM = 3.0;

/**
 * Maximum dropoff proximity threshold in kilometers for shared matching
 */
export const MAX_DROPOFF_PROXIMITY_KM = 4.0;

/**
 * Matching time window in minutes
 */
export const MATCHING_WINDOW_MINUTES = 15;

/**
 * Evaluates compatibility between an existing shared booking and a new rider request.
 * @param {object} existingBooking
 * @param {object} candidateRequest
 * @returns {{ isCompatible: boolean, pickupDistanceKm: number, dropoffDistanceKm: number, score: number, reason?: string }}
 */
export function evaluateCompatibility(existingBooking, candidateRequest) {
  // 1. Same vehicle category check
  if (existingBooking.vehicle_category !== candidateRequest.vehicle_category) {
    return { isCompatible: false, reason: 'Vehicle category mismatch' };
  }

  // 2. Capacity check
  const currentCount = existingBooking.passenger_count || 1;
  const maxCount = existingBooking.max_passengers || 2;
  if (currentCount >= maxCount) {
    return { isCompatible: false, reason: 'Vehicle pool is full' };
  }

  // 3. User check (cannot pool with oneself)
  if (existingBooking.created_by === candidateRequest.userId) {
    return { isCompatible: false, reason: 'Cannot share with own booking' };
  }

  // 4. Pickup proximity check
  const pickupDist = calculateHaversineDistance(
    existingBooking.pickup_lat,
    existingBooking.pickup_lng,
    candidateRequest.pickup_lat,
    candidateRequest.pickup_lng
  );

  if (pickupDist > MAX_PICKUP_PROXIMITY_KM) {
    return {
      isCompatible: false,
      pickupDistanceKm: pickupDist,
      reason: `Pickup too far (${pickupDist} km > ${MAX_PICKUP_PROXIMITY_KM} km limit)`,
    };
  }

  // 5. Dropoff proximity check
  const dropoffDist = calculateHaversineDistance(
    existingBooking.destination_lat,
    existingBooking.destination_lng,
    candidateRequest.destination_lat,
    candidateRequest.destination_lng
  );

  if (dropoffDist > MAX_DROPOFF_PROXIMITY_KM) {
    return {
      isCompatible: false,
      dropoffDistanceKm: dropoffDist,
      reason: `Dropoff too far (${dropoffDist} km > ${MAX_DROPOFF_PROXIMITY_KM} km limit)`,
    };
  }

  // 6. Gender-matching preference compatibility check
  if (existingBooking.female_driver_preferred || candidateRequest.female_driver_preferred) {
    const existingGender = (existingBooking.profiles?.gender || existingBooking.creator_gender || '').toLowerCase();
    const candidateGender = (candidateRequest.userGender || candidateRequest.creator_gender || '').toLowerCase();

    if (
      !existingGender ||
      !candidateGender ||
      (existingGender !== 'female' && existingGender !== 'male') ||
      (candidateGender !== 'female' && candidateGender !== 'male') ||
      existingGender !== candidateGender
    ) {
      return {
        isCompatible: false,
        reason: 'Gender matching preference incompatible',
      };
    }
  }

  // Compatibility score: lower is better (combined detour distance)
  const score = Math.round((pickupDist + dropoffDist) * 100) / 100;

  return {
    isCompatible: true,
    pickupDistanceKm: pickupDist,
    dropoffDistanceKm: dropoffDist,
    score,
  };
}

/**
 * Searches the database for available shared ride candidates matching the request.
 * @param {object} candidateRequest
 * @returns {Promise<Array<object>>} Ranked list of matches
 */
export async function findSharedRideMatches(candidateRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const windowStart = new Date(Date.now() - MATCHING_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Query pending or accepted shared bookings within time window
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      ride_type,
      vehicle_category,
      status,
      female_driver_preferred,
      created_by,
      pickup_lat,
      pickup_lng,
      pickup_label,
      destination_lat,
      destination_lng,
      destination_label,
      passenger_count,
      max_passengers,
      created_at,
      driver_id,
      profiles!bookings_created_by_fkey (
        name,
        phone,
        gender
      )
    `)
    .eq('ride_type', 'shared')
    .in('status', ['pending', 'accepted'])
    .eq('vehicle_category', candidateRequest.vehicle_category)
    .neq('created_by', candidateRequest.userId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error querying shared matches:', error);
    return [];
  }

  const compatibleMatches = [];

  for (const booking of bookings || []) {
    const comp = evaluateCompatibility(booking, candidateRequest);
    if (comp.isCompatible) {
      compatibleMatches.push({
        bookingId: booking.id,
        booking,
        pickupDistanceKm: comp.pickupDistanceKm,
        dropoffDistanceKm: comp.dropoffDistanceKm,
        detourScore: comp.score,
        primaryRiderName: booking.profiles?.name || 'Rider',
        pickupLabel: booking.pickup_label,
        destinationLabel: booking.destination_label,
        currentPassengers: booking.passenger_count || 1,
        maxPassengers: booking.max_passengers || 2,
        status: booking.status,
      });
    }
  }

  // Sort by lowest detour score (closest match)
  compatibleMatches.sort((a, b) => a.detourScore - b.detourScore);

  return compatibleMatches;
}
