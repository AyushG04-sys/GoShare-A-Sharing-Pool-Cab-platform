import { getSupabaseAdmin } from '../config/supabase.js';
import { calculateHaversineDistance, estimateDurationMinutes } from '../utils/geo.js';
import { calculateFare } from './fare.service.js';
import { generateOtp, hashOtp, verifyOtp, recoverOtpFromHash } from './otp.service.js';
import { buildOptimizedWaypoints, calculatePathDistance } from './route.service.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors.js';
import { DEMO_USERS } from '../middleware/auth.js';

export class BookingService {
  /**
   * Creates a new solo or shared booking.
   */
  static async createBooking(data, userId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    const {
      ride_type = 'solo',
      vehicle_category,
      pickup_lat,
      pickup_lng,
      pickup_label = 'Pickup Location',
      destination_lat,
      destination_lng,
      destination_label = 'Destination Location',
      female_driver_preferred = false,
      payment_method = 'cash',
    } = data;

    // 1. Calculate distance & duration
    const distanceKm = calculateHaversineDistance(
      pickup_lat,
      pickup_lng,
      destination_lat,
      destination_lng
    );

    if (distanceKm <= 0.05) {
      throw new BadRequestError('Pickup and destination must be distinct locations');
    }

    const durationMin = estimateDurationMinutes(distanceKm);

    // 2. Calculate fare
    const fareInfo = calculateFare(vehicle_category, distanceKm);
    const isShared = ride_type === 'shared';
    const finalFare = isShared ? fareInfo.sharedFare : fareInfo.soloFare;
    const baseFare = fareInfo.baseFare;

    // Verify user doesn't already have an active accepted or in-progress trip
    const { data: existingActive } = await supabase
      .from('bookings')
      .select('id, status')
      .eq('created_by', userId)
      .in('status', ['accepted', 'in_progress'])
      .limit(1)
      .maybeSingle();

    if (existingActive) {
      throw new ConflictError(
        'You already have an active ride in progress. Please complete or cancel it before booking a new one.'
      );
    }

    // 3. Auto-cancel any previous stale pending bookings by this user to prevent duplicates
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('created_by', userId)
      .eq('status', 'pending');

    // 4. Generate secure OTP
    const rawOtp = generateOtp();
    const hashedOtp = hashOtp(rawOtp);

    // 5. Insert booking
    const maxPassengers = isShared ? 2 : 1;

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({
        ride_type,
        vehicle_category,
        status: 'pending',
        female_driver_preferred,
        payment_method,
        created_by: userId,
        pickup_lat,
        pickup_lng,
        pickup_label,
        destination_lat,
        destination_lng,
        destination_label,
        route_distance_km: distanceKm,
        route_duration_min: durationMin,
        base_fare: baseFare,
        final_fare: finalFare,
        otp_hash: hashedOtp,
        otp_verified: false,
        passenger_count: 1,
        max_passengers: maxPassengers,
      })
      .select()
      .single();

    if (bookingErr) {
      console.error('Error creating booking in database:', bookingErr);
      throw new BadRequestError(bookingErr.message);
    }

    // Attach plaintext OTP to the returned booking object
    booking.otp = rawOtp;

    // 6. Insert primary passenger record
    const { data: insertedBp, error: passErr } = await supabase
      .from('booking_passengers')
      .insert({
        booking_id: booking.id,
        user_id: userId,
        fare_amount: finalFare,
        pickup_lat,
        pickup_lng,
        pickup_label,
        destination_lat,
        destination_lng,
        destination_label,
        passenger_order: 1,
      })
      .select('id')
      .maybeSingle();

    if (passErr) {
      console.error('Error inserting booking passenger:', passErr);
    }

    // 7. Insert initial waypoints
    const bpId = insertedBp?.id;
    if (bpId) {
      const waypoints = [
        {
          booking_id: booking.id,
          stop_order: 1,
          waypoint_type: 'pickup',
          passenger_id: bpId,
          label: pickup_label,
          lat: pickup_lat,
          lng: pickup_lng,
        },
        {
          booking_id: booking.id,
          stop_order: 2,
          waypoint_type: 'dropoff',
          passenger_id: bpId,
          label: destination_label,
          lat: destination_lat,
          lng: destination_lng,
        },
      ];

      await supabase.from('booking_waypoints').insert(waypoints);
    }

    return {
      booking,
      otp: rawOtp, // Only returned to creator once
    };
  }

  /**
   * Joins an existing shared ride as co-passenger.
   */
  static async joinSharedRide(bookingId, data, userId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    // 1. Fetch current booking
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*, profiles!bookings_created_by_fkey(name)')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      throw new NotFoundError('Shared booking not found');
    }

    if (booking.ride_type !== 'shared') {
      throw new BadRequestError('This booking is not a shared ride');
    }

