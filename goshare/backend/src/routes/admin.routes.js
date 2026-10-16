import { Router } from 'express';
import Joi from 'joi';
import { getSupabaseAdmin } from '../config/supabase.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();

// Apply auth and admin role check
router.use(authenticate);
router.use(requireRole('admin'));

const roleUpdateSchema = Joi.object({
  role: Joi.string().valid('user', 'driver', 'admin').required(),
});

/**
 * Route: GET /api/admin/stats
 * Platform overview KPIs and statistics.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({
        success: true,
        data: {
          totalUsers: 24,
          totalDrivers: 8,
          activeBookings: 3,
          completedBookings: 42,
          totalRevenue: 8450,
          activeSosAlerts: 0,
        },
      });
    }

    // 1. User counts
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'user');

    const { count: totalDrivers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'driver');

    // 2. Booking counts
    const { data: bookings } = await supabase
      .from('bookings')
      .select('status, final_fare');

    const totalBookings = bookings?.length || 0;
    const activeBookings = (bookings || []).filter((b) =>
      ['pending', 'accepted', 'in_progress'].includes(b.status)
    ).length;
    const completedBookings = (bookings || []).filter((b) => b.status === 'completed').length;
    const totalRevenue = (bookings || [])
      .filter((b) => b.status === 'completed')
      .reduce((sum, b) => sum + (b.final_fare || 0), 0);

    // 3. Active SOS count
    const { count: activeSosAlerts } = await supabase
      .from('sos_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    res.json({
      success: true,
      data: {
        totalUsers: totalUsers || 0,
        totalDrivers: totalDrivers || 0,
        totalBookings,
        activeBookings,
        completedBookings,
        totalRevenue,
        activeSosAlerts: activeSosAlerts || 0,
        currency: 'INR',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/admin/drivers
 * Driver leaderboard with trips, earnings, and ratings.
 */
router.get('/drivers', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ success: true, data: { drivers: [] } });
    }

    const { data: drivers, error: driverErr } = await supabase
      .from('profiles')
      .select(`
        id,
        name,
        phone,
        vehicle_type,
        vehicle_number,
        is_available,
        current_lat,
        current_lng,
        created_at
      `)
      .eq('role', 'driver');

    if (driverErr) throw new BadRequestError(driverErr.message);

    // Fetch stats for each driver
    const driverStats = await Promise.all(
      (drivers || []).map(async (driver) => {
        const { data: trips } = await supabase
          .from('bookings')
          .select('final_fare')
          .eq('driver_id', driver.id)
          .eq('status', 'completed');

        const { data: ratings } = await supabase
          .from('ratings')
          .select('rating')
          .eq('driver_id', driver.id);

        const tripCount = trips?.length || 0;
        const totalEarnings = (trips || []).reduce((sum, t) => sum + (t.final_fare || 0), 0);
        const ratingCount = ratings?.length || 0;
        const avgRating =
          ratingCount > 0
            ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10
            : 5.0;

        return {
          ...driver,
          tripCount,
          totalEarnings,
          avgRating,
          ratingCount,
        };
      })
    );

    // Sort by earnings descending
    driverStats.sort((a, b) => b.totalEarnings - a.totalEarnings);

    res.json({
      success: true,
      data: { drivers: driverStats },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/admin/bookings
 * System-wide booking list with optional status filter.
 */
router.get('/bookings', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ success: true, data: { bookings: [] } });
    }

    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('bookings')
      .select(`
        *,
        creator:profiles!bookings_created_by_fkey(name, phone),
        driver:profiles!bookings_driver_id_fkey(name, phone, vehicle_number)
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: bookings, error } = await query;
    if (error) throw new BadRequestError(error.message);

    res.json({
      success: true,
      data: { bookings: bookings || [] },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: GET /api/admin/users
 * Lists registered platform users.
 */
router.get('/users', async (req, res, next) => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ success: true, data: { users: [] } });
    }

    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new BadRequestError(error.message);

    res.json({
      success: true,
      data: { users: users || [] },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Route: PATCH /api/admin/users/:id/role
 * Admin modifies role for a user.
 */
router.patch('/users/:id/role', validate(roleUpdateSchema), async (req, res, next) => {
  try {
    const { role } = req.body;
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      throw new BadRequestError('Database connection required');
    }

    const { data: updated, error } = await supabase
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw new BadRequestError(error.message);

    res.json({
      success: true,
      message: `User role updated to ${role}`,
      data: { user: updated },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
