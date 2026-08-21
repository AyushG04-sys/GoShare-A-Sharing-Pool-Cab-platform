# 🚖 GoShare — A Sharing Pool Cab Platform

> **Share rides. Save money.** A pure-frontend, mobile-first ride-pooling prototype that matches riders heading the same way, splits costs automatically, and gives both passengers and drivers a live, map-based experience — without a single line of backend code.

![Status](https://img.shields.io/badge/status-prototype-yellow)
![Stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Leaflet-blue)
![Storage](https://img.shields.io/badge/persistence-localStorage-orange)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ What is GoShare?

GoShare is a **zero-backend ride-sharing web application** built as a project-based learning exercise. It demonstrates the complete lifecycle of a ride-hailing platform — search, booking, driver assignment, live tracking, ride completion, rating, and admin oversight — entirely in the browser using `localStorage` as the data layer and a single open browser tab/second tab as the live "server".

### Core Idea

When two riders book a trip with **similar pickup (within 5 km)** and **similar drop (within 1.5 km)**, the app automatically applies a **25% discount** to both fares and groups them under the same driver. Drivers see incoming passenger requests in real time, accept/reject them, verify a 4-digit pickup OTP, and complete rides.

---

## 🎯 Key Features

### 👤 For Riders (Users)
- 🔐 **Phone + OTP login** (OTP is simulated — shown in an alert, never sent)
- 📍 **3 ways to set pickup**: browser GPS, draggable user marker, or pin on the map
- 🔍 **Live place autocomplete** via OpenStreetMap Nominatim (debounced, 1 req/sec rate-limited)
- 🛣️ **Real road distance & ETA** via OSRM (with Haversine fallback)
- 🚗 **4 vehicle categories**: Auto Rickshaw (3 seats), Mini (4), Cab (4), SUV (6)
- 💸 **Auto fare calculation** with distance slabs — solo vs shared pricing
- 🤝 **Live share detection** — count of nearby co-riders + savings amount shown before booking
- 🆘 **One-tap SOS Emergency** — broadcasts user/driver/location to admin panel
- ⭐ **5-star rating** after ride completion
- 📜 **Ride history** modal with date, route, fare, rating
- 🌙 **Light/Dark mode** persisted across sessions
- 🔎 **Fit-to-route** auto-zoom for pickup, drop, and live driver positions

### 🚕 For Drivers
- 📄 **Mandatory KYC at signup**: driver photo, driving license, RC book, insurance (file uploads)
- 🚙 **Vehicle profile** (type + plate) — only matching requests show up
- 🟢 **Online/Offline toggle** — only available drivers see incoming requests
- 📋 **Request cards** with passenger name, distance, and fare
- 🔢 **4-digit OTP verification** at pickup (matches with rider)
- 📍 **"Show Route on Map"** for both approach (orange dashed) and trip (blue solid)
- 💰 **Daily stats**: total earnings, trip count, average rating
- 📜 **Completed-trip history** with passenger + rating received
- 🔄 **Logout cleanup** — releases in-progress rides back to "Searching..." state

### 🛡️ For Admins
- 📊 **Global driver leaderboard**: trips, earnings, average rating
- 🚨 **Live SOS alert feed** with passenger/driver/plate/timestamp + one-click Google Maps link to live coordinates
- 🔔 **Cross-tab real-time sync** — SOS from rider tab instantly appears on admin tab

---

## 🧰 Tech Stack

| Layer            | Technology                                                     |
| ---------------- | -------------------------------------------------------------- |
| **Frontend**     | Vanilla HTML5, CSS3, JavaScript (ES6+) — no frameworks         |
| **Mapping**      | [Leaflet.js](https://leafletjs.com/) + OpenStreetMap tiles     |
| **Geocoding**    | [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap) |
| **Routing/ETA**  | [OSRM](https://project-osrm.org/) public demo server           |
| **Persistence**  | `localStorage` (simulated DB with cross-tab `storage` events)  |
| **Auth**         | Client-side simulated OTP (no server)                          |
| **Build Tools**  | None — just open `index.html`                                  |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Tabs                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  index.html  │  │  user.html   │  │ driver.html  │       │
│  │  (Login)     │  │  (Rider UI)  │  │ (Driver UI)  │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────┐         │
│  │           store.js (localStorage DB)           │         │
│  │  • rideShareBookings[]                         │         │
│  │  • sosAlerts[]                                 │         │
│  │  • rideUser (current session)                  │         │
│  └────────────────────┬────────────────────────────┘         │
│                       │  storage event                      │
│                       ▼                                     │
│                ┌──────────────┐  ┌──────────────┐            │
│                │  admin.html  │  │ Any open tab │            │
│                │  (Live SOS + │  │ refreshes    │            │
│                │   Stats)     │  │ instantly    │            │
│                └──────────────┘  └──────────────┘            │
│                                                             │
│  External: Nominatim (geocode) ─┐                           │
│            OSRM (route) ────────┴──► Read-only public APIs  │
└─────────────────────────────────────────────────────────────┘
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

### Option 1 — Open directly
Just double-click `index.html`. Everything works **except** Nominatim/OSRM reverse geocoding (browsers block `fetch` from `file://` for those endpoints). Forward search and routing will still work in most cases.

### Option 2 — Local web server (recommended)
Any static server works. Pick one:

```bash
# Python 3
python -m http.server 8000

# Node.js (with npx)
npx serve .

# VS Code
# Install "Live Server" extension → right-click index.html → "Open with Live Server"
```

Then open <http://localhost:8000> in your browser.

### Test the full flow
1. **Tab A** → open `index.html` → select **User** → enter name & phone → any 4-digit OTP → land on rider map
2. **Tab B** → open `index.html` → select **Driver** → fill vehicle details, upload any image for documents → login → land on driver map
3. In Tab A, search for a pickup and drop, choose a vehicle, click **Confirm Ride**
4. In Tab B, go **Online** → click the matching passenger card → **Accept**
5. In Tab B, enter the OTP shown in Tab A's modal → click **Verify** → **Mark as Completed**
6. In Tab A, rate the driver → ride appears in **History**
7. Open `admin.html` in a third tab → see the driver in the leaderboard

### Test ride-sharing
Open 2 user tabs with different phone numbers + 1 driver tab. Both users search for **nearby** pickup and **nearby** drop (< 5 km apart for pickup, < 1.5 km apart for drop). The second user to confirm will see a **"Share -25%"** badge and a reduced fare.

---

## 📂 Project Structure

```
pbl/
├── index.html         # Login screen (user/driver tabs, OTP, KYC uploads)
├── user.html          # Rider dashboard — map, search, ride options, SOS
├── driver.html        # Driver dashboard — online toggle, request feed, stats
├── admin.html         # Admin panel — driver leaderboard, live SOS feed
│
├── config.js          # Vehicle catalog + slab-based fare engine
├── store.js           # localStorage wrapper + cross-tab sync
├── auth.js            # (Legacy alt-login flow — index.html uses inline script)
├── geocode.js         # Nominatim + OSRM client with rate limiter
├── app.js             # Rider-side logic (search, booking, ride polling)
├── driver.js          # Driver-side logic (request feed, OTP, completion)
├── admin.js           # Admin-side logic (driver stats, SOS listener)
│
├── styles.css         # Shared design system + dark-mode variables
├── leaflet.css        # Leaflet default styles
├── leaflet.js         # Leaflet library (vendored)
└── test-map.html      # Quick Leaflet smoke test page
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

Sharing eligibility: another rider's pickup within **5 km** of yours **AND** drop within **1.5 km** of yours, both with an active/accepted/in-progress booking.

---

## 🎨 Design Highlights

- **CSS variables for theming** — entire dark mode is a one-attribute toggle on `<body>`
- **Custom Leaflet markers** with HTML/CSS (`divIcon`) — glowing dots, vehicle emoji bubbles
- **Animated driver approach** — markers step along the OSRM polyline at ~300ms intervals
- **Modal system** — `.modal.hidden` pattern for ride confirmation, rating, history, request
- **Responsive sidebar + map** layout with `position: absolute` overlays
- **No CSS framework** — every component is hand-styled in `styles.css`

---

## ⚠️ Limitations & Honest Caveats

This is a **learning prototype**, not production software. Be aware:

- 🔐 **No real authentication.** OTP is shown in a `alert()`. Any user can become any driver.
- 💾 **`localStorage` is per-browser.** No real database, no multi-device sync. Two browsers won't see each other.
- 🚦 **"Other riders"** are only matched within the same browser (same `localStorage` origin).
- 🗺️ **Public OSRM/Nominatim** — rate-limited and meant for demos. Don't deploy publicly without self-hosting or using a paid plan.
- 📂 **Uploaded documents** are stored only as file inputs, not uploaded anywhere.
- 🔒 **No payment processing.** Fares are displayed but never charged.
- 🌐 **Cross-tab sync works** via the `storage` event — but only for tabs open at the same time, in the same browser.

---

## 🛣️ Possible Next Steps

- [ ] Add a real backend (Node + Express + Socket.io for live driver positions)
- [ ] Replace OTP simulation with Twilio/Firebase Phone Auth
- [ ] Persist documents to S3/Cloudinary instead of file inputs
- [ ] Add a payment gateway (Razorpay / Stripe) for fares
- [ ] Driver-side turn-by-turn navigation via OSRM
- [ ] Heatmap of ride demand for drivers
- [ ] WebSocket-based live driver location instead of polling every 1.5s
- [ ] PWA manifest + service worker for offline map tiles

---

## 📜 License

MIT — do whatever you want, no warranty. If you build something cool on top of this, a star on the repo would be lovely.

---

## 🙋 Author

**Ayush Gaikwad** — [@AyushG04-sys](https://github.com/AyushG04-sys)

Built as a project-based learning (PBL) exercise in ride-sharing platform design.
