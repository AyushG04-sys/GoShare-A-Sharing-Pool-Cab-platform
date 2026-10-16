import { Router } from 'express';
import Joi from 'joi';
import { getSupabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors.js';

const router = Router();

router.use(authenticate);

const submitRatingSchema = Joi.object({
  booking_id: Joi.string().uuid().required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(500).allow('', null),
});

/**
 * Route: POST /api/ratings
 * Passenger submits rating for completed trip.
 */
router.post('/', validate(submitRatingSchema), async (req, res, next) => {
  try {
    const { booking_id, rating, comment } = req.body;
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return res.json({
        success: true,
        message: 'Rating submitted successfully (demo mode)',
        data: { rating: { rating, comment } },
      });
    }

    // 1. Verify booking
    const { data: booking, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, status, driver_id, created_by')
      .eq('id', booking_id)
      .maybeSingle();

    if (fetchErr || !booking) {
      throw new NotFoundError('Booking not found');
    }

    if (booking.status !== 'completed') {
      throw new BadRequestError('Ratings can only be submitted for completed trips');
    }

    if (!booking.driver_id) {
      throw new BadRequestError('No driver assigned to this booking to rate');
    }

    // 2. Check if already rated
    const { data: existing } = await supabase
      .from('ratings')
      .select('id')
      .eq('booking_id', booking_id)
      .eq('reviewer_id', req.user.id)
      .maybeSingle();

    if (existing) {
      throw new ConflictError('You have already submitted a rating for this trip');
    }

    // 3. Insert rating
    const { data: newRating, error: ratingErr } = await supabase
      .from('ratings')
      .insert({
        booking_id,
        driver_id: booking.driver_id,
        reviewer_id: req.user.id,
        rating,
        comment: comment || '',
      })
      .select()
      .single();

    if (ratingErr) throw new BadRequestError(ratingErr.message);

    res.status(201).json({
      success: true,
      message: 'Thank you for your rating!',
      data: { rating: newRating },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/ratings/driver/:driverId
 * Retrieves reviews and ratings received by a driver.
 */
router.get('/driver/:driverId', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ success: true, data: { ratings: [], avgRating: 5.0 } });
    }

    let { data: ratings, error } = await supabase
      .from('ratings')
      .select('*')
      .eq('driver_id', req.params.driverId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Driver ratings query note:', error.message);
      return res.json({
        success: true,
        data: {
          ratings: [],
          avgRating: 5.0,
          totalReviews: 0,
        },
      });
    }

    const count = ratings?.length || 0;
    const avgRating =
      count > 0
        ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
        : 5.0;

    res.json({
      success: true,
      data: {
        ratings: ratings || [],
        avgRating,
        totalReviews: count,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
