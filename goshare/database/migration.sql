-- ============================================================
-- GoShare — Complete Supabase PostgreSQL Migration
-- Run this in the Supabase SQL Editor for a fresh project.
-- ============================================================

-- ============================================================
-- 1. ENUM TYPES (Idempotent creation)
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('user', 'driver', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicle_category') THEN
    CREATE TYPE public.vehicle_category AS ENUM ('rickshaw', 'mini', 'cab', 'suv');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    CREATE TYPE public.booking_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ride_type') THEN
    CREATE TYPE public.ride_type AS ENUM ('solo', 'shared');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('cash', 'upi');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waypoint_type') THEN
    CREATE TYPE public.waypoint_type AS ENUM ('pickup', 'dropoff');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sos_status') THEN
    CREATE TYPE public.sos_status AS ENUM ('active', 'acknowledged', 'resolved');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_type') THEN
    CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'other');
  END IF;
END $$;

-- ============================================================
-- 2. PROFILES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  phone TEXT CHECK (phone IS NULL OR phone ~ '^\d{10}$'),
  role public.user_role NOT NULL DEFAULT 'user',
  gender public.gender_type,
  -- Driver-specific fields (NULL for non-drivers)
  vehicle_type public.vehicle_category,
  vehicle_number TEXT CHECK (vehicle_number IS NULL OR char_length(vehicle_number) >= 4),
  vehicle_rc TEXT,
  license_number TEXT,
  is_available BOOLEAN DEFAULT false,
  -- Driver location (last known)
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_available_drivers ON public.profiles(role, is_available, vehicle_type) 
  WHERE role = 'driver' AND is_available = true;