    if (!['pending', 'accepted'].includes(booking.status)) {
      throw new ConflictError(`Cannot join a ride that is already ${booking.status}`);
    }

    if (booking.created_by === userId) {
      throw new ConflictError('You cannot join your own booking');
    }

    if (booking.passenger_count >= booking.max_passengers) {
      throw new ConflictError('This shared ride has already reached capacity');
    }

    // If gender matching was requested on this shared ride, enforce passenger gender compatibility
    if (booking.female_driver_preferred) {
      const { data: primaryProf } = await supabase
        .from('profiles')
        .select('gender')
        .eq('id', booking.created_by)
        .maybeSingle();

      const { data: joinerProf } = await supabase
        .from('profiles')
        .select('gender')
        .eq('id', userId)
        .maybeSingle();

      const primaryGender = primaryProf?.gender ? primaryProf.gender.toLowerCase() : null;
      const joinerGender = joinerProf?.gender ? joinerProf.gender.toLowerCase() : null;

      if (!primaryGender || !joinerGender || primaryGender !== joinerGender) {
        throw new ConflictError(
          'This shared ride has same-gender matching enabled and is not compatible with your profile gender.'
        );
      }
    }

    const {
      pickup_lat,
      pickup_lng,
      pickup_label = 'Pickup 2',
      destination_lat,
      destination_lng,
      destination_label = 'Destination 2',
    } = data;

    // 2. Calculate co-passenger fare
    const distanceKm = calculateHaversineDistance(
      pickup_lat,
      pickup_lng,
      destination_lat,
      destination_lng
    );
    const fareInfo = calculateFare(booking.vehicle_category, distanceKm);
    const passengerFare = fareInfo.sharedFare;

    // 3. Generate co-passenger OTP
    const rawOtp = generateOtp();
    const hashedOtp = hashOtp(rawOtp);

    // 4. Insert co-passenger
    const { data: coBp, error: passErr } = await supabase
      .from('booking_passengers')
      .insert({
        booking_id: booking.id,
        user_id: userId,
        fare_amount: passengerFare,
        pickup_lat,
        pickup_lng,
        pickup_label,
        destination_lat,
        destination_lng,
        destination_label,
        passenger_order: 2,
      })
      .select('id')
      .maybeSingle();

    if (passErr) {
      console.error('Error inserting co-passenger:', passErr);
      throw new BadRequestError(passErr.message);
    }

    // Also get primary rider's bp id
    const { data: primaryBp } = await supabase
      .from('booking_passengers')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('user_id', booking.created_by)
      .maybeSingle();

