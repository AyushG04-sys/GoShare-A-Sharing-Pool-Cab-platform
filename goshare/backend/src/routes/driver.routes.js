import { Router } from 'express';
import Joi from 'joi';
import { getSupabaseAdmin } from '../config/supabase.js';
import { BookingService } from '../services/booking.service.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

const router = Router();

// Apply auth and driver role requirement to all driver routes
router.use(authenticate);
router.use(requireRole(['driver', 'admin']));

const locationSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

const statusSchema = Joi.object({
  is_available: Joi.boolean().required(),
});

const verifyOtpSchema = Joi.object({
  otp: Joi.string().length(4).required(),
});

/**
 * Route: GET /api/driver/active
 * Gets the driver's currently active ride.
 */
router.get('/active', async (req, res, next) => {
  try {
    const booking = await BookingService.getActiveBooking(req.user.id, 'driver');
    res.json({
      success: true,
      data: { booking },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/driver/requests
 * Lists pending rides matching driver's vehicle type.
 */
router.get('/requests', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ success: true, data: { requests: [] } });
    }

    const driverVehicle = req.profile.vehicle_type || null;

    // Show recent pending bookings (last 2 hours to ensure user requests never disappear)
    const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('bookings')
      .select(`
        *,
        creator:profiles!bookings_created_by_fkey(name, phone, gender),
        passengers:booking_passengers(*, profile:profiles(name, phone, gender))
      `)
      .eq('status', 'pending')
      .gte('created_at', staleCutoff)
      .order('created_at', { ascending: false })
      .limit(30);

    const { data: allRequests, error } = await query;

    if (error) {
      console.error('GET /requests query error:', error);
      throw new BadRequestError(error.message);
    }

    const driverGender = req.profile?.gender ? req.profile.gender.toLowerCase() : null;
    const isDriverGenderValid = driverGender === 'female' || driverGender === 'male';

    // Request queue visibility:
    // - If female driver preferred (women safety): visible ONLY to verified female drivers
    // - Ordinary unrestricted rides: visible to all driver partners
    let eligibleRequests = (allRequests || []).filter((r) => {
      if (r.female_driver_preferred) {
        if (driverGender !== 'female') {
          return false;
        }
      }
      return true;
    });

    // Sort requests: prioritize shared cab requests and matching vehicle type
    eligibleRequests.sort((a, b) => {
      const aShared = a.ride_type === 'shared' ? 1 : 0;
      const bShared = b.ride_type === 'shared' ? 1 : 0;
      if (aShared !== bShared) return bShared - aShared;

      if (driverVehicle) {
        const aMatch = a.vehicle_category === driverVehicle ? 1 : 0;
        const bMatch = b.vehicle_category === driverVehicle ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    // Deduplicate: only return the newest pending request per passenger
    const seenPassengers = new Set();
    const uniqueRequests = [];
    for (const reqItem of eligibleRequests) {
      if (!seenPassengers.has(reqItem.created_by)) {
        seenPassengers.add(reqItem.created_by);
        uniqueRequests.push(reqItem);
      }
    }

    res.json({
      success: true,
      data: {
        requests: uniqueRequests,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/status
 * Toggle online availability.
 */
router.post('/status', validate(statusSchema), async (req, res, next) => {
  try {
    const { is_available } = req.body;
    const supabase = getSupabaseAdmin();

    if (supabase) {
      const { error } = await supabase
        .from('profiles')
        .update({ is_available, updated_at: new Date().toISOString() })
        .eq('id', req.user.id);

      if (error) throw new BadRequestError(error.message);
    }

    req.profile.is_available = is_available;

    res.json({
      success: true,
      message: `Driver status updated to ${is_available ? 'Online' : 'Offline'}`,
      data: { is_available },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/location
 * Updates driver GPS coordinates.
 */
router.post('/location', validate(locationSchema), async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const supabase = getSupabaseAdmin();

    if (supabase) {
      await supabase
        .from('profiles')
        .update({
          current_lat: lat,
          current_lng: lng,
          location_updated_at: new Date().toISOString(),
        })
        .eq('id', req.user.id);
    }

    req.profile.current_lat = lat;
    req.profile.current_lng = lng;

    res.json({
      success: true,
      data: { lat, lng },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/bookings/:id/accept
 * Driver accepts a ride request.
 */
router.post('/bookings/:id/accept', async (req, res, next) => {
  try {
    const booking = await BookingService.acceptBooking(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Booking accepted',
      data: { booking },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/bookings/:id/reject
 * Driver declines / rejects a ride request.
 */
router.post('/bookings/:id/reject', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id, status, driver_id')
        .eq('id', req.params.id)
        .maybeSingle();

      if (booking && booking.driver_id === req.user.id) {
        // If assigned to this driver and they drop it, unassign them and return to pending pool
        await supabase
          .from('bookings')
          .update({
            status: 'pending',
            driver_id: null,
            accepted_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', req.params.id);
      }

      // Re-affirm driver availability
      await supabase
        .from('profiles')
        .update({ is_available: true, updated_at: new Date().toISOString() })
        .eq('id', req.user.id);
    }

    res.json({
      success: true,
      message: 'Booking request declined',
      data: { bookingId: req.params.id },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/bookings/:id/verify-otp
 * Verifies rider's 4-digit PIN and starts the ride.
 */
router.post('/bookings/:id/verify-otp', validate(verifyOtpSchema), async (req, res, next) => {
  try {
    const booking = await BookingService.verifyOtpAndStart(
      req.params.id,
      req.body.otp,
      req.user.id
    );

    res.json({
      success: true,
      message: 'OTP verified. Ride started successfully!',
      data: { booking },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/bookings/:id/waypoints/:waypointId
 * Completes a specific waypoint (pickup or dropoff).
 */
router.post('/bookings/:id/waypoints/:waypointId', async (req, res, next) => {
  try {
    const result = await BookingService.completeWaypoint(
      req.params.id,
      req.params.waypointId,
      req.user.id
    );

    res.json({
      success: true,
      message: result.isFullyCompleted
        ? 'Final waypoint completed. Ride finished!'
        : 'Waypoint completed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/driver/bookings/:id/complete
 * Explicitly completes the ride.
 */
router.post('/bookings/:id/complete', async (req, res, next) => {
  try {
    const booking = await BookingService.completeBooking(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Ride marked as completed',
      data: { booking },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/driver/earnings
 * Aggregates driver completed rides, earnings, and ratings.
 */
router.get('/earnings', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({
        success: true,
        data: { totalEarnings: 1250, completedTrips: 5, avgRating: 4.8 },
      });
    }

    const { data: rides, error } = await supabase
      .from('bookings')
      .select('final_fare, created_at, status')
      .eq('driver_id', req.user.id)
      .eq('status', 'completed');

    if (error) throw new BadRequestError(error.message);

    const completedTrips = rides?.length || 0;
    const totalEarnings = (rides || []).reduce((sum, r) => sum + (r.final_fare || 0), 0);

    // Calculate average rating
    const { data: ratings } = await supabase
      .from('ratings')
      .select('rating')
      .eq('driver_id', req.user.id);

    const totalRatings = ratings?.length || 0;
    const avgRating =
      totalRatings > 0
        ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings) * 10) / 10
        : 5.0;

    res.json({
      success: true,
      data: {
        totalEarnings,
        completedTrips,
        avgRating,
        totalReviews: totalRatings,
        currency: 'INR',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
