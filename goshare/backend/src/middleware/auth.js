import { getSupabaseAdmin } from '../config/supabase.js';
import { UnauthorizedError } from '../utils/errors.js';

// Predefined demo accounts for effortless faculty testing
export const DEMO_USERS = {
  'demo-passenger-token': {
    id: '11111111-1111-4111-a111-111111111111',
    email: 'passenger@goshare.demo',
    role: 'user',
    name: 'Aarav Sharma',
    phone: '9876543210',
    gender: 'male',
  },
  'demo-passenger-2-token': {
    id: '303161bd-a63d-40ad-bc23-eeb635d7e0bd',
    email: 'passenger2@goshare.demo',
    role: 'user',
    name: 'Rohan Gupta (Passenger 2)',
    phone: '9876543215',
    gender: 'male',
  },
  'demo-driver-token': {
    id: '22222222-2222-4222-a222-222222222222',
    email: 'driver@goshare.demo',
    role: 'driver',
    name: 'Aarav Sharma (Driver)',
    phone: '9876543211',
    gender: 'male',
    vehicle_type: 'cab',
    vehicle_number: 'MH-12-AB-1234',
    is_available: true,
    current_lat: 18.5204,
    current_lng: 73.8567,
  },
  'demo-female-driver-token': {
    id: '44444444-4444-4444-a444-444444444444',
    email: 'femaledriver@goshare.demo',
    role: 'driver',
    name: 'Priya Shinde (Driver)',
    phone: '9876543219',
    gender: 'female',
    vehicle_type: 'cab',
    vehicle_number: 'MH-12-FF-5678',
    is_available: true,
    current_lat: 18.5204,
    current_lng: 73.8567,
  },
  'demo-admin-token': {
    id: '33333333-3333-4333-a333-333333333333',
    email: 'admin@goshare.demo',
    role: 'admin',
    name: 'Super Admin',
    phone: '9876543212',
    gender: 'other',
  },
};

/**
 * Authentication middleware.
 * Verifies Supabase JWT from Authorization header, with demo fallback for academic evaluation.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1].trim();

    // 1. Check if token matches demo credentials for instant faculty grading
    if (DEMO_USERS[token]) {
      const demoUser = DEMO_USERS[token];
      req.user = { id: demoUser.id, email: demoUser.email };
      req.profile = demoUser;
      return next();
    }

    // 2. Real Supabase Auth verification
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      throw new UnauthorizedError('Supabase is not configured on the backend');
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      throw new UnauthorizedError(authError?.message || 'Invalid or expired auth token');
    }

    const user = authData.user;
    req.user = user;

    // Fetch profile from profiles table
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const registeredRole = user.user_metadata?.role;

    if (profileErr || !profile) {
      // If profile hasn't been created yet, construct and persist to database so foreign key references succeed
      const newProfile = {
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        phone: user.user_metadata?.phone || null,
        role: registeredRole || 'user',
        gender: user.user_metadata?.gender || null,
        ...(registeredRole === 'driver' && {
          vehicle_type: user.user_metadata?.vehicle_type || 'cab',
          vehicle_number: user.user_metadata?.vehicle_number || 'MH-12-AB-1234',
          is_available: true,
        }),
      };

      const { data: inserted } = await supabase
        .from('profiles')
        .insert(newProfile)
        .select()
        .maybeSingle();

      req.profile = inserted || newProfile;
    } else {
      if (registeredRole && profile.role !== registeredRole) {
        profile.role = registeredRole;
        const driverFields =
          registeredRole === 'driver'
            ? {
                vehicle_type: user.user_metadata?.vehicle_type || profile.vehicle_type || 'cab',
                vehicle_number: user.user_metadata?.vehicle_number || profile.vehicle_number || 'MH-12-AB-1234',
                is_available: true,
              }
            : {};
        await supabase
          .from('profiles')
          .update({ role: registeredRole, ...driverFields, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        Object.assign(profile, driverFields);
      }
      if (user.user_metadata?.gender && !profile.gender) {
        profile.gender = user.user_metadata.gender;
        await supabase
          .from('profiles')
          .update({ gender: user.user_metadata.gender, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      }
      req.profile = profile;
    }

    next();
  } catch (error) {
    next(error);
  }
}