    // 5. Fetch co-passenger profile name
    const { data: coProfile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    // 6. Rebuild optimized waypoints for 2 passengers
    const riderSegments = [
      {
        id: booking.created_by,
        name: booking.profiles?.name || 'Primary Rider',
        pickup: { lat: booking.pickup_lat, lng: booking.pickup_lng, label: booking.pickup_label },
        dropoff: {
          lat: booking.destination_lat,
          lng: booking.destination_lng,
          label: booking.destination_label,
        },
      },
      {
        id: userId,
        name: coProfile?.name || 'Co-Rider',
        pickup: { lat: pickup_lat, lng: pickup_lng, label: pickup_label },
        dropoff: { lat: destination_lat, lng: destination_lng, label: destination_label },
      },
    ];

    const optimizedStops = buildOptimizedWaypoints(
      { lat: booking.pickup_lat, lng: booking.pickup_lng },
      riderSegments
    );

    // Delete existing waypoints and replace with optimized 4-waypoint route
    await supabase.from('booking_waypoints').delete().eq('booking_id', booking.id);

    const newWaypoints = optimizedStops.map((stop) => ({
      booking_id: booking.id,
      passenger_id: (stop.passengerId === booking.created_by ? primaryBp?.id : coBp?.id) || coBp?.id || primaryBp?.id,
      waypoint_type: stop.type,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
      stop_order: stop.stopIndex,
    }));

    await supabase.from('booking_waypoints').insert(newWaypoints);

    // 7. Update booking: passenger_count = 2, total pooled fare
    const updatedCount = booking.passenger_count + 1;
    const combinedFare = booking.final_fare + passengerFare;

    const { data: updatedBooking, error: updateErr } = await supabase
      .from('bookings')
      .update({
        passenger_count: updatedCount,
        final_fare: combinedFare,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
      .select()
      .maybeSingle();

    if (updateErr) {
      throw new BadRequestError(updateErr.message);
    }

    return {
      booking: updatedBooking,
      otp: rawOtp,
      passengerFare,
    };
  }

  /**
   * Driver accepts a booking.
   */
  static async acceptBooking(bookingId, driverId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    // 1. Fetch booking to verify existence and check current state
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      throw new NotFoundError('This ride request is no longer available (it may have been cancelled or expired).');
    }

    if (booking.status === 'cancelled') {
      throw new ConflictError('This ride was cancelled by the passenger.');
    }

    // Idempotent acceptance: if already assigned to this driver, return it smoothly!
    if (booking.status === 'accepted' || booking.status === 'in_progress') {
      if (booking.driver_id === driverId) {
        const { data: currentTrip } = await supabase
          .from('bookings')
          .select(`
            *,
            driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
            passengers:booking_passengers(*, profile:profiles(name, phone)),
            waypoints:booking_waypoints(*)
          `)
          .eq('id', bookingId)
          .maybeSingle();
        return currentTrip || booking;
      }
      throw new ConflictError('This ride has already been accepted by another driver.');
    }

    // Ensure driver profile exists in profiles table and load gender
    let { data: driverProf } = await supabase
      .from('profiles')
      .select('id, name, phone, gender, vehicle_number, vehicle_type, current_lat, current_lng')
      .eq('id', driverId)
      .maybeSingle();

    if (!driverProf) {
      const demoToken = Object.keys(DEMO_USERS).find((k) => DEMO_USERS[k].id === driverId);
      const demoUser = demoToken ? DEMO_USERS[demoToken] : null;

      const newDriverRecord = {
        id: driverId,
        role: 'driver',
        name: demoUser?.name || 'Verified Driver',
        gender: demoUser?.gender || null,
        vehicle_type: demoUser?.vehicle_type || 'cab',
        vehicle_number: demoUser?.vehicle_number || 'MH-12-AB-1234',
        is_available: false,
      };

      const { data: insertedDriver } = await supabase
        .from('profiles')
        .insert(newDriverRecord)
        .select()
        .maybeSingle();
      driverProf = insertedDriver || newDriverRecord;
    } else if (!driverProf.gender) {
      const demoToken = Object.keys(DEMO_USERS).find((k) => DEMO_USERS[k].id === driverId);
      if (demoToken && DEMO_USERS[demoToken].gender) {
        driverProf.gender = DEMO_USERS[demoToken].gender;
        await supabase
          .from('profiles')
          .update({ gender: driverProf.gender })
          .eq('id', driverId);
      }
    }

    // Server-side revalidation of female driver eligibility for women safety rides
    if (booking.female_driver_preferred) {
      const driverGender = driverProf?.gender ? driverProf.gender.toLowerCase() : null;
      if (driverGender !== 'female') {
        throw new ForbiddenError(
          'Under GoShare women safety guidelines, this ride is exclusively assigned to verified female driver partners.'
        );
      }
    }

    // Check if this driver already has an active shared ride with capacity available
    const { data: driverActiveTrips } = await supabase
      .from('bookings')
      .select(`
        *,
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
        passengers:booking_passengers(*, profile:profiles(name, phone, gender)),
        waypoints:booking_waypoints(*)
      `)
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'in_progress'])
      .order('created_at', { ascending: true });

    const activeSharedTrip = (driverActiveTrips || []).find(
      (t) => t.ride_type === 'shared' && (t.passenger_count || 1) < (t.max_passengers || 2)
    );

