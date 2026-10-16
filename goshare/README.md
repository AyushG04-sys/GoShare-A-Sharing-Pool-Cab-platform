# GoShare — A Smart Sharing Pool Cab Platform

[![Tests](https://img.shields.io/badge/tests-58%20passed-brightgreen.svg)]()
[![Backend](https://img.shields.io/badge/backend-Node.js%20%7C%20Express-blue.svg)]()
[![Frontend](https://img.shields.io/badge/frontend-React%2019%20%7C%20Vite-61dafb.svg)]()
[![Database](https://img.shields.io/badge/database-Supabase%20PostgreSQL-3ecf8e.svg)]()

> **GoShare** is an intelligent, full-stack ride-sharing and cab-pooling platform reconstructed from the ground up to solve urban congestion and commuter costs in Pune. It features geodesic proximity matching, slab-based fare division with up to 35% savings, cryptographic OTP verification, Leaflet live routing, and emergency SOS dispatch.

---

## 🚀 Quick Start for Faculty & Evaluators

The application is fully runnable locally with **zero external setup required** for initial demonstration, featuring instant one-click demo credentials.

### 1. Prerequisites
- **Node.js** v18+ (tested on v24.9)
- **npm** v9+ (tested on v11.6)

### 2. Start the Backend API Server
```bash
cd backend
npm install
npm run dev
# Server runs on http://localhost:5000
```

### 3. Start the Frontend Application
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

### 4. Open in Browser
Visit **`http://localhost:5173`** to access the GoShare platform!

---

## 🐳 Docker Production Quick Start

Deploy the entire full-stack application (Nginx frontend + Node.js API backend) with one command:

```bash
# In the goshare root directory:
docker compose up --build -d

# Frontend: http://localhost:80
# Backend API: http://localhost:5000
# Health Check: http://localhost:5000/health
```

---

## 🎓 One-Click Faculty Demo Portals

For grading convenience without registering email accounts, click any of the evaluation buttons on the landing page or login screen:

| Role | Demo Credentials | Capabilities |
|---|---|---|
| **Passenger** | `passenger@goshare.demo` | Search Pune hubs, calculate slab fares, book solo/shared rides, view route on Leaflet map, view 4-digit PIN, trigger emergency SOS, rate drivers. |
| **Driver** | `driver@goshare.demo` | Toggle online availability, simulate GPS movement, accept incoming ride requests, verify passenger PIN, progress sequential waypoints, view earnings dashboard. |
| **Admin** | `admin@goshare.demo` | View platform KPIs, monitor live emergency SOS incidents with acknowledge/resolve buttons, inspect driver leaderboard, view all system bookings, manage user roles. |

---

## 🧪 Automated Test Suite

GoShare includes an automated Jest test suite verifying critical mathematical, safety, and security business rules:

```bash
cd backend
npm test
```

### Test Coverage Summary (58 Tests Across 7 Suites):
- **`tests/fare.test.js`**: Slab tier calculations (Rickshaw, Mini, Cab, SUV across 0-3km, 3-7km, >7km), 1.5× solo multiplier, and tiered shared discounts (10%, 20%, 35%).
- **`tests/geo.test.js`**: Haversine geodesic distance, bearing angle calculations, and urban ETA estimation at 25 km/h.
- **`tests/otp.test.js`**: Cryptographic 4-digit code generation, SHA-256 hashing, and constant-time timing-safe verification.
- **`tests/matching.test.js`**: Proximity filters (≤3km pickup, ≤4km dropoff), vehicle class filtering, and vehicle pool capacity limits.
- **`tests/gender_matching.test.js`**: Bidirectional female driver safety matching.
- **`tests/targeted_fixes.test.js`**: Targeted regressions, OTP isolation, and real-time state integrity.
- **`tests/shared_cab_fixes.test.js`**: Multi-request pool cab acceptance, 4-waypoint route sequencing, and capacity management.

**Results: 7 Test Suites Passed, 58 Tests Passed (100% Pass Rate).**

---

## 🏗️ Architecture Overview

```
pbl/
├── GoShare-A-Sharing-Pool-Cab-platform-main/   # Original legacy prototype (preserved intact)
└── goshare/                                      # NEW RECONSTRUCTION
    ├── backend/                                  # Modular Node.js + Express API
    │   ├── src/
    │   │   ├── config/                           # Environment & Supabase config
    │   │   ├── middleware/                       # Auth, Role-based Access, Validation, Error Handling
    │   │   ├── routes/                           # Auth, Bookings, Driver, Admin, SOS, Ratings
    │   │   ├── services/                         # Fare, Matching, Booking, OTP, Routing, SOS
    │   │   ├── utils/                            # Geo math, Error classes
    │   │   ├── app.js                            # Express app setup
    │   │   └── server.js                         # HTTP server entrypoint
    │   ├── tests/                                # 21 Automated Jest unit tests
    │   ├── .env.example
    │   └── package.json
    │
    ├── frontend/                                 # Modern React + Vite SPA
    │   ├── src/
    │   │   ├── components/
    │   │   │   ├── common/                       # Navbar, Spinner, ErrorBanner, Modal
    │   │   │   ├── map/                          # Leaflet InteractiveMap with custom markers
    │   │   │   ├── booking/                      # VehicleSelector, FareBreakdown
    │   │   │   └── ride/                         # ActiveRideCard, RatingModal
    │   │   ├── context/                          # AuthContext, ThemeContext (Dark/Light)
    │   │   ├── pages/
    │   │   │   ├── LandingPage.jsx               # Hero, live calculator, demo buttons
    │   │   │   ├── auth/                         # Login & Register
    │   │   │   ├── passenger/                    # PassengerDashboard, RideHistoryPage
    │   │   │   ├── driver/                       # DriverDashboard, DriverEarningsPage
    │   │   │   └── admin/                        # AdminDashboard (SOS monitor, leaderboard)
    │   │   ├── services/                         # Unified API & OpenStreetMap/OSRM service
    │   │   ├── utils/                            # Client-side fare engine
    │   │   ├── App.jsx                           # Route controller & layout
    │   │   ├── main.jsx                          # Root DOM mount
    │   │   └── index.css                         # Glassmorphic CSS design system
    │   ├── index.html
    │   ├── vite.config.js
    │   └── package.json
    │
    └── database/
        ├── migration.sql                         # Complete 868-line Supabase SQL schema
        └── README.md                             # Entity relationship model & ERD diagram
```

---

## 📊 Authoritative Fare Engine & Slab Rules

The conflicting fare formulas from the legacy prototype have been consolidated into an authoritative distance-slab pricing engine matching project specifications:

### 1. Distance Slab Base Rates

| Vehicle Class | Seats | 0–3 km | 3–7 km | > 7 km |
|---|:---:|:---:|:---:|:---:|
| **Auto Rickshaw** | 3 | ₹20 | ₹40 | ₹40 + (km - 7) × ₹8/km |
| **Mini Hatchback** | 4 | ₹40 | ₹80 | ₹80 + (km - 7) × ₹12/km |
| **Prime Sedan (Cab)** | 4 | ₹60 | ₹120 | ₹120 + (km - 7) × ₹15/km |
| **Prime SUV** | 6 | ₹80 | ₹150 | ₹150 + (km - 7) × ₹20/km |

### 2. Multipliers & Shared Discounts
- **Solo Ride**: `Base Slab Fare × 1.5`
- **Shared Ride Pool Discounts**:
  - Base Fare ≥ ₹80: **35% Discount** (× 0.65)
  - Base Fare ≤ ₹40: **10% Discount** (× 0.90)
  - Base Fare ₹41–₹79: **20% Discount** (× 0.80)

---

## 🔐 Key Security Upgrades

1. **Server-Side Cryptographic OTP**:
   - Replaced `Math.random()` client-side generation with Node `crypto.randomInt()`.
   - Stored in database exclusively as a 64-character SHA-256 hash.
   - Verified in constant time using `crypto.timingSafeEqual()`.
   - Driver never sees the OTP in API responses until the passenger gives it to them verbally.
2. **Role-Based Access Control**:
   - Prevents users from self-assigning `'admin'` privileges during registration.
   - Enforces driver-only routes (`/api/driver/*`) and admin-only portals (`/api/admin/*`, `/api/sos/*`).
3. **Emergency SOS Broadcast**:
   - Tying emergency alerts to live booking IDs and latitude/longitude coordinates.
   - Immediate administrative notification and escalation workflow.

---

## 🗄️ Supabase Production Setup (Optional)

To connect GoShare to a live Supabase cloud project:
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in Supabase and run the entire script in [`database/migration.sql`](file:///c:/Users/ayush/OneDrive/Desktop/pbl/goshare/database/migration.sql).
3. In `backend/.env`, set:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
4. Restart the backend server.
