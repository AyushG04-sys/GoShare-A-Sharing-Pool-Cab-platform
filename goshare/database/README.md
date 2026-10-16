# GoShare — Database Relationship Model & Schema Reference

This directory contains the complete PostgreSQL database schema definition designed for **Supabase**.

## File Overview

- [`migration.sql`](file:///c:/Users/ayush/OneDrive/Desktop/pbl/goshare/database/migration.sql): Standalone, idempotent migration script that provisions all custom enum types, normalized tables, foreign keys, check constraints, indexes, Row Level Security (RLS) policies, and atomic RPC stored procedures.

---

## Entity Relationship Model (ERD)

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "1:1 extension"
    PROFILES ||--o{ BOOKINGS : "creates"
    PROFILES ||--o{ BOOKINGS : "drives"
    BOOKINGS ||--|{ BOOKING_PASSENGERS : "has passengers"
    BOOKINGS ||--|{ BOOKING_WAYPOINTS : "has route stops"
    PROFILES ||--o{ BOOKING_PASSENGERS : "joins as passenger"
    BOOKINGS ||--o{ SOS_ALERTS : "triggers during trip"
    PROFILES ||--o{ SOS_ALERTS : "reports alert"
    BOOKINGS ||--o{ RATINGS : "rated upon completion"
    PROFILES ||--o{ RATINGS : "rates driver"
    PROFILES ||--o{ AUDIT_LOGS : "performed action"

    PROFILES {
        uuid id PK
        text name
        text phone
        user_role role
        gender_type gender
        vehicle_category vehicle_type
        text vehicle_number
        boolean is_available
        float current_lat
        float current_lng
        timestamptz created_at
    }

    BOOKINGS {
        uuid id PK
        ride_type ride_type
        vehicle_category vehicle_category
        booking_status status
        boolean female_driver_preferred
        payment_method payment_method
        uuid created_by FK
        uuid driver_id FK
        float pickup_lat
        float pickup_lng
        text pickup_label
        float destination_lat
        float destination_lng
        text destination_label
        float route_distance_km
        float route_duration_min
        int base_fare
        int final_fare
        text otp_hash
        boolean otp_verified
        int passenger_count
        int max_passengers
        timestamptz accepted_at
        timestamptz started_at
        timestamptz completed_at
        timestamptz cancelled_at
    }

    BOOKING_PASSENGERS {
        uuid id PK
        uuid booking_id FK
        uuid user_id FK
        boolean is_primary
        int seat_count
        int fare_amount
        float pickup_lat
        float pickup_lng
        float destination_lat
        float destination_lng
        text otp_hash
    }

    BOOKING_WAYPOINTS {
        uuid id PK
        uuid booking_id FK
        int stop_order
        waypoint_type waypoint_type
        uuid passenger_id FK
        text label
        float lat
        float lng
        boolean is_completed
        timestamptz completed_at
    }

    SOS_ALERTS {
        uuid id PK
        uuid booking_id FK
        uuid user_id FK
        float current_lat
        float current_lng
        text alert_type
        text details
        sos_status status
        uuid acknowledged_by FK
        uuid resolved_by FK
    }

    RATINGS {
        uuid id PK
        uuid booking_id FK
        uuid driver_id FK
        uuid reviewer_id FK
        int rating
        text comment
    }
```

---

## 1. Custom Enum Types
- `user_role`: `'user'`, `'driver'`, `'admin'`
- `vehicle_category`: `'rickshaw'`, `'mini'`, `'cab'`, `'suv'`
- `booking_status`: `'pending'`, `'accepted'`, `'in_progress'`, `'completed'`, `'cancelled'`
- `ride_type`: `'solo'`, `'shared'`
- `payment_method`: `'cash'`, `'upi'`
- `waypoint_type`: `'pickup'`, `'dropoff'`
- `sos_status`: `'active'`, `'acknowledged'`, `'resolved'`
- `gender_type`: `'male'`, `'female'`, `'other'`

---

## 2. Security & Row-Level Security (RLS)
The database enforces strict RLS policies to replace the legacy prototype's unauthenticated data access:

1. **`profiles`**:
   - Any authenticated user can read public profile data (name, vehicle info for drivers).
   - Users can only edit their own profile.
   - Users cannot arbitrarily elevate themselves to `'admin'` via direct UPDATE (enforced by SQL triggers).

2. **`bookings`**:
   - Passengers can only view bookings they created or are joined in.
   - Assigned drivers can view bookings assigned to them.
   - Drivers with matching vehicle categories can view `status = 'pending'` bookings in the request queue.
   - Admins can query all bookings across the platform.

3. **`sos_alerts`**:
   - Any authenticated user can INSERT an alert with their user ID.
   - Only admins can read all alerts and update the status to `'acknowledged'` or `'resolved'`.

4. **`ratings`**:
   - Passengers can only rate a booking they completed.
   - Drivers cannot rate themselves or alter passenger ratings.

---

## 3. Atomic RPC Stored Procedures
To prevent race conditions during concurrent driver accepts or shared pool joins, the migration provides stored SQL functions:
- `create_booking(...)`: Creates booking, inserts primary passenger, and seeds origin/destination waypoints in one atomic transaction.
- `join_shared_ride(...)`: Locks the booking row `FOR UPDATE`, checks capacity, verifies proximity, adds co-passenger, and updates pooled fare.
- `accept_booking(...)`: Concurrency-safe driver assignment ensuring no two drivers accept the same ride.
- `verify_otp_and_start(...)`: Cryptographically checks the passenger OTP and transitions ride state.
- `complete_waypoint(...)`: Advances the stop progression and marks the booking completed once all stops are serviced.
- `cancel_booking(...)`: Verifies cancellation authorization and resets driver availability.
