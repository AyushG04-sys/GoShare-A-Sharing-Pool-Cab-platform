import { Router } from 'express';
import Joi from 'joi';
import { getSupabaseAdmin, getAuthClient } from '../config/supabase.js';
import { authenticate, DEMO_USERS } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { BadRequestError } from '../utils/errors.js';

const router = Router();

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(100).required(),
  phone: Joi.string()
    .pattern(/^\d{7,15}$/)
    .allow('', null)
    .messages({
      'string.pattern.base': 'Phone number must be between 7 and 15 digits or left blank.',
    }),
  role: Joi.string().valid('user', 'driver').default('user'),
  gender: Joi.when('role', {
    is: 'driver',
    then: Joi.string().valid('female', 'male').required().messages({
      'any.only': 'Driver partner gender must be either female or male.',
      'any.required': 'Gender is required for driver partner registration and must be female or male.',
    }),
    otherwise: Joi.string().valid('male', 'female', 'other').allow('', null),
  }),
  // Driver fields
  vehicle_type: Joi.when('role', {
    is: 'driver',
    then: Joi.string().valid('rickshaw', 'mini', 'cab', 'suv').required(),
    otherwise: Joi.forbidden(),
  }),
  vehicle_number: Joi.when('role', {
    is: 'driver',
    then: Joi.string().min(4).max(20).required(),
    otherwise: Joi.forbidden(),
  }),
});

const demoLoginSchema = Joi.object({
  role: Joi.string().valid('user', 'user2', 'driver', 'admin').required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  name: Joi.string().min(1).max(100),
  phone: Joi.string()
    .pattern(/^\d{7,15}$/)
    .allow('', null)
    .messages({
      'string.pattern.base': 'Phone number must be between 7 and 15 digits or left blank.',
    }),
  gender: Joi.string().valid('male', 'female', 'other').allow('', null),
  vehicle_type: Joi.string().valid('rickshaw', 'mini', 'cab', 'suv'),
  vehicle_number: Joi.string().min(4).max(20),
});

/**
 * Standard email/password login.
 */