-- ============================================================
-- 3. BOOKINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_type public.ride_type NOT NULL DEFAULT 'solo',
  vehicle_category public.vehicle_category NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'pending',
  female_driver_preferred BOOLEAN NOT NULL DEFAULT false,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  
  -- Primary passenger (who created the booking)
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  
  -- Pickup/destination for the primary booking
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_label TEXT NOT NULL DEFAULT '',
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  destination_label TEXT NOT NULL DEFAULT '',
  
  -- Route info
  route_distance_km DOUBLE PRECISION,
  route_duration_min DOUBLE PRECISION,
  
  -- Fare
  base_fare INTEGER NOT NULL CHECK (base_fare >= 0),
  final_fare INTEGER NOT NULL CHECK (final_fare >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  
  -- Assigned driver
  driver_id UUID REFERENCES public.profiles(id),
  
  -- OTP (server-generated, never exposed in list queries)
  otp_hash TEXT,
  otp_verified BOOLEAN NOT NULL DEFAULT false,
  
  -- Capacity tracking for shared rides
  passenger_count INTEGER NOT NULL DEFAULT 1 CHECK (passenger_count >= 1 AND passenger_count <= 6),
  max_passengers INTEGER NOT NULL DEFAULT 1 CHECK (max_passengers >= 1),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  
  -- Constraints
  CONSTRAINT valid_coordinates CHECK (
    pickup_lat BETWEEN -90 AND 90 AND
    pickup_lng BETWEEN -180 AND 180 AND
    destination_lat BETWEEN -90 AND 90 AND
    destination_lng BETWEEN -180 AND 180
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON public.bookings(created_by);
CREATE INDEX IF NOT EXISTS idx_bookings_driver_id ON public.bookings(driver_id);
CREATE INDEX IF NOT EXISTS idx_bookings_shared_matching ON public.bookings(ride_type, status, vehicle_category, created_at) 
  WHERE ride_type = 'shared' AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_bookings_active ON public.bookings(status) 
  WHERE status IN ('pending', 'accepted', 'in_progress');

-- ============================================================
-- 4. BOOKING PASSENGERS (normalized passenger-trip association)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  
  -- Passenger-specific pickup/destination
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_label TEXT NOT NULL DEFAULT '',
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  destination_label TEXT NOT NULL DEFAULT '',
  
  -- Fare allocation
  fare_amount INTEGER NOT NULL CHECK (fare_amount >= 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  
  -- Per-passenger progress
  is_picked_up BOOLEAN NOT NULL DEFAULT false,
  is_dropped_off BOOLEAN NOT NULL DEFAULT false,
  picked_up_at TIMESTAMPTZ,
  dropped_off_at TIMESTAMPTZ,
  
  -- Ordering (1 = primary, 2 = joined)
  passenger_order INTEGER NOT NULL DEFAULT 1 CHECK (passenger_order >= 1),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate passenger per booking
  CONSTRAINT unique_passenger_per_booking UNIQUE (booking_id, user_id),
  
  CONSTRAINT valid_passenger_coordinates CHECK (
    pickup_lat BETWEEN -90 AND 90 AND
    pickup_lng BETWEEN -180 AND 180 AND
    destination_lat BETWEEN -90 AND 90 AND
    destination_lng BETWEEN -180 AND 180
  )
);

CREATE INDEX IF NOT EXISTS idx_bp_booking ON public.booking_passengers(booking_id);
CREATE INDEX IF NOT EXISTS idx_bp_user ON public.booking_passengers(user_id);

-- ============================================================
-- 5. BOOKING WAYPOINTS (ordered stop sequence)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES public.booking_passengers(id) ON DELETE CASCADE,
  
  waypoint_type public.waypoint_type NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  
  -- Order in the trip sequence (1, 2, 3, ...)
  stop_order INTEGER NOT NULL CHECK (stop_order >= 1),
  
  -- Completion tracking
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_waypoint_coordinates CHECK (
    lat BETWEEN -90 AND 90 AND
    lng BETWEEN -180 AND 180
  ),
  
  -- Unique order per booking
  CONSTRAINT unique_stop_order_per_booking UNIQUE (booking_id, stop_order)
);

CREATE INDEX IF NOT EXISTS idx_waypoints_booking ON public.booking_waypoints(booking_id);
CREATE INDEX IF NOT EXISTS idx_waypoints_order ON public.booking_waypoints(booking_id, stop_order);

-- ============================================================
-- 6. RATINGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id),
  passenger_id UUID NOT NULL REFERENCES public.profiles(id),
  driver_id UUID NOT NULL REFERENCES public.profiles(id),
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  feedback TEXT CHECK (feedback IS NULL OR char_length(feedback) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One rating per passenger per booking
  CONSTRAINT unique_rating_per_passenger_booking UNIQUE (booking_id, passenger_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_driver ON public.ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_ratings_booking ON public.ratings(booking_id);

-- ============================================================
-- 7. SOS ALERTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID NOT NULL REFERENCES public.profiles(id),
  booking_id UUID REFERENCES public.bookings(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  status public.sos_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sos_status ON public.sos_alerts(status);
CREATE INDEX IF NOT EXISTS idx_sos_booking ON public.sos_alerts(booking_id);

-- ============================================================
-- 8. UPDATED_AT TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_bookings_updated_at ON public.bookings;
CREATE TRIGGER set_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_sos_updated_at ON public.sos_alerts;
CREATE TRIGGER set_sos_updated_at
  BEFORE UPDATE ON public.sos_alerts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 9. AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
CREATE POLICY "Service role can insert profiles"
  ON public.profiles FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ---- BOOKINGS ----
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    driver_id = auth.uid() OR
    -- Admin can see all
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') OR
    -- Driver sees pending bookings matching their vehicle
    (status = 'pending' AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'driver' AND is_available = true
    ))
  );

DROP POLICY IF EXISTS "Users can create bookings" ON public.bookings;
CREATE POLICY "Users can create bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Updates handled via RPC functions (service_role), but allow direct updates for admin
DROP POLICY IF EXISTS "Service role can update bookings" ON public.bookings;
CREATE POLICY "Service role can update bookings"
  ON public.bookings FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---- BOOKING PASSENGERS ----
DROP POLICY IF EXISTS "Users can view booking passengers for their bookings" ON public.booking_passengers;
CREATE POLICY "Users can view booking passengers for their bookings"
  ON public.booking_passengers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.bookings WHERE id = booking_id AND (driver_id = auth.uid() OR created_by = auth.uid())) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role manages booking passengers" ON public.booking_passengers;
CREATE POLICY "Service role manages booking passengers"
  ON public.booking_passengers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---- BOOKING WAYPOINTS ----
DROP POLICY IF EXISTS "Users can view waypoints for their bookings" ON public.booking_waypoints;
CREATE POLICY "Users can view waypoints for their bookings"
  ON public.booking_waypoints FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b 
      WHERE b.id = booking_id AND (
        b.driver_id = auth.uid() OR 
        b.created_by = auth.uid() OR
        EXISTS (SELECT 1 FROM public.booking_passengers bp WHERE bp.booking_id = b.id AND bp.user_id = auth.uid())
      )
    ) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Service role manages waypoints" ON public.booking_waypoints;
CREATE POLICY "Service role manages waypoints"
  ON public.booking_waypoints FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---- RATINGS ----
