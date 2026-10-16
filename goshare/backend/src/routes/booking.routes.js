import { Router } from 'express';
import Joi from 'joi';
import { BookingService } from '../services/booking.service.js';
import { calculateFare, estimateAllVehicles } from '../services/fare.service.js';
import { findSharedRideMatches } from '../services/matching.service.js';
import { calculateHaversineDistance, estimateDurationMinutes } from '../utils/geo.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();

// Validation schemas
const estimateSchema = Joi.object({
  pickup_lat: Joi.number().min(-90).max(90).required(),
  pickup_lng: Joi.number().min(-180).max(180).required(),
  destination_lat: Joi.number().min(-90).max(90).required(),
  destination_lng: Joi.number().min(-180).max(180).required(),
});

const createBookingSchema = Joi.object({
  ride_type: Joi.string().valid('solo', 'shared').default('solo'),
  vehicle_category: Joi.string().valid('rickshaw', 'mini', 'cab', 'suv').required(),
  pickup_lat: Joi.number().min(-90).max(90).required(),
  pickup_lng: Joi.number().min(-180).max(180).required(),
  pickup_label: Joi.string().max(255).default('Pickup Location'),
  destination_lat: Joi.number().min(-90).max(90).required(),
  destination_lng: Joi.number().min(-180).max(180).required(),
  destination_label: Joi.string().max(255).default('Destination Location'),
  female_driver_preferred: Joi.boolean().default(false),
  payment_method: Joi.string().valid('cash', 'upi').default('cash'),
});

const matchCandidatesSchema = Joi.object({
  vehicle_category: Joi.string().valid('rickshaw', 'mini', 'cab', 'suv').required(),
  pickup_lat: Joi.number().min(-90).max(90).required(),
  pickup_lng: Joi.number().min(-180).max(180).required(),
  destination_lat: Joi.number().min(-90).max(90).required(),
  destination_lng: Joi.number().min(-180).max(180).required(),
  female_driver_preferred: Joi.boolean().default(false),
});

const joinSharedSchema = Joi.object({
  pickup_lat: Joi.number().min(-90).max(90).required(),
  pickup_lng: Joi.number().min(-180).max(180).required(),
  pickup_label: Joi.string().max(255).default('Pickup 2'),
  destination_lat: Joi.number().min(-90).max(90).required(),
  destination_lng: Joi.number().min(-180).max(180).required(),
  destination_label: Joi.string().max(255).default('Destination 2'),
});

/**
 * Route: POST /api/bookings/estimate
 * Public / Authenticated calculation of route distance, duration, and fares for all vehicles.
 */
router.post('/estimate', validate(estimateSchema), (req, res) => {
  const { pickup_lat, pickup_lng, destination_lat, destination_lng } = req.body;

  const distanceKm = calculateHaversineDistance(
    pickup_lat,
    pickup_lng,
    destination_lat,
    destination_lng
  );

  const durationMin = estimateDurationMinutes(distanceKm);
  const estimates = estimateAllVehicles(distanceKm);

  res.json({
    success: true,
    data: {
      distanceKm,
      durationMin,
      estimates,
    },
  });
});

/**
 * Route: POST /api/bookings/match-candidates
 * Finds available shared ride pools within proximity before booking.
 */
router.post(
  '/match-candidates',
  authenticate,
  validate(matchCandidatesSchema),
  async (req, res, next) => {
    try {
      const candidates = await findSharedRideMatches({
        ...req.body,
        userId: req.user.id,
        userGender: req.profile?.gender || null,
      });

      res.json({
        success: true,
        data: {
          candidates,
          count: candidates.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Route: POST /api/bookings
 * Creates a new ride booking (solo or initial shared ride).
 */
router.post('/', authenticate, validate(createBookingSchema), async (req, res, next) => {
  try {
    const result = await BookingService.createBooking(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Booking request created successfully',
      data: {
        booking: result.booking,
        otp: result.otp, // Returned securely to rider for verification with driver
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/bookings/:id/join
 * Joins an existing shared ride as a secondary pooled passenger.
 */
router.post('/:id/join', authenticate, validate(joinSharedSchema), async (req, res, next) => {
  try {
    const result = await BookingService.joinSharedRide(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      message: 'Joined shared ride successfully',
      data: {
        booking: result.booking,
        otp: result.otp,
        passengerFare: result.passengerFare,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/bookings/active
 * Gets current active ride for logged in passenger.
 */
router.get('/active', authenticate, async (req, res, next) => {
  try {
    const booking = await BookingService.getActivePassengerBooking(req.user.id);

    res.json({
      success: true,
      data: { booking },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/bookings/:id/auto-accept
 * Auto-assigns a driver to a pending booking (for demo/testing).
 */
router.post('/:id/auto-accept', authenticate, async (req, res, next) => {
  try {
    const booking = await BookingService.autoAssignDriver(req.params.id);

    res.json({
      success: true,
      message: 'Driver accepted ride',
      data: { booking },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/bookings/history
 * Gets past rides for logged in user.
 */
router.get('/history', authenticate, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = parseInt(req.query.offset, 10) || 0;

    const history = await BookingService.getRideHistory(
      req.user.id,
      req.profile.role,
      limit,
      offset
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: POST /api/bookings/:id/cancel
 * Cancels a booking.
 */
router.post('/:id/cancel', authenticate, async (req, res, next) => {
  try {
    const reason = req.body?.reason || 'Cancelled by user';
    const cancelled = await BookingService.cancelBooking(req.params.id, req.user.id, reason);

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: { booking: cancelled },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