router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const supabase = getSupabaseAdmin();
    const authClient = getAuthClient();

    if (!supabase) {
      throw new BadRequestError('Supabase is not configured on the backend');
    }

    let { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    // If Supabase rejected with "Email not confirmed", auto-confirm via admin API and retry!
    if (
      authErr &&
      (authErr.message?.toLowerCase().includes('email not confirmed') ||
        authErr.message?.toLowerCase().includes('not confirmed'))
    ) {
      try {
        const { data: userList } = await supabase.auth.admin.listUsers();
        const unconfirmedUser = (userList?.users || []).find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (unconfirmedUser) {
          await supabase.auth.admin.updateUserById(unconfirmedUser.id, {
            email_confirm: true,
          });
          // Retry login after auto-confirmation
          const retry = await authClient.auth.signInWithPassword({ email, password });
          authData = retry.data;
          authErr = retry.error;
        }
      } catch (confirmErr) {
        console.warn('Auto-confirmation error on login:', confirmErr.message);
      }
    }

    if (authErr) {
      throw new BadRequestError(authErr.message);
    }

    // Fetch user profile and ensure role consistency with registration metadata
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    const registeredRole = authData.user.user_metadata?.role;
    const registeredName = authData.user.user_metadata?.name;
    const registeredPhone = authData.user.user_metadata?.phone;
    const registeredVehicleType = authData.user.user_metadata?.vehicle_type;
    const registeredVehicleNumber = authData.user.user_metadata?.vehicle_number;

    if (!profile) {
      // Auto-create profile from registration metadata if not yet created
      const initialProfile = {
        id: authData.user.id,
        name: registeredName || authData.user.email?.split('@')[0] || 'User',
        phone: registeredPhone || null,
        role: registeredRole || 'user',
        ...(registeredRole === 'driver' && {
          vehicle_type: registeredVehicleType || 'cab',
          vehicle_number: registeredVehicleNumber || 'MH-12-AB-1234',
          is_available: true,
          current_lat: 19.9912,
          current_lng: 73.8090,
        }),
      };
      const { data: created } = await supabase
        .from('profiles')
        .upsert(initialProfile)
        .select()
        .maybeSingle();
      profile = created || initialProfile;
    } else if (registeredRole && profile.role !== registeredRole) {
      // Keep track of the role selected during registration to prevent any role clash
      const syncPayload = {
        role: registeredRole,
        updated_at: new Date().toISOString(),
        ...(registeredRole === 'driver' && {
          vehicle_type: registeredVehicleType || profile.vehicle_type || 'cab',
          vehicle_number: registeredVehicleNumber || profile.vehicle_number || 'MH-12-AB-1234',
          is_available: true,
        }),
      };
      await supabase.from('profiles').update(syncPayload).eq('id', authData.user.id);
      Object.assign(profile, syncPayload);
    }

    res.json({
      success: true,
      message: 'Logged in successfully',
      data: {
        token: authData.session.access_token,
        profile: profile || {
          id: authData.user.id,
          email: authData.user.email,
          role: registeredRole || 'user',
          name: registeredName || 'User',
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Register a new user or driver.
 * Note: Admin role cannot be self-registered (security rule).
 */
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, name, phone, role, gender, vehicle_type, vehicle_number } = req.body;
    const supabase = getSupabaseAdmin();

    if (role === 'driver' && (!gender || (gender.toLowerCase() !== 'female' && gender.toLowerCase() !== 'male'))) {
      throw new BadRequestError('Driver partner registration requires a valid gender (female or male).');
    }

    if (!supabase) {
      throw new BadRequestError('Supabase is not configured on the backend');
    }

    const metadata = {
      name,
      role,
      phone: phone || null,
      gender: gender || null,
      ...(role === 'driver' && {
        vehicle_type: vehicle_type || 'cab',
        vehicle_number: vehicle_number || 'MH-12-AB-1234',
      }),
    };

    // 1. Create user via admin API with email_confirm: true (bypasses rate limit and email confirmation delay)
    let authUser = null;
    const { data: adminUser, error: adminErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (adminErr) {
      // If admin.createUser fails because user already exists:
      if (adminErr.message.includes('already exists') || adminErr.message.includes('registered')) {
        const { data: userList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = (userList?.users || []).find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (existing) {
          // If the user already exists in auth, seamlessly update their password,
          // ensure email is confirmed, and sync user metadata so their role and registration details are preserved!
          const { data: updated, error: updateErr } = await supabase.auth.admin.updateUserById(
            existing.id,
            {
              password,
              email_confirm: true,
              user_metadata: metadata,
            }
          );
          if (!updateErr && updated?.user) {
            authUser = updated.user;
          } else {
            throw new BadRequestError('A user with this email is already registered. Please sign in instead.');
          }
        } else {
          throw new BadRequestError('A user with this email is already registered. Please sign in instead.');
        }
      } else {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email,
          password,
          options: { data: metadata },
        });
        if (signUpErr) throw new BadRequestError(signUpErr.message);
        authUser = signUpData.user;
      }
    } else {
      authUser = adminUser.user;
    }

    const userId = authUser?.id;
    if (!userId) {
      throw new BadRequestError('Failed to create auth user account');
    }

    // 2. Insert into profiles table
    const profilePayload = {
      id: userId,
      name,
      phone: phone || null,
      role,
      gender: gender || null,
      ...(role === 'driver' && {
        vehicle_type,
        vehicle_number,
        is_available: true,
        current_lat: 19.9912,
        current_lng: 73.8090,
      }),
      updated_at: new Date().toISOString(),
    };

    // 2. Safely populate profiles table
    let profile = null;
    const { data: existingProf } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProf) {
      const { data: updated, error: updateProfErr } = await supabase
        .from('profiles')
        .update(profilePayload)
        .eq('id', userId)
        .select()
        .maybeSingle();
      if (updateProfErr) console.error('Error updating profile:', updateProfErr);
      profile = updated || profilePayload;
    } else {
      const { data: created, error: insertProfErr } = await supabase
        .from('profiles')
        .insert(profilePayload)
        .select()
        .maybeSingle();
      if (insertProfErr) console.error('Error inserting profile:', insertProfErr);
      profile = created || profilePayload;
    }

    // 3. Automatically generate session for instant seamless login
    const authClient = getAuthClient();
    let { data: loginData, error: loginErr } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (loginErr && loginErr.message?.toLowerCase().includes('not confirmed')) {
      await supabase.auth.admin.updateUserById(userId, { email_confirm: true });
      const retry = await authClient.auth.signInWithPassword({ email, password });
      loginData = retry.data;
    }

    res.status(201).json({
      success: true,
      message: 'Account registered successfully',
      data: {
        token: loginData?.session?.access_token || null,
        user: authUser,
        profile: profile || profilePayload,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * One-click demo login for academic evaluation / faculty grading.
 */
router.post('/demo-login', validate(demoLoginSchema), (req, res) => {
  const { role } = req.body;

  let token = 'demo-passenger-token';
  if (role === 'user2') token = 'demo-passenger-2-token';
  if (role === 'driver') token = 'demo-driver-token';
  if (role === 'admin') token = 'demo-admin-token';

  const user = DEMO_USERS[token];

  res.json({
    success: true,
    message: `Logged in as demo ${role}`,
    data: {
      token,
      profile: user,
    },
  });
});

/**
 * Get current authenticated user profile.
 */
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      profile: req.profile,
    },
  });
});

/**
 * Update authenticated user profile.
 */
router.put('/profile', authenticate, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const { name, phone, gender, vehicle_type, vehicle_number } = req.body;
    const supabase = getSupabaseAdmin();

    const updateData = {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(gender && { gender }),
      ...(req.profile.role === 'driver' && vehicle_type && { vehicle_type }),
      ...(req.profile.role === 'driver' && vehicle_number && { vehicle_number }),
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data: updated, error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', req.user.id)
        .select()
        .maybeSingle();

      if (error) throw new BadRequestError(error.message);

      return res.json({
        success: true,
        data: updated,
      });
    }

    // Demo user fallback
    Object.assign(req.profile, updateData);
    res.json({ success: true, data: req.profile });
  } catch (error) {
    next(error);
  }
});

export default router;