DROP POLICY IF EXISTS "Ratings are viewable by authenticated users" ON public.ratings;
CREATE POLICY "Ratings are viewable by authenticated users"
  ON public.ratings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Passengers can create ratings for their completed bookings" ON public.ratings;
CREATE POLICY "Passengers can create ratings for their completed bookings"
  ON public.ratings FOR INSERT
  TO authenticated
  WITH CHECK (
    passenger_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.status = 'completed'
      AND EXISTS (
        SELECT 1 FROM public.booking_passengers bp
        WHERE bp.booking_id = b.id AND bp.user_id = auth.uid()
      )
    )
  );

-- ---- SOS ALERTS ----
DROP POLICY IF EXISTS "Users can create SOS alerts" ON public.sos_alerts;
CREATE POLICY "Users can create SOS alerts"
  ON public.sos_alerts FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

DROP POLICY IF EXISTS "Users can view their own SOS alerts" ON public.sos_alerts;
CREATE POLICY "Users can view their own SOS alerts"
  ON public.sos_alerts FOR SELECT
  TO authenticated
  USING (
    reported_by = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update SOS alerts" ON public.sos_alerts;
CREATE POLICY "Admins can update SOS alerts"
  ON public.sos_alerts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 11. RPC FUNCTIONS (Atomic Business Operations)
-- ============================================================

-- ---- CREATE BOOKING WITH PASSENGERS AND WAYPOINTS ----
CREATE OR REPLACE FUNCTION public.create_booking(
  p_ride_type public.ride_type,
  p_vehicle_category public.vehicle_category,
  p_female_driver boolean,
  p_payment_method public.payment_method,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_label text,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_dest_label text,
  p_distance_km double precision,
  p_duration_min double precision,
  p_base_fare integer,
  p_final_fare integer,
  p_otp_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_booking_id uuid;
  v_passenger_id uuid;
  v_max_passengers integer;
BEGIN
  -- Verify user is a passenger
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'user') THEN
    RAISE EXCEPTION 'Only passengers can create bookings';
  END IF;
  
  -- Check no active booking exists for this user
  IF EXISTS (
    SELECT 1 FROM public.booking_passengers bp
    JOIN public.bookings b ON b.id = bp.booking_id
    WHERE bp.user_id = v_user_id
    AND b.status IN ('pending', 'accepted', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'You already have an active booking';
  END IF;
  
  -- Set max passengers based on ride type
  v_max_passengers := CASE WHEN p_ride_type = 'shared' THEN 2 ELSE 1 END;
  
  -- Create booking
  INSERT INTO public.bookings (
    ride_type, vehicle_category, status, female_driver_preferred,
    payment_method, created_by,
    pickup_lat, pickup_lng, pickup_label,
    destination_lat, destination_lng, destination_label,
    route_distance_km, route_duration_min,
    base_fare, final_fare,
    otp_hash, passenger_count, max_passengers
  ) VALUES (
    p_ride_type, p_vehicle_category, 'pending', p_female_driver,
    p_payment_method, v_user_id,
    p_pickup_lat, p_pickup_lng, p_pickup_label,
    p_dest_lat, p_dest_lng, p_dest_label,
    p_distance_km, p_duration_min,
    p_base_fare, p_final_fare,
    p_otp_hash, 1, v_max_passengers
  ) RETURNING id INTO v_booking_id;
  
  -- Create passenger record
  INSERT INTO public.booking_passengers (
    booking_id, user_id,
    pickup_lat, pickup_lng, pickup_label,
    destination_lat, destination_lng, destination_label,
    fare_amount, payment_method, passenger_order
  ) VALUES (
    v_booking_id, v_user_id,
    p_pickup_lat, p_pickup_lng, p_pickup_label,
    p_dest_lat, p_dest_lng, p_dest_label,
    p_final_fare, p_payment_method, 1
  ) RETURNING id INTO v_passenger_id;
  
  -- Create waypoints (pickup then dropoff)
  INSERT INTO public.booking_waypoints (booking_id, passenger_id, waypoint_type, lat, lng, label, stop_order)
  VALUES
    (v_booking_id, v_passenger_id, 'pickup', p_pickup_lat, p_pickup_lng, p_pickup_label, 1),
    (v_booking_id, v_passenger_id, 'dropoff', p_dest_lat, p_dest_lng, p_dest_label, 2);
  
  RETURN jsonb_build_object('booking_id', v_booking_id, 'passenger_id', v_passenger_id);
END;
$$;

-- ---- JOIN SHARED RIDE (ATOMIC) ----
CREATE OR REPLACE FUNCTION public.join_shared_ride(
  p_booking_id uuid,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_pickup_label text,
  p_dest_lat double precision,
  p_dest_lng double precision,
  p_dest_label text,
  p_fare_amount integer,
  p_payment_method public.payment_method,
  p_otp_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_booking record;
  v_passenger_id uuid;
  v_max_stop integer;
BEGIN
  -- Lock the booking row to prevent concurrent joins
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  -- Validate booking is eligible
  IF v_booking.ride_type != 'shared' THEN
    RAISE EXCEPTION 'This is not a shared ride';
  END IF;
  
  IF v_booking.status != 'pending' THEN
    RAISE EXCEPTION 'Booking is no longer available for joining';
  END IF;
  
  IF v_booking.passenger_count >= v_booking.max_passengers THEN
    RAISE EXCEPTION 'Ride is already full';
  END IF;
  
  IF v_booking.created_by = v_user_id THEN
    RAISE EXCEPTION 'Cannot join your own ride';
  END IF;
  
  -- Check user doesn't already have an active booking
  IF EXISTS (
    SELECT 1 FROM public.booking_passengers bp
    JOIN public.bookings b ON b.id = bp.booking_id
    WHERE bp.user_id = v_user_id
    AND b.status IN ('pending', 'accepted', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'You already have an active booking';
  END IF;
  
  -- Add passenger
  INSERT INTO public.booking_passengers (
    booking_id, user_id,
    pickup_lat, pickup_lng, pickup_label,
    destination_lat, destination_lng, destination_label,
    fare_amount, payment_method, passenger_order
  ) VALUES (
    p_booking_id, v_user_id,
    p_pickup_lat, p_pickup_lng, p_pickup_label,
    p_dest_lat, p_dest_lng, p_dest_label,
    p_fare_amount, p_payment_method, 2
  ) RETURNING id INTO v_passenger_id;
  
  -- Update booking passenger count
  UPDATE public.bookings
  SET passenger_count = passenger_count + 1,
      otp_hash = p_otp_hash  -- New OTP for the joining passenger's verification
  WHERE id = p_booking_id;
  
  -- Get current max stop order
  SELECT COALESCE(MAX(stop_order), 0) INTO v_max_stop
  FROM public.booking_waypoints WHERE booking_id = p_booking_id;
  
  -- Add waypoints for the new passenger
  INSERT INTO public.booking_waypoints (booking_id, passenger_id, waypoint_type, lat, lng, label, stop_order)
  VALUES
    (p_booking_id, v_passenger_id, 'pickup', p_pickup_lat, p_pickup_lng, p_pickup_label, v_max_stop + 1),
    (p_booking_id, v_passenger_id, 'dropoff', p_dest_lat, p_dest_lng, p_dest_label, v_max_stop + 2);
  
  RETURN jsonb_build_object('passenger_id', v_passenger_id);
END;
$$;

-- ---- ACCEPT BOOKING (DRIVER) ----
CREATE OR REPLACE FUNCTION public.accept_booking(
  p_booking_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_driver_id uuid := auth.uid();
  v_booking record;
  v_driver record;
BEGIN
  -- Verify caller is an available driver
  SELECT * INTO v_driver FROM public.profiles
  WHERE id = v_driver_id AND role = 'driver' AND is_available = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver not found or not available';
  END IF;
  
  -- Lock and check booking
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  IF v_booking.status != 'pending' THEN
    RAISE EXCEPTION 'Booking is no longer available';
  END IF;
  
  -- Check vehicle match
  IF v_booking.vehicle_category != v_driver.vehicle_type THEN
    RAISE EXCEPTION 'Vehicle type mismatch';
  END IF;
  
  -- Check female driver preference
  IF v_booking.female_driver_preferred AND v_driver.gender != 'female' THEN
    RAISE EXCEPTION 'Female driver preference not met';
  END IF;
  
  -- Check driver doesn't have another active booking
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE driver_id = v_driver_id
    AND status IN ('accepted', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Driver already has an active ride';
  END IF;
  
  -- Assign driver
  UPDATE public.bookings
  SET status = 'accepted',
      driver_id = v_driver_id,
      accepted_at = now()
  WHERE id = p_booking_id;
  
  RETURN jsonb_build_object('status', 'accepted', 'driver_id', v_driver_id);
END;
$$;

-- ---- VERIFY OTP AND START RIDE ----
CREATE OR REPLACE FUNCTION public.verify_otp_and_start(
  p_booking_id uuid,
  p_otp_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_driver_id uuid := auth.uid();
  v_booking record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  IF v_booking.driver_id != v_driver_id THEN
    RAISE EXCEPTION 'Not authorized for this booking';
  END IF;
  
  IF v_booking.status != 'accepted' THEN
    RAISE EXCEPTION 'Booking is not in accepted state';
  END IF;
  
  IF v_booking.otp_hash != p_otp_hash THEN
    RAISE EXCEPTION 'Invalid OTP';
  END IF;
  
  -- Start the ride
  UPDATE public.bookings
  SET status = 'in_progress',
      otp_verified = true,
      started_at = now()
  WHERE id = p_booking_id;
  
  RETURN jsonb_build_object('status', 'in_progress');
END;
$$;

-- ---- COMPLETE WAYPOINT ----
CREATE OR REPLACE FUNCTION public.complete_waypoint(
  p_waypoint_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_driver_id uuid := auth.uid();
  v_waypoint record;
  v_booking record;
  v_passenger record;
  v_all_done boolean;
BEGIN
  -- Get waypoint
  SELECT * INTO v_waypoint FROM public.booking_waypoints
  WHERE id = p_waypoint_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waypoint not found';
  END IF;
  
  -- Get booking
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = v_waypoint.booking_id;
  
  IF v_booking.driver_id != v_driver_id THEN
    RAISE EXCEPTION 'Not authorized for this booking';
  END IF;
  
  IF v_booking.status != 'in_progress' THEN
    RAISE EXCEPTION 'Ride is not in progress';
  END IF;
  
  IF v_waypoint.is_completed THEN
    RAISE EXCEPTION 'Waypoint already completed';
  END IF;
  
  -- Verify this is the next waypoint in sequence
  IF EXISTS (
    SELECT 1 FROM public.booking_waypoints
    WHERE booking_id = v_waypoint.booking_id
    AND stop_order < v_waypoint.stop_order
    AND is_completed = false
  ) THEN
    RAISE EXCEPTION 'Previous waypoints must be completed first';
  END IF;
  
  -- Mark waypoint complete
  UPDATE public.booking_waypoints
  SET is_completed = true, completed_at = now()
  WHERE id = p_waypoint_id;
  
  -- Update passenger progress
  IF v_waypoint.waypoint_type = 'pickup' THEN
    UPDATE public.booking_passengers
    SET is_picked_up = true, picked_up_at = now()
    WHERE id = v_waypoint.passenger_id;
  ELSIF v_waypoint.waypoint_type = 'dropoff' THEN
    UPDATE public.booking_passengers
    SET is_dropped_off = true, dropped_off_at = now()
    WHERE id = v_waypoint.passenger_id;
  END IF;
  
  -- Check if all waypoints are done
  SELECT NOT EXISTS (
    SELECT 1 FROM public.booking_waypoints
    WHERE booking_id = v_waypoint.booking_id AND is_completed = false
  ) INTO v_all_done;
  
  -- If all done, complete the booking
  IF v_all_done THEN
    UPDATE public.bookings
    SET status = 'completed', completed_at = now()
    WHERE id = v_waypoint.booking_id;
  END IF;
  
  RETURN jsonb_build_object(
    'waypoint_completed', true,
    'ride_completed', v_all_done
  );
END;
$$;

-- ---- CANCEL BOOKING ----
CREATE OR REPLACE FUNCTION public.cancel_booking(
  p_booking_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_booking record;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  -- Only the creator, driver, or admin can cancel
  IF v_booking.created_by != v_user_id 
     AND v_booking.driver_id != v_user_id
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'admin')
  THEN
    RAISE EXCEPTION 'Not authorized to cancel this booking';
  END IF;
  
  -- Can only cancel pending or accepted bookings
  IF v_booking.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'Cannot cancel a ride that is already in progress or completed';
  END IF;
  
  UPDATE public.bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_user_id
  WHERE id = p_booking_id;
  
  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

-- ============================================================
-- 12. ADMIN PROVISIONING
-- ============================================================
-- To make a user an admin, run this after they've registered:
-- UPDATE public.profiles SET role = 'admin' WHERE id = '<user-uuid>';
-- 
-- IMPORTANT: Never allow admin self-registration via the API.

-- ============================================================
-- 13. REALTIME PUBLICATION (Idempotent)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'booking_passengers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_passengers;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'booking_waypoints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_waypoints;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sos_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
  END IF;
END $$;

-- ============================================================
-- 14. GRANT PERMISSIONS
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Grant execute on RPC functions
GRANT EXECUTE ON FUNCTION public.create_booking TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_shared_ride TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_otp_and_start TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_waypoint TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking TO authenticated;
