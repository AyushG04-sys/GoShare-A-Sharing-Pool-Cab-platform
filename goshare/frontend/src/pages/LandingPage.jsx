import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { PRESET_LOCATIONS, haversineDistance } from '../services/map.service.js';
import { VEHICLE_CONFIG, calculateFare } from '../utils/fare.js';
import {
  Users,
  ShieldCheck,
  TrendingDown,
  Navigation,
  KeyRound,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Zap,
} from 'lucide-react';

export default function LandingPage({ onNavigate }) {
  const { demoLogin, isAuthenticated, role } = useAuth();
  const [calcPickup, setCalcPickup] = useState(PRESET_LOCATIONS[0]);
  const [calcDrop, setCalcDrop] = useState(PRESET_LOCATIONS[1]);
  const [calcVehicle, setCalcVehicle] = useState('cab');
  const [calcRideType, setCalcRideType] = useState('shared');

  const calcDist = Math.round(
    haversineDistance(calcPickup.lat, calcPickup.lng, calcDrop.lat, calcDrop.lng) * 100
  ) / 100;
  const calcBreakdown = calculateFare(calcVehicle, calcDist);

  const handleDemoAccess = async (targetRole) => {
    await demoLogin(targetRole);
    if (targetRole === 'user' || targetRole === 'user2') onNavigate('passenger');
    else if (targetRole === 'driver') onNavigate('driver');
    else if (targetRole === 'admin') onNavigate('admin');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem', paddingBottom: '4rem' }}>
      {/* Hero Section */}
      <section
        style={{
          background: 'radial-gradient(ellipse at 50% 20%, rgba(37, 99, 235, 0.2), transparent 70%)',
          padding: 'clamp(2.5rem, 6vw, 4rem) 1rem 2rem',
          textAlign: 'center',
        }}
      >
        <div className="container" style={{ maxWidth: 960 }}>
          <div
            className="badge badge-primary"
            style={{ marginBottom: '1.25rem', padding: '0.4rem 1rem', fontSize: '0.8rem', maxWidth: '100%', whiteSpace: 'normal', lineHeight: 1.4 }}
          >
            <Sparkles size={14} style={{ flexShrink: 0 }} /> Full-Stack Production Architecture • Rebuilt from Legacy
          </div>

          <h1
            style={{
              fontSize: 'clamp(1.85rem, 6vw, 3.8rem)',
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              marginBottom: '1.25rem',
            }}
          >
            Smart Cab Pooling with{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #60a5fa, #2563eb, #10b981)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Proximity Matching
            </span>
          </h1>

          <p
            style={{
              fontSize: '1.15rem',
              color: 'var(--text-secondary)',
              maxWidth: 720,
              margin: '0 auto 2rem',
              lineHeight: 1.6,
            }}
          >
            GoShare cuts urban commute costs by up to <strong>35%</strong> using smart multi-rider
            route optimization, slab-based fair fare division, and cryptographic OTP verification.
          </p>

          {/* Quick Demo Access Bar for Faculty */}
          <div
            className="card card-glass"
            style={{
              maxWidth: 760,
              margin: '0 auto',
              padding: '1.25rem',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              background: 'var(--bg-surface-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
              }}
            >
              <Zap size={16} /> ONE-CLICK DEMO LOGIN (FOR FACULTY EVALUATION & GRADING)
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => handleDemoAccess('user')}
                style={{ flex: '1 1 150px' }}
              >
                👤 Passenger 1
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleDemoAccess('user2')}
                style={{ flex: '1 1 150px', background: '#0284c7', borderColor: '#0284c7' }}
              >
                👥 Passenger 2
              </button>
              <button
                className="btn btn-success"
                onClick={() => handleDemoAccess('driver')}
                style={{ flex: '1 1 150px' }}
              >
                🚖 Driver
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => handleDemoAccess('admin')}
                style={{ flex: '1 1 150px', borderColor: 'var(--accent-danger)', color: '#f87171' }}
              >
                🛡️ Admin
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Live Fare Calculator Preview */}
      <section className="container">
        <div className="card card-glass" style={{ padding: 'clamp(1.15rem, 4vw, 2rem)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <span className="badge badge-success" style={{ marginBottom: '0.5rem' }}>
              Transparent Slab Fare Engine
            </span>
            <h2 style={{ fontSize: '1.8rem' }}>Live Route & Fare Calculator</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Test the exact distance-slab formula and shared pooling discounts in Pune
            </p>
          </div>

          <div className="grid-2" style={{ alignItems: 'center' }}>
            {/* Input Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Pickup Landmark</label>
                <select
                  className="form-select"
                  value={calcPickup.label}
                  onChange={(e) => {
                    const found = PRESET_LOCATIONS.find((p) => p.label === e.target.value);
                    if (found) setCalcPickup(found);
                  }}
                >
                  {PRESET_LOCATIONS.map((loc) => (
                    <option key={loc.label} value={loc.label}>
                      📍 {loc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Dropoff Landmark</label>
                <select
                  className="form-select"
                  value={calcDrop.label}
                  onChange={(e) => {
                    const found = PRESET_LOCATIONS.find((p) => p.label === e.target.value);
                    if (found) setCalcDrop(found);
                  }}
                >
                  {PRESET_LOCATIONS.map((loc) => (
                    <option key={loc.label} value={loc.label}>
                      🎯 {loc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Vehicle Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                  {Object.keys(VEHICLE_CONFIG).map((vKey) => (
                    <button
                      key={vKey}
                      type="button"
                      className={`btn btn-sm ${calcVehicle === vKey ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setCalcVehicle(vKey)}
                      style={{ padding: '0.55rem 0.4rem', fontSize: '0.8rem' }}
                    >
                      {VEHICLE_CONFIG[vKey].icon} {VEHICLE_CONFIG[vKey].label.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Ride Preference</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn ${calcRideType === 'shared' ? 'btn-success' : 'btn-secondary'}`}
                    onClick={() => setCalcRideType('shared')}
                    style={{ flex: '1 1 140px', padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
                  >
                    🤝 Shared Pool (Discounted)
                  </button>
                  <button
                    type="button"
                    className={`btn ${calcRideType === 'solo' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setCalcRideType('solo')}
                    style={{ flex: '1 1 140px', padding: '0.6rem 0.5rem', fontSize: '0.85rem' }}
                  >
                    👤 Solo Private (1.5×)
                  </button>
                </div>
              </div>
            </div>

            {/* Calculated Fare Result Card */}
            <div
              className="card"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--accent-primary)',
                padding: '1.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  ESTIMATED DISTANCE
                </span>
                <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{calcDist} km</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>BASE SLAB FARE</span>
                <span>₹{calcBreakdown.baseFare}</span>
              </div>

              {calcRideType === 'shared' ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    color: 'var(--accent-success)',
                    fontWeight: 600,
                  }}
                >
                  <span>SHARED POOL SAVINGS ({calcBreakdown.sharedDiscountPercent}%)</span>
                  <span>- ₹{calcBreakdown.sharedSavingsVsBase}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>SOLO MULTIPLIER (1.5×)</span>
                  <span>+ ₹{calcBreakdown.soloFare - calcBreakdown.baseFare}</span>
                </div>
              )}

              <div
                style={{
                  borderTop: '2px dashed var(--border-medium)',
                  paddingTop: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>Total Fare:</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {calcRideType === 'shared' ? 'Per passenger share' : 'Private cab booking'}
                  </div>
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--accent-primary)' }}>
                  ₹{calcRideType === 'shared' ? calcBreakdown.sharedFare : calcBreakdown.soloFare}
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => onNavigate('passenger')}
                style={{ marginTop: '0.5rem' }}
              >
                Proceed to Book Ride <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="container">
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Engineered For Reliability</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Key engineering enhancements resolving the legacy prototype limitations
          </p>
        </div>

        <div className="grid-4">
          <div className="card card-hover">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--accent-primary-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
                marginBottom: '1rem',
              }}
            >
              <Navigation size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Proximity Matching</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Replaced arbitrary vehicle matching with 3km pickup & 4km dropoff geodesic bounding
              algorithms for real shared detours.
            </p>
          </div>

          <div className="card card-hover">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--accent-success-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-success)',
                marginBottom: '1rem',
              }}
            >
              <TrendingDown size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Authoritative Slab Fares</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Unified the three conflicting formulas into distance-slab pricing with guaranteed
              10%–35% graduated shared discounts.
            </p>
          </div>

          <div className="card card-hover">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(245, 158, 11, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-warning)',
                marginBottom: '1rem',
              }}
            >
              <KeyRound size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Secure OTP Protocol</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Cryptographic random 4-digit PIN stored as SHA-256 hash. Driver never sees OTP in
              network responses until passenger shares it.
            </p>
          </div>

          <div className="card card-hover">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'var(--accent-danger-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-danger)',
                marginBottom: '1rem',
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>SOS Emergency Center</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              One-tap emergency broadcast tying GPS coordinates to live trip records with
              real-time administrative monitoring.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
