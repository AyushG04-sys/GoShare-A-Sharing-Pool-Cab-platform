# 🚖 GoShare — A Sharing Pool Cab Platform

> **Share rides. Save money.** A mobile-first ride-pooling platform that matches riders heading the same way, splits costs automatically, and provides both passengers and drivers a live, map-based experience.

![Status](https://img.shields.io/badge/status-prototype-yellow)
![Stack](https://img.shields.io/badge/stack-Node.js%20%2B%20Vanilla%20JS%20%2B%20Leaflet-blue)
![Storage](https://img.shields.io/badge/persistence-JSON%20DB-orange)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ What is GoShare?

GoShare is a ride-sharing web application built as a project-based learning exercise. It demonstrates the complete lifecycle of a ride-hailing platform — search, booking, driver assignment, live tracking, ride completion, rating, and admin oversight — powered by a Node.js backend and a Leaflet-based mapping frontend.

### Core Idea

When two riders book a trip with **similar pickup (within 5 km)** and **similar drop (within 1.5 km)**, the app automatically applies a **25% discount** to both fares and groups them under the same driver. Drivers see incoming passenger requests in real time, accept/reject them, verify a 4-digit pickup OTP, and complete rides.

---

## 🎯 Key Features

### 👤 For Riders (Users)
- 🔐 **Authentication**: Secure login and session management.
- 📍 **Flexible Pickup**: Browser GPS, draggable user marker, or pin on the map.
- 🔍 **Live place autocomplete**: Powered by OpenStreetMap Nominatim.
- 🛣️ **Real road distance & ETA**: Via OSRM (with Haversine fallback).
- 🚗 **Vehicle Categories**: Auto Rickshaw (3 seats), Mini (4), Cab (4), SUV (6).
- 💸 **Smart Fare Engine**: Auto calculation with distance slabs and solo vs shared pricing.
- 🤝 **Live Share Detection**: Real-time count of nearby co-riders + savings shown before booking.
- 🆘 **SOS Emergency**: One-tap broadcast to the admin panel.
- ⭐ **Post-Ride Feedback**: 5-star rating system and detailed ride history.
- 🌙 **Theming**: Light/Dark mode persisted across sessions.

### 🚕 For Drivers
- 📄 **KYC Integration**: Mandatory driver profile with photo, license, and insurance uploads.
- 🚙 **Vehicle Profiling**: Only matching vehicle types receive ride requests.
- 🟢 **Availability Toggle**: Online/Offline status to control request flow.
- 📋 **Request Management**: Real-time cards with passenger details and fares.
- 🔢 **OTP Verification**: 4-digit secure pickup verification.
- 📍 **Route Visualization**: Dedicated paths for approach and trip legs.
- 💰 **Earnings Dashboard**: Daily stats for total earnings, trip count, and ratings.

### 🛡️ For Admins
- 📊 **Performance Analytics**: Global driver leaderboard based on trips and ratings.
- 🚨 **Emergency Response**: Live SOS alert feed with one-click Google Maps location tracking.
- 🔔 **Real-time Monitoring**: Instant sync of alerts and platform activity.

---

## 🧰 Tech Stack

| Layer            | Technology                                                     |
| ---------------- | -------------------------------------------------------------- |
| **Frontend**     | Vanilla HTML5, CSS3, JavaScript (ES6+)                         |
| **Backend**      | [Node.js](https://nodejs.org/) + [Express.js](https://expressjs.com/) |
| **Database**     | JSON-based storage (`db.json`)                                   |
| **Mapping**      | [Leaflet.js](https://leafletjs.com/) + OpenStreetMap tiles     |
| **Geocoding**    | [Nominatim](https://nominatim.openstreetmap.org/)               |
| **Routing/ETA**  | [OSRM](https://project-osrm.org/) public demo server           |
| **Auth**         | JSON Web Tokens (JWT) / Session-based auth                      |

---

## 🏗️ Architecture

```
      ┌──────────────────────────┐          ┌──────────────────────────┐
      │      Client (Web)        │          │      Server (Node)     │
      │  ┌────────────────────┐  │          │  ┌──────────────────┐   │
      │  │  Rider Dashboard   │  │  HTTP    │  │   Express API    │   │
      │  ├────────────────────┤  │  REST    │  ├──────────────────┤   │
      │  │  Driver Dashboard │  │ <──────> │  │   Auth Middleware │   │
      │  ├────────────────────┤  │          │  └────────┬─────────┘   │
      │  │  Admin Panel       │  │          │            │             │
      │  └────────────────────┘  │          │  ┌─────────▼─────────┐   │
      └──────────────────────────┘          │  │   JSON Database    │   │
                                           │  │     (db.json)      │   │
                                           │  └────────────────────┘   │
                                           └──────────────────────────┘
                                                        ▲
                                                        │
                                           ┌────────────┴────────────┐
                                           │     External APIs        │
                                           │ (Nominatim, OSRM, OSM)   │
                                           └──────────────────────────┘
```

### Booking State Machine

```
        ┌────────┐  driver accepts  ┌──────────┐  OTP verified  ┌──────────────┐
 create │ active │ ───────────────► │ accepted │ ─────────────► │ in_progress  │
 ──────► │        │                  │          │                │              │
        └────────┘                  └──────────┘                └──────┬───────┘
            ▲                            ▲                            │
            │ cancel                     │ logout releases            │ driver marks
            │                            │                            │ complete
            └────────────────────────────┴────────────────────────────┘
                                                                      │
                                                                      ▼
                                                                ┌───────────┐
                                                                │ completed │
                                                                └───────────┘
```

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/AyushG04-sys/GoShare-A-Sharing-Pool-Cab-platform.git
cd GoShare-A-Sharing-Pool-Cab-platform
```

### 2. Setup the Backend
```bash
cd backend
npm install
npm start
```
The server will typically start on `http://localhost:3000` (check `server.js` for the port).

### 3. Run the Frontend
Since the frontend uses `fetch` calls to the backend and external APIs, you **must** run it via a local web server:
- **VS Code**: Right-click `index.html` $\rightarrow$ "Open with Live Server".
- **Python**: `python -m http.server 8000`
- **Node**: `npx serve .`

Then open `http://localhost:8000` (or your server's port) in your browser.

### Test the full flow
1. **User Tab**: Open `index.html` $\rightarrow$ User $\rightarrow$ Login $\rightarrow$ Book a ride.
2. **Driver Tab**: Open `index.html` $\rightarrow$ Driver $\rightarrow$ Login $\rightarrow$ Go Online $\rightarrow$ Accept Ride $\rightarrow$ Verify OTP $\rightarrow$ Complete.
3. **Admin Tab**: Open `admin.html` $\rightarrow$ Monitor SOS and Leaderboard.

---

## 📂 Project Structure

```
pbl/
├── backend/
│   ├── server.js            # Express server & API endpoints
│   └── db.json              # JSON database for users, rides, and logs
│
├── admin.html               # Admin panel UI
├── admin.js                 # Admin logic (stats, SOS listener)
├── driver.html              # Driver dashboard UI
├── driver.js               # Driver logic (request feed, OTP, completion)
├── user.html                # Rider dashboard UI
├── app.js                  # Rider logic (search, booking, ride polling)
│
├── index.html               # Landing/Login page (User/Driver entry)
├── auth.js                  # Authentication handlers
├── config.js                # Vehicle catalog & fare engine
├── store.js                 # Client-side state management
├── geocode.js               # Mapping & Routing API clients
│
├── styles.css               # Global design system & themes
├── leaflet.css / .js        # Mapping library
└── package.json             # Project dependencies
```

---

## 💰 Fare Engine (`config.js`)

Distance-slab pricing in INR. Shared rides pay the **base** amount; solo rides pay `base × 1.5`.

| Vehicle      | 0–3 km | 3–7 km  | Beyond 7 km      | Capacity |
| ------------ | ------ | ------- | ---------------- | -------- |
| Auto Rickshaw 🛺 | ₹20    | ₹40     | ₹40 + ₹8/km    | 3        |
| Mini 🚗          | ₹40    | ₹80     | ₹80 + ₹12/km   | 4        |
| Cab 🚖           | ₹60    | ₹120    | ₹120 + ₹15/km  | 4        |
| SUV 🚙           | ₹80    | ₹150    | ₹150 + ₹20/km  | 6        |

Sharing eligibility: another rider's pickup within **5 km** of yours **AND** drop within **1.5 km** of yours.

---

## ⚠️ Limitations & Honest Caveats

This is a **learning prototype**. Be aware:
- 💾 **Data Persistence**: Uses a simple JSON file; not suitable for high-concurrency production environments.
- 🗺️ **Public APIs**: Uses public OSRM/Nominatim servers which are rate-limited.
- 🔒 **Security**: Basic authentication implemented; requires further hardening for production.
- 📂 **Document Uploads**: KYC files are handled as simulated uploads.

---

## 🛣️ Possible Next Steps
- [ ] Implement WebSockets (Socket.io) for real-time driver movement.
- [ ] Integrate a real payment gateway (Razorpay / Stripe).
- [ ] Add a native mobile app using React Native or Flutter.
- [ ] Implement advanced ride-matching algorithms.

---

## 📜 License
MIT — do whatever you want, no warranty.

---

## 🙋 Author
**Ayush Gaikwad** — [@AyushG04-sys](https://github.com/AyushG04-sys)
Built as a project-based learning (PBL) exercise in ride-sharing platform design.