    // ============================================================
    // POOL CAB MERGE: 2nd passenger joins driver's active shared pool
    // ============================================================
    if (activeSharedTrip && booking.ride_type === 'shared') {
      // 1. Fetch names and details for both riders
      const { data: r1Prof } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', activeSharedTrip.created_by)
        .maybeSingle();
      const r1Name =
        r1Prof?.name ||
        activeSharedTrip.passengers?.[0]?.profile?.name ||
        'Rider 1';

      const { data: r2Prof } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', booking.created_by)
        .maybeSingle();
      const r2Name = r2Prof?.name || 'Rider 2';

      // 2. Compute 4 optimized waypoints
      const driverPos =
        driverProf?.current_lat && driverProf?.current_lng
          ? { lat: driverProf.current_lat, lng: driverProf.current_lng }
          : { lat: activeSharedTrip.pickup_lat, lng: activeSharedTrip.pickup_lng };

      const riderSegments = [
        {
          id: activeSharedTrip.created_by,
          name: r1Name,
          pickup: {
            lat: activeSharedTrip.pickup_lat,
            lng: activeSharedTrip.pickup_lng,
            label: activeSharedTrip.pickup_label,
          },
          dropoff: {
            lat: activeSharedTrip.destination_lat,
            lng: activeSharedTrip.destination_lng,
            label: activeSharedTrip.destination_label,
          },
        },
        {
          id: booking.created_by,
          name: r2Name,
          pickup: {
            lat: booking.pickup_lat,
            lng: booking.pickup_lng,
            label: booking.pickup_label,
          },
          dropoff: {
            lat: booking.destination_lat,
            lng: booking.destination_lng,
            label: booking.destination_label,
          },
        },
      ];

      const optimizedStops = buildOptimizedWaypoints(driverPos, riderSegments);

      // 3. Mark Rider 2's booking as accepted by this driver
      await supabase
        .from('bookings')
        .update({
          status: activeSharedTrip.status,
          driver_id: driverId,
          accepted_at: new Date().toISOString(),
          passenger_count: 2,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      // Cancel other pending requests from Rider 2
      if (booking.created_by) {
        await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: booking.created_by,
            updated_at: new Date().toISOString(),
          })
          .eq('created_by', booking.created_by)
          .eq('status', 'pending')
          .neq('id', bookingId);
      }

      // 4. Associate both riders in booking_passengers for both bookings
      // Ensure rider 1 exists in activeSharedTrip's booking_passengers
      let { data: bp1Active } = await supabase
        .from('booking_passengers')
        .select('id, user_id')
        .eq('booking_id', activeSharedTrip.id)
        .eq('user_id', activeSharedTrip.created_by)
        .maybeSingle();

      if (!bp1Active) {
        const { data: ins1 } = await supabase
          .from('booking_passengers')
          .insert({
            booking_id: activeSharedTrip.id,
            user_id: activeSharedTrip.created_by,
            fare_amount: activeSharedTrip.final_fare,
            pickup_lat: activeSharedTrip.pickup_lat,
            pickup_lng: activeSharedTrip.pickup_lng,
            pickup_label: activeSharedTrip.pickup_label,
            destination_lat: activeSharedTrip.destination_lat,
            destination_lng: activeSharedTrip.destination_lng,
            destination_label: activeSharedTrip.destination_label,
            passenger_order: 1,
          })
          .select('id, user_id')
          .maybeSingle();
        bp1Active = ins1;
      }

      // Ensure rider 2 exists in activeSharedTrip's booking_passengers
      let { data: bp2Active } = await supabase
        .from('booking_passengers')
        .select('id, user_id')
        .eq('booking_id', activeSharedTrip.id)
        .eq('user_id', booking.created_by)
        .maybeSingle();

      if (!bp2Active) {
        const { data: ins2 } = await supabase
          .from('booking_passengers')
          .insert({
            booking_id: activeSharedTrip.id,
            user_id: booking.created_by,
            fare_amount: booking.final_fare,
            pickup_lat: booking.pickup_lat,
            pickup_lng: booking.pickup_lng,
            pickup_label: booking.pickup_label,
            destination_lat: booking.destination_lat,
            destination_lng: booking.destination_lng,
            destination_label: booking.destination_label,
            passenger_order: 2,
          })
          .select('id, user_id')
          .maybeSingle();
        bp2Active = ins2;
      }

      // Ensure rider 2 exists in booking.id's booking_passengers
      let { data: bp2Second } = await supabase
        .from('booking_passengers')
        .select('id, user_id')
        .eq('booking_id', booking.id)
        .eq('user_id', booking.created_by)
        .maybeSingle();

      if (!bp2Second) {
        const { data: ins2Sec } = await supabase
          .from('booking_passengers')
          .insert({
            booking_id: booking.id,
            user_id: booking.created_by,
            fare_amount: booking.final_fare,
            pickup_lat: booking.pickup_lat,
            pickup_lng: booking.pickup_lng,
            pickup_label: booking.pickup_label,
            destination_lat: booking.destination_lat,
            destination_lng: booking.destination_lng,
            destination_label: booking.destination_label,
            passenger_order: 1,
          })
          .select('id, user_id')
          .maybeSingle();
        bp2Second = ins2Sec;
      }

      // Ensure rider 1 exists in booking.id's booking_passengers
      let { data: bp1Second } = await supabase
        .from('booking_passengers')
        .select('id, user_id')
        .eq('booking_id', booking.id)
        .eq('user_id', activeSharedTrip.created_by)
        .maybeSingle();

      if (!bp1Second) {
        const { data: ins1Sec } = await supabase
          .from('booking_passengers')
          .insert({
            booking_id: booking.id,
            user_id: activeSharedTrip.created_by,
            fare_amount: activeSharedTrip.final_fare,
            pickup_lat: activeSharedTrip.pickup_lat,
            pickup_lng: activeSharedTrip.pickup_lng,
            pickup_label: activeSharedTrip.pickup_label,
            destination_lat: activeSharedTrip.destination_lat,
            destination_lng: activeSharedTrip.destination_lng,
            destination_label: activeSharedTrip.destination_label,
            passenger_order: 2,
          })
          .select('id, user_id')
          .maybeSingle();
        bp1Second = ins1Sec;
      }

      // 5. Replace waypoints for both bookings with the 4 optimized stops
      await supabase
        .from('booking_waypoints')
        .delete()
        .in('booking_id', [activeSharedTrip.id, booking.id]);

      const wpsForActive = optimizedStops.map((stop) => {
        const isRider1 = stop.passengerId === activeSharedTrip.created_by;
        const targetPassengerId = (isRider1 ? bp1Active?.id : bp2Active?.id) || bp1Active?.id || bp2Active?.id;
        return {
          booking_id: activeSharedTrip.id,
          passenger_id: targetPassengerId,
          waypoint_type: stop.type,
          lat: stop.lat,
          lng: stop.lng,
          label: `${stop.type.toUpperCase()}: ${stop.passengerName} (${stop.label})`,
          stop_order: stop.stopIndex,
        };
      });
      const { error: errActiveWp } = await supabase.from('booking_waypoints').insert(wpsForActive);
      if (errActiveWp) console.error('Error inserting wpsForActive:', errActiveWp);

      const wpsForSecond = optimizedStops.map((stop) => {
        const isRider2 = stop.passengerId === booking.created_by;
        const targetPassengerId = (isRider2 ? bp2Second?.id : bp1Second?.id) || bp2Second?.id || bp1Second?.id;
        return {
          booking_id: booking.id,
          passenger_id: targetPassengerId,
          waypoint_type: stop.type,
          lat: stop.lat,
          lng: stop.lng,
          label: `${stop.type.toUpperCase()}: ${stop.passengerName} (${stop.label})`,
          stop_order: stop.stopIndex,
        };
      });
      const { error: errSecondWp } = await supabase.from('booking_waypoints').insert(wpsForSecond);
      if (errSecondWp) console.error('Error inserting wpsForSecond:', errSecondWp);

      // 6. Update combined fare and passenger count on activeSharedTrip
      const totalPooledFare = (activeSharedTrip.final_fare || 0) + (booking.final_fare || 0);
      await supabase
        .from('bookings')
        .update({
          passenger_count: 2,
          final_fare: totalPooledFare,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeSharedTrip.id);

      // 7. Mark driver unavailable now that pool is at full capacity (2/2)
      await supabase.from('profiles').update({ is_available: false }).eq('id', driverId);

      // 8. Fetch enriched updated trip
      const { data: enrichedSharedTrip } = await supabase
        .from('bookings')
        .select(`
          *,
          driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
          passengers:booking_passengers(*, profile:profiles(name, phone)),
          waypoints:booking_waypoints(*)
        `)
        .eq('id', activeSharedTrip.id)
        .maybeSingle();

      if (enrichedSharedTrip) {
        if (!enrichedSharedTrip.driver && driverProf) {
          enrichedSharedTrip.driver = driverProf;
        }
        if (enrichedSharedTrip.waypoints && Array.isArray(enrichedSharedTrip.waypoints)) {
          enrichedSharedTrip.waypoints = enrichedSharedTrip.waypoints.map((wp) => ({
            ...wp,
            stop_index: wp.stop_order ?? wp.stop_index ?? 1,
            stop_order: wp.stop_order ?? wp.stop_index ?? 1,
          })).sort((a, b) => a.stop_order - b.stop_order);
        }
        enrichedSharedTrip.otp = recoverOtpFromHash(enrichedSharedTrip.otp_hash) || '4291';
        return enrichedSharedTrip;
      }
    }

    // ============================================================
    // Standard Acceptance: 1st booking accepted by driver
    // ============================================================
    const updatePayload = {
      status: 'accepted',
      driver_id: driverId,
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRows, error: updateErr } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .eq('status', 'pending')
      .select();

    if (updateErr) {
      console.error('acceptBooking update error:', updateErr);
      throw new ConflictError(updateErr.message || 'Unable to accept this ride. Please try again.');
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Re-fetch to check if already accepted by this driver
      const { data: checkAgain } = await supabase
        .from('bookings')
        .select('driver_id')
        .eq('id', bookingId)
        .maybeSingle();

      if (checkAgain?.driver_id !== driverId) {
        throw new ConflictError('This ride has already been accepted by another driver.');
      }
    }

    // Cancel any other lingering pending bookings by this passenger so duplicate requests don't persist
    if (booking.created_by) {
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: booking.created_by,
          updated_at: new Date().toISOString(),
        })
        .eq('created_by', booking.created_by)
        .eq('status', 'pending')
        .neq('id', bookingId);
    }

    // 3. Fetch the updated booking with driver particulars
    const { data: enrichedTrip } = await supabase
      .from('bookings')
      .select(`
        *,
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
        passengers:booking_passengers(*, profile:profiles(name, phone)),
        waypoints:booking_waypoints(*)
      `)
      .eq('id', bookingId)
      .maybeSingle();

    let updated = enrichedTrip;
    if (!updated) {
      const { data: simpleTrip } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();
      updated = simpleTrip;
    }

    if (updated) {
      if (!updated.driver && driverProf) {
        updated.driver = driverProf;
      }
      updated.otp = recoverOtpFromHash(updated.otp_hash) || '4291';
    }

    // For solo rides, driver is full immediately.
    // For shared rides, driver can still accept a 2nd co-rider if passenger_count < max_passengers.
    const isFull = booking.ride_type !== 'shared' || (booking.passenger_count || 1) >= (booking.max_passengers || 2);
    if (isFull) {
      await supabase.from('profiles').update({ is_available: false }).eq('id', driverId);
    }

    return updated;
  }

  /**
   * Verifies passenger OTP and transitions ride to 'in_progress'.
   */
  static async verifyOtpAndStart(bookingId, inputOtp, driverId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    // Fetch all active bookings for this driver
    const { data: driverBookings } = await supabase
      .from('bookings')
      .select('id, otp_hash, status, created_by')
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'in_progress']);

    if (!driverBookings || driverBookings.length === 0) {
      throw new NotFoundError('No active booking found for this driver');
    }

    const currentBooking = driverBookings.find((b) => b.id === bookingId) || driverBookings[0];

    // Check OTP against currentBooking and all other driver active bookings
    let isValid = false;
    for (const b of driverBookings) {
      if (b.otp_hash && verifyOtp(inputOtp, b.otp_hash)) {
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      // Check secondary passengers in booking_passengers
      const { data: passengers } = await supabase
        .from('booking_passengers')
        .select('otp_hash')
        .in('booking_id', driverBookings.map((b) => b.id));

      for (const p of passengers || []) {
        if (p.otp_hash && verifyOtp(inputOtp, p.otp_hash)) {
          isValid = true;
          break;
        }
      }
    }

    if (!isValid) {
      throw new BadRequestError('Invalid ride verification PIN/OTP');
    }

    // Update ALL active bookings for this driver to 'in_progress'
    const bookingIdsToStart = driverBookings.map((b) => b.id);
    const { data: started, error: startErr } = await supabase
      .from('bookings')
      .update({
        status: 'in_progress',
        otp_verified: true,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', bookingIdsToStart)
      .select();

    if (startErr) throw new BadRequestError(startErr.message);

    return started && started.length > 0 ? started[0] : currentBooking;
  }

  /**
   * Driver marks a waypoint as completed (pickup / dropoff).
   */
  static async completeWaypoint(bookingId, waypointId, driverId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    const { data: booking } = await supabase
      .from('bookings')
      .select('driver_id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking || booking.driver_id !== driverId) {
      throw new ForbiddenError('Not authorized for this booking');
    }

    // Mark waypoint complete
    const { data: waypoint, error: wpErr } = await supabase
      .from('booking_waypoints')
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq('id', waypointId)
      .select()
      .maybeSingle();

    if (waypoint) {
      waypoint.stop_index = waypoint.stop_order ?? waypoint.stop_index;
    }

    // Sync across pooled bookings if any
    const { data: pooledBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'in_progress']);

    if (waypoint && pooledBookings && pooledBookings.length > 1) {
      const otherBookingIds = pooledBookings.map((b) => b.id).filter((id) => id !== bookingId);
      const orderVal = waypoint.stop_order ?? waypoint.stop_index;
      if (otherBookingIds.length > 0 && orderVal != null) {
        await supabase
          .from('booking_waypoints')
          .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
          })
          .in('booking_id', otherBookingIds)
          .eq('stop_order', orderVal);
      }
    }

    // Check if all waypoints are now completed for this booking
    const { data: remaining } = await supabase
      .from('booking_waypoints')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('is_completed', false);

    let isFullyCompleted = false;
    if (!remaining || remaining.length === 0) {
      await this.completeBooking(bookingId, driverId);
      isFullyCompleted = true;
    }

    return { waypoint, isFullyCompleted };
  }

  /**
   * Completes a booking, sets driver available.
   */
  static async completeBooking(bookingId, driverId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    // Complete all active bookings for this driver (handles single or pooled rides)
    const { data: completed, error: compErr } = await supabase
      .from('bookings')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'in_progress'])
      .select();

    if (compErr) throw new BadRequestError(compErr.message);

    // Free driver
    await supabase.from('profiles').update({ is_available: true }).eq('id', driverId);

    return completed && completed.length > 0 ? completed[0] : null;
  }

  /**
   * Cancels a booking with authorization check.
   */
  static async cancelBooking(bookingId, userId, reason = 'Cancelled by user') {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      return { id: bookingId, status: 'cancelled' };
    }

    // Idempotent: already cancelled bookings return cleanly without error
    if (booking.status === 'cancelled') {
      return booking;
    }

    let updatePayload = {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (userId) {
      // Validate that userId exists in profiles table to prevent foreign key errors
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (userProfile) {
        updatePayload.cancelled_by = userId;
      }
    }

    let { data: cancelled, error: cancelErr } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .select()
      .maybeSingle();

    if (cancelErr) {
      console.warn('cancelBooking update notice:', cancelErr.message);
      // Fallback update without optional columns
      const retry = await supabase
        .from('bookings')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', bookingId)
        .select()
        .maybeSingle();
      cancelled = retry.data;
    }

    // Free driver if assigned
    if (booking.driver_id) {
      await supabase.from('profiles').update({ is_available: true }).eq('id', booking.driver_id);
    }

    return cancelled || { ...booking, status: 'cancelled' };
  }

  /**
   * Auto-assigns a driver to a pending booking (for demonstration / quick testing).
   */
  static async autoAssignDriver(bookingId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('Database client not initialized');

    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchErr || !booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'pending') {
      return booking;
    }

    // Determine target gender if female driver preferred for women safety
    let targetGender = null;
    if (booking.female_driver_preferred) {
      targetGender = 'female';
    }

    // Query eligible drivers from the database
    let driverQuery = supabase
      .from('profiles')
      .select('*')
      .eq('role', 'driver')
      .neq('id', booking.created_by);

    if (targetGender) {
      driverQuery = driverQuery.eq('gender', targetGender);
    }

    // Prefer online/available driver
    const { data: availableDrivers } = await driverQuery
      .eq('is_available', true)
      .limit(1);

    let driver = availableDrivers && availableDrivers.length > 0 ? availableDrivers[0] : null;

    if (!driver) {
      // Check if any registered eligible driver exists
      let anyDriverQuery = supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver')
        .neq('id', booking.created_by);

      if (targetGender) {
        anyDriverQuery = anyDriverQuery.eq('gender', targetGender);
      }

      const { data: anyDrivers } = await anyDriverQuery.limit(1);
      driver = anyDrivers && anyDrivers.length > 0 ? anyDrivers[0] : null;
    }

    if (!driver) {
      if (targetGender) {
        throw new NotFoundError(
          `No verified ${targetGender} driver partners are currently available nearby. Please wait a moment and retry, or choose another ride option.`
        );
      }
      throw new NotFoundError(
        'No verified driver partners are currently available nearby. Please try again shortly.'
      );
    }

    // Driver position slightly offset from pickup (approx 800m away, driving towards pickup)
    const driverLat = (booking.pickup_lat || 19.9912) + 0.0075;
    const driverLng = (booking.pickup_lng || 73.8090) - 0.0055;

    if (driver) {
      await supabase
        .from('profiles')
        .update({
          is_available: false,
          current_lat: driverLat,
          current_lng: driverLng,
          vehicle_type: booking.vehicle_category,
          vehicle_number: driver.vehicle_number || 'MH-15-DX-4412',
          location_updated_at: new Date().toISOString(),
        })
        .eq('id', driver.id);
    }

    const driverId = driver ? driver.id : null;

    // Transition booking to 'accepted'
    await supabase
      .from('bookings')
      .update({
        status: 'accepted',
        driver_id: driverId,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    const { data: updated } = await supabase
      .from('bookings')
      .select(`
        *,
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
        passengers:booking_passengers(*, profile:profiles(name, phone)),
        waypoints:booking_waypoints(*)
      `)
      .eq('id', bookingId)
      .maybeSingle();

    let finalTrip = updated;
    if (!finalTrip) {
      const { data: simpleTrip } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();
      finalTrip = simpleTrip || booking;
    }

    if (finalTrip) {
      if (!finalTrip.driver && driver) {
        finalTrip.driver = driver;
      }
      if (finalTrip.waypoints && Array.isArray(finalTrip.waypoints)) {
        finalTrip.waypoints = finalTrip.waypoints.map((wp) => ({
          ...wp,
          stop_index: wp.stop_order ?? wp.stop_index ?? 1,
          stop_order: wp.stop_order ?? wp.stop_index ?? 1,
        })).sort((a, b) => a.stop_order - b.stop_order);
      }
      finalTrip.otp = recoverOtpFromHash(finalTrip.otp_hash) || '4291';
    }

    return finalTrip;
  }

  /**
   * Gets the active booking for a passenger.
   */
  static async getActivePassengerBooking(userId) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    // Helper to enrich booking with driver details and OTP
    const enrichBooking = async (b) => {
      if (!b) return null;
      if (b.driver_id && !b.driver) {
        const { data: dProf } = await supabase
          .from('profiles')
          .select('name, phone, vehicle_number, vehicle_type, current_lat, current_lng')
          .eq('id', b.driver_id)
          .maybeSingle();
        if (dProf) b.driver = dProf;
      }
      if (b.waypoints && Array.isArray(b.waypoints)) {
        b.waypoints = b.waypoints.map((wp) => ({
          ...wp,
          stop_index: wp.stop_order ?? wp.stop_index ?? 1,
          stop_order: wp.stop_order ?? wp.stop_index ?? 1,
        })).sort((a, b) => a.stop_order - b.stop_order);
      }
      b.otp = recoverOtpFromHash(b.otp_hash) || '4291';
      return b;
    };

    // 1. Priority One: Active running or accepted trip as creator
    const { data: activeAsCreator } = await supabase
      .from('bookings')
      .select(`
        *,
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
        passengers:booking_passengers(*, profile:profiles(name, phone)),
        waypoints:booking_waypoints(*)
      `)
      .eq('created_by', userId)
      .in('status', ['in_progress', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeAsCreator) {
      return await enrichBooking(activeAsCreator);
    }

    // 2. Priority Two: Active running or accepted trip as co-passenger
    const { data: activeAsPassenger } = await supabase
      .from('booking_passengers')
      .select(`
        booking_id,
        booking:bookings(
          *,
          driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
          passengers:booking_passengers(*, profile:profiles(name, phone)),
          waypoints:booking_waypoints(*)
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      activeAsPassenger?.booking &&
      ['in_progress', 'accepted'].includes(activeAsPassenger.booking.status)
    ) {
      return await enrichBooking(activeAsPassenger.booking);
    }

    // 3. Priority Three: Pending booking as creator
    const { data: pendingAsCreator } = await supabase
      .from('bookings')
      .select(`
        *,
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type, current_lat, current_lng),
        passengers:booking_passengers(*, profile:profiles(name, phone)),
        waypoints:booking_waypoints(*)
      `)
      .eq('created_by', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingAsCreator) {
      return await enrichBooking(pendingAsCreator);
    }

    // 4. Priority Four: Pending booking as co-passenger
    if (activeAsPassenger?.booking && activeAsPassenger.booking.status === 'pending') {
      return await enrichBooking(activeAsPassenger.booking);
    }

    return null;
  }

  /**
   * Gets the active booking for a passenger or driver.
   */
  static async getActiveBooking(userId, role) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    if (role === 'driver') {
      const { data: driverTrips } = await supabase
        .from('bookings')
        .select(`
          *,
          passengers:booking_passengers(*, profile:profiles(name, phone)),
          waypoints:booking_waypoints(*),
          creator:profiles!bookings_created_by_fkey(name, phone)
        `)
        .eq('driver_id', userId)
        .in('status', ['accepted', 'in_progress'])
        .order('created_at', { ascending: true });

      if (!driverTrips || driverTrips.length === 0) return null;

      const primaryTrip = driverTrips[0];

      // Normalize and sort waypoints for primaryTrip
      if (primaryTrip.waypoints && Array.isArray(primaryTrip.waypoints)) {
        primaryTrip.waypoints = primaryTrip.waypoints.map((wp) => ({
          ...wp,
          stop_index: wp.stop_order ?? wp.stop_index ?? 1,
          stop_order: wp.stop_order ?? wp.stop_index ?? 1,
        })).sort((a, b) => a.stop_order - b.stop_order);
      }

      // If driver has multiple active pooled bookings, consolidate them
      if (driverTrips.length > 1) {
        const seenPassengerIds = new Set(
          (primaryTrip.passengers || []).map((p) => p.user_id)
        );
        const allPassengers = [...(primaryTrip.passengers || [])];

        for (let i = 1; i < driverTrips.length; i++) {
          const secondTrip = driverTrips[i];
          if (secondTrip.creator && !seenPassengerIds.has(secondTrip.created_by)) {
            seenPassengerIds.add(secondTrip.created_by);
            allPassengers.push({
              id: `copassenger-${secondTrip.created_by}`,
              user_id: secondTrip.created_by,
              fare_amount: secondTrip.final_fare,
              pickup_label: secondTrip.pickup_label,
              destination_label: secondTrip.destination_label,
              passenger_order: 2,
              profile: secondTrip.creator,
            });
          }
        }
        primaryTrip.passengers = allPassengers;
        primaryTrip.passenger_count = Math.max(
          primaryTrip.passenger_count || 1,
          allPassengers.length
        );

        const totalFare = driverTrips.reduce((sum, t) => sum + (t.final_fare || 0), 0);
        if ((primaryTrip.final_fare || 0) < totalFare) {
          primaryTrip.final_fare = totalFare;
        }

        primaryTrip.pooled_booking_ids = driverTrips.map((t) => t.id);
      }

      return primaryTrip;
    }

    return this.getActivePassengerBooking(userId);
  }

  /**
   * Gets ride history for a user.
   */
  static async getRideHistory(userId, role, limit = 20, offset = 0) {
    const supabase = getSupabaseAdmin();
    if (!supabase) return { rides: [], total: 0 };

    let query = supabase.from('bookings').select(
      `
        *,
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number, vehicle_type),
        creator:profiles!bookings_created_by_fkey(name, phone),
        rating:ratings(rating, comment)
      `,
      { count: 'exact' }
    );

    if (role === 'driver') {
      query = query.eq('driver_id', userId);
    } else {
      query = query.eq('created_by', userId);
    }

    const { data: rides, count, error } = await query
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Error fetching ride history:', error);
      return { rides: [], total: 0 };
    }

    return { rides: rides || [], total: count || 0 };
  }
}
