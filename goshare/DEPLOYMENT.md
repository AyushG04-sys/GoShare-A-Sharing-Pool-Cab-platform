# 🚀 GoShare — Production Deployment Guidelines & System Audit

> **Platform**: GoShare Smart Sharing Pool Cab Platform  
> **Architecture**: Decoupled Monorepo (Node.js/Express API + React 19/Vite SPA + Supabase PostgreSQL)  
> **Status**: Deployment-Ready (Zero-Regression Verified, 58/58 Automated Tests Passing)

---

## 📋 Table of Contents
1. [Executive Audit Summary](#1-executive-audit-summary)
2. [Database Provisioning (Supabase PostgreSQL)](#2-database-provisioning-supabase-postgresql)
3. [Backend API Deployment](#3-backend-api-deployment)
   - [Option A: Render Web Service (Recommended)](#option-a-render-web-service-recommended)
   - [Option B: Railway / Fly.io](#option-b-railway--flyio)
   - [Option C: Docker Container / Self-Hosted](#option-c-docker-container--self-hosted)
   - [Option D: Traditional Linux VM (Ubuntu / EC2 with PM2 & Nginx)](#option-d-traditional-linux-vm-ubuntu--ec2-with-pm2--nginx)
4. [Frontend SPA Deployment](#4-frontend-spa-deployment)
   - [Option A: Vercel (Recommended)](#option-a-vercel-recommended)
   - [Option B: Netlify](#option-b-netlify)
   - [Option C: Nginx Static Server](#option-c-nginx-static-server)
5. [Environment Variables Matrix](#5-environment-variables-matrix)
6. [Post-Deployment Smoke Test Checklist](#6-post-deployment-smoke-test-checklist)
7. [Security & Operational Hardening](#7-security--operational-hardening)

---

## 1. Executive Audit Summary

The GoShare platform underwent a comprehensive production audit across all architectural tiers. The table below details the audit items and the hardening measures applied:

| Audit Domain | Pre-Audit Baseline | Production Hardening Applied |
|---|---|---|
| **API URL Dynamic Resolution** | Hardcoded `/api` dependent on local Vite proxy | Added `VITE_API_URL` environment variable support with clean fallback for same-origin/proxied deployments. |
| **Client-Side SPA Routing** | Direct route reload on `/login` or `/passenger` caused 404s on static hosts | Added `frontend/vercel.json` (rewrites & security headers) and `frontend/public/_redirects` for Netlify/Cloudflare. |
| **CORS Policy** | Simple origin reflection with potential wildcard conflict | Implemented multi-origin parser (`CORS_ORIGIN` supports comma-separated list of production domains). |
| **Cloud Health Probes** | Only `/api/health` available | Exposed `/health`, `/api/health`, and `/` root endpoint for automated cloud load balancers. |
| **Server Error Diagnostics** | 500 errors were muted in production (`isDev` check) | Configured server-side structured error logging on all 500+ errors while concealing stack traces from client JSON. |
| **Process Resilience** | No global exception hooks | Attached `unhandledRejection` and `uncaughtException` listeners for graceful shutdown without silent container exits. |
| **Containerization** | No container artifacts | Created production multi-stage `Dockerfile` for backend, Nginx-based `Dockerfile` for frontend, and root `docker-compose.yml`. |
| **Database Schema Accuracy** | Schema reference cited `stop_index` | Synchronized `stop_order` column naming across schema documentation and ORM service logic. |

---

## 2. Database Provisioning (Supabase PostgreSQL)

GoShare leverages Supabase for PostgreSQL, Row Level Security (RLS), real-time publications, and cryptographic authentication.

### Step-by-Step Database Setup:
1. **Create Supabase Project**:
   - Log into [Supabase Console](https://supabase.com).
   - Create a new project (e.g., `goshare-prod`). Select your desired region (e.g., `ap-south-1` for India / Mumbai).
   - Save your database password securely.

2. **Execute Database Migration**:
   - In your Supabase Dashboard, open the **SQL Editor** tab from the left navigation.
   - Click **New query**.
   - Copy the entire contents of [`goshare/database/migration.sql`](database/migration.sql) (868 lines).
   - Paste and click **Run**.
   - This idempotently creates:
     - 8 custom PostgreSQL ENUM types (`user_role`, `vehicle_category`, `booking_status`, `ride_type`, `payment_method`, `waypoint_type`, `sos_status`, `gender_type`).
     - Tables: `profiles`, `bookings`, `booking_passengers`, `booking_waypoints`, `ratings`, `sos_alerts`, `audit_logs`.
     - Spatial check constraints, foreign keys, and indexes.
     - Row Level Security (RLS) policies.
     - Real-time replication publications (`supabase_realtime`).

3. **Obtain API Keys**:
   - Navigate to **Project Settings** $\rightarrow$ **API**.
   - Note the following three values:
     - **Project URL**: `https://<your-project-id>.supabase.co`
     - **anon / public key**: `eyJh...`
     - **service_role key** (secret): `eyJh...` *(Keep confidential! Never expose in frontend code!)*

4. **Provision First Admin Account**:
   - In Supabase, navigate to **Authentication** $\rightarrow$ **Users**.
   - Add a user or register via the application once deployed.
   - Run this query in the SQL Editor to elevate the user to platform administrator:
     ```sql
     UPDATE public.profiles 
     SET role = 'admin' 
     WHERE id = '<USER_UUID>';
     ```

---

## 3. Backend API Deployment

### Option A: Render Web Service (Recommended)
Render provides free/inexpensive Node.js web services with automatic HTTPS and continuous deployment from Git.

1. Create a **New Web Service** connected to your GitHub repository.
2. Configure settings:
   - **Root Directory**: `goshare/backend` (or `backend` if deploying from subfolder)
   - **Environment**: `Node`
   - **Build Command**: `npm ci`
   - **Start Command**: `node src/server.js`
   - **Health Check Path**: `/health`
3. Add Environment Variables in the Render dashboard:
   ```env
   NODE_ENV=production
   PORT=5000
   CORS_ORIGIN=https://<your-frontend-domain>.vercel.app
   SUPABASE_URL=https://<your-project-id>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```
4. Click **Deploy**. Note the assigned service URL (e.g. `https://goshare-api.onrender.com`).

---

### Option B: Railway / Fly.io

#### For Railway:
1. Create a new project pointing to your repository.
2. Set Root Directory to `goshare/backend`.
3. Add the environment variables specified in the [Environment Variables Matrix](#5-environment-variables-matrix).
4. Railway will automatically detect Node.js, run `npm start`, and bind to `0.0.0.0:$PORT`.

#### For Fly.io:
1. In `goshare/backend`, run:
   ```bash
   fly launch
   ```
2. Set secrets using the Fly CLI:
   ```bash
   fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SUPABASE_ANON_KEY=... CORS_ORIGIN=...
   ```
3. Run `fly deploy`.

---

### Option C: Docker Container / Self-Hosted

Deploy both backend and frontend via Docker Compose:

1. Create a `.env` file in `goshare/`:
   ```env
   SUPABASE_URL=https://<your-project-id>.supabase.co
   SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   ```
2. Start the services:
   ```bash
   docker compose up --build -d
   ```
3. Verify status:
   ```bash
   docker compose ps
   curl http://localhost:5000/health
   ```

---

### Option D: Traditional Linux VM (Ubuntu / EC2 with PM2 & Nginx)

1. **Install Node.js & PM2**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx
   sudo npm install -g pm2
   ```

2. **Deploy Backend**:
   ```bash
   cd /var/www/goshare/backend
   npm ci --omit=dev
   pm2 start src/server.js --name "goshare-api" --instances max
   pm2 save
   pm2 startup
   ```

3. **Configure Nginx Reverse Proxy** (`/etc/nginx/sites-available/goshare`):
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
4. **Issue Free SSL via Certbot**:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d api.yourdomain.com
   ```

---

## 4. Frontend SPA Deployment

### Option A: Vercel (Recommended)

1. Go to [Vercel](https://vercel.com) and click **Add New** $\rightarrow$ **Project**.
2. Select your repository.
3. Configure the project:
   - **Root Directory**: `goshare/frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add Environment Variable:
   - `VITE_API_URL` = `https://<your-backend-api-domain>` (e.g. `https://goshare-api.onrender.com` — **NO trailing slash**)
5. Click **Deploy**. Vercel will automatically read `vercel.json` to handle client-side routing on all pages without 404s.

---

### Option B: Netlify

1. Go to [Netlify](https://app.netlify.com) $\rightarrow$ **Add new site** $\rightarrow$ **Import from Git**.
2. Configure settings:
   - **Base directory**: `goshare/frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `goshare/frontend/dist`
3. Environment variables:
   - `VITE_API_URL` = `https://<your-backend-api-domain>`
4. Deploy! The pre-packaged `public/_redirects` file automatically copies to `dist/_redirects` to route all traffic to `/index.html`.

---

### Option C: Nginx Static Server

1. Build the production bundle:
   ```bash
   cd goshare/frontend
   VITE_API_URL=https://api.yourdomain.com npm run build
   ```
2. Copy the resulting `dist/` directory to `/var/www/goshare/frontend/dist`.
3. Use the included configuration in `frontend/nginx.conf`. Ensure `try_files $uri $uri/ /index.html;` is present so route reloads work properly.

---

## 5. Environment Variables Matrix

### Backend (`goshare/backend/.env`)
| Variable | Description | Example / Default | Required? |
|---|---|---|:---:|
| `NODE_ENV` | Runtime environment mode | `production` | Yes |
| `PORT` | Listening HTTP port | `5000` | Auto on cloud |
| `CORS_ORIGIN` | Allowed origins (comma-separated or single) | `https://goshare.vercel.app` | Yes |
| `SUPABASE_URL` | Supabase Project REST URL | `https://xyz.supabase.co` | Yes |
| `SUPABASE_ANON_KEY` | Public anonymous key | `eyJhb...` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret administrative key | `eyJhb...` | Yes |

### Frontend (`goshare/frontend/.env` or Host Settings)
| Variable | Description | Example / Default | Required? |
|---|---|---|:---:|
| `VITE_API_URL` | Base URL of deployed backend | `https://goshare-api.onrender.com` | Yes (for separate hosts) |

> [!IMPORTANT]
> Never set `SUPABASE_SERVICE_ROLE_KEY` in frontend environment variables. It has unrestricted database access and must remain strictly on the backend server.

---

## 6. Post-Deployment Smoke Test Checklist

Execute these 7 smoke tests once deployed to guarantee full operational integrity:

- [ ] **1. API Health Check**:
  - Request: `GET https://your-backend-api/health`
  - Expected: `200 OK` with JSON `{"status": "ok", "service": "GoShare Ride-Sharing API", "env": "production"}`.

- [ ] **2. Single Page Application (SPA) Deep Link Reload**:
  - Open browser directly to `https://your-frontend/login` and refresh.
  - Expected: The login screen displays without any 404 HTTP errors.

- [ ] **3. One-Click Faculty Demo Login**:
  - Click **"Demo Passenger"** on the login screen.
  - Expected: Instant authentication redirecting to the Passenger Dashboard with profile data loaded.

- [ ] **4. Geodesic Fare Calculation & Booking**:
  - In Passenger Dashboard, enter Pickup: `Nashik Road Station`, Dropoff: `College Road Center`.
  - Select vehicle class (e.g. `Cab`), select `Shared Ride`.
  - Verify fare slab discount is displayed correctly (e.g., 20% or 35% discount).
  - Click **Book Ride**.
  - Expected: Booking created in `pending` status with a 4-digit PIN generated.

- [ ] **5. Driver Proximity & Shared Pool Acceptance**:
  - Open an incognito window, log in as **"Demo Driver"** (`driver@goshare.demo`).
  - Toggle driver to **Online**.
  - In requests section, click **Accept**.
  - Verify driver dashboard displays active ride with 1 seat filled (`passenger_count: 1`, `max: 2`).
  - From a second passenger account, request a shared ride along a nearby corridor.
  - Expected: The driver console displays **"AVAILABLE FOR SHARED POOL (1 SEAT AVAILABLE)"** with the button `[🤝 Accept & Add to Shared Pool]`.
  - Click accept: verify passenger count updates to 2/2 and the 4-stop optimized route is displayed.

- [ ] **6. 4-Stop Sequenced Route Navigation**:
  - Verify map renders numbered markers (Stops 1 & 2 in Emerald Green for pickups, Stops 3 & 4 in Coral Red for dropoffs).
  - Verify driver can enter passenger OTP and progress through each stop sequentially.

- [ ] **7. Emergency SOS Dispatch**:
  - Click the **SOS** button during an active ride.
  - Expected: Alert confirmed immediately.
  - Log in as **"Demo Admin"** (`admin@goshare.demo`) $\rightarrow$ verify incident shows up in real time on the admin SOS monitor with `Acknowledge` and `Resolve` controls.

---

## 7. Security & Operational Hardening

1. **Strict CORS Policy**:
   - In production, set `CORS_ORIGIN` specifically to your frontend's canonical domain (e.g. `https://goshare.yourdomain.com`). Avoid wildcard `*` when credentials/cookies are active.

2. **Database Connection Resilience**:
   - The Supabase client in `backend/src/config/supabase.js` utilizes isolated sessions for user operations to prevent privilege escalation.

3. **Production Rate Limiting & Edge Protection**:
   - If using a custom domain, routing traffic through Cloudflare provides free automated DDoS mitigation, HTTP/3, and edge caching for static assets.

4. **Database Backup Strategy**:
   - Supabase automatically performs daily database backups. In addition, you can trigger manual SQL dumps using `pg_dump` or the Supabase CLI:
     ```bash
     supabase db dump -f goshare_backup_$(date +%F).sql
     ```
