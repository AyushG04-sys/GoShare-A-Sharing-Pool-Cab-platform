import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import { getCurrentUserLocation, reverseGeocode } from '../../services/map.service.js';
import InteractiveMap from '../../components/map/InteractiveMap.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import {
  Car,
  Power,
  KeyRound,
  CheckCircle2,
  XCircle,
  Phone,
  TrendingUp,
  MapPin,
  Clock,
  ArrowRight,
  Navigation,
  Loader,
  Bell,
  Users,
  Volume2,
  Sparkles,
} from 'lucide-react';

/**
 * Web Audio API notification chime generator.
 * Emits an audible 2-tone melodic chime without requiring external mp3 assets.
 */
function playNotificationChime(isShared = true) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // Tone 1: Warm initial ping (587.33 Hz - D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.22, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.32);

    // Tone 2: Melodic higher resolution (880 Hz - A5 for shared, 659.25 Hz - E5 for standard)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(isShared ? 880.0 : 659.25, now + 0.14);
    gain2.gain.setValueAtTime(0.28, now + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.14);
    osc2.stop(now + 0.65);
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

export default function DriverDashboard({ onNavigate }) {
  const { profile } = useAuth();
  const dismissedRequestsRef = React.useRef(new Set());
  const knownRequestIdsRef = React.useRef(new Set());
  const prevPassengerCountRef = React.useRef(null);
  const prevActiveTripIdRef = React.useRef(null);
  const initialAlertShownRef = React.useRef(false);

  const [isOnline, setIsOnline] = useState(profile?.is_available ?? true);
  const [driverLocation, setDriverLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('requesting'); // 'requesting' | 'granted' | 'denied'
  const [locationErrorMsg, setLocationErrorMsg] = useState('');
  const driverLocationReqIdRef = React.useRef(0);
  const isDriverPollingRef = React.useRef(false);

  const [requests, setRequests] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [sharedRequestAlert, setSharedRequestAlert] = useState(null);
  const [copassengerAlert, setCopassengerAlert] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const errorTimerRef = React.useRef(null);

  // Request native desktop notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // 0. Acquire driver's real GPS location on mount (NO dummy fallback)
  const acquireDriverLocation = async () => {
    const reqId = ++driverLocationReqIdRef.current;
    try {
      setLocationStatus('requesting');
      setLocationErrorMsg('');
      const coords = await getCurrentUserLocation();
      if (reqId !== driverLocationReqIdRef.current) return;

      const loc = { lat: coords.lat, lng: coords.lng };
      setDriverLocation(loc);
      setLocationStatus('granted');

      // Push real location to backend
      api.updateDriverLocation(coords.lat, coords.lng).catch(() => {});
    } catch (err) {
      if (reqId !== driverLocationReqIdRef.current) return;
      console.warn('Driver geolocation denied or failed:', err.message || err);
      setLocationErrorMsg(err.message || 'Driver GPS permission was denied or timed out.');
      setDriverLocation(null);
      setLocationStatus('denied');
    }
  };

  useEffect(() => {
    acquireDriverLocation();
  }, []);

  // Auto-dismiss errors after 5 seconds
  const setErrorWithAutoDismiss = (msg) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    if (msg) {
      errorTimerRef.current = setTimeout(() => setError(''), 5000);
    }
  };

  // 1. Fetch active trip and pending requests with instant shared cab notifications
  const fetchDriverState = async () => {
    if (isDriverPollingRef.current) return;
    isDriverPollingRef.current = true;

    try {
      const activeRes = await api.getDriverActiveRide();
      if (activeRes.data?.booking) {
        const trip = activeRes.data.booking;
        setActiveTrip(trip);

        // Check if this is an active shared cab pool with an open seat (1/2 seats filled)
        const hasOpenSeat =
          trip.ride_type === 'shared' &&
          (trip.passenger_count || 1) < (trip.max_passengers || 2);

        if (hasOpenSeat) {
          const reqRes = await api.getDriverRequests();
          const incoming = (reqRes.data?.requests || []).filter(
            (r) =>
              !dismissedRequestsRef.current.has(r.id) &&
              r.status === 'pending' &&
              r.ride_type === 'shared' &&
              r.id !== trip.id &&
              r.created_by !== trip.created_by
          );

          // Detect newly arrived shared cab request while on trip
          const newShared = incoming.filter((r) => !knownRequestIdsRef.current.has(r.id));
          if (newShared.length > 0) {
            playNotificationChime(true);
            setSharedRequestAlert(newShared[0]);
          }

          incoming.forEach((r) => knownRequestIdsRef.current.add(r.id));
          setRequests(incoming);
        } else {
          setRequests([]);
        }

        // Detect if a co-passenger has joined an active shared cab pool
        if (trip.ride_type === 'shared') {
          const currentCount = trip.passenger_count || (trip.passengers ? trip.passengers.length : 1);
          if (
            prevActiveTripIdRef.current === trip.id &&
            prevPassengerCountRef.current === 1 &&
            currentCount > 1
          ) {
            playNotificationChime(true);
            const coPassenger = trip.passengers && trip.passengers[1]?.profile?.name
              ? trip.passengers[1].profile.name
              : 'Co-Passenger';
            setCopassengerAlert({
              message: `${coPassenger} has joined your shared pool! Route is now updated with 4 optimized waypoints.`,
              fare: trip.final_fare,
            });
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('🎉 GoShare: Co-Passenger Joined!', {
                body: `${coPassenger} joined your shared pool. Waypoints updated!`,
                icon: '/vite.svg',
              });
            }
          }
          prevPassengerCountRef.current = currentCount;
          prevActiveTripIdRef.current = trip.id;
        }
      } else {
        setActiveTrip(null);
        prevActiveTripIdRef.current = null;
        prevPassengerCountRef.current = null;

        const reqRes = await api.getDriverRequests();
        const incoming = (reqRes.data?.requests || []).filter(
          (r) => !dismissedRequestsRef.current.has(r.id) && r.status === 'pending'
        );

        // Detect newly arrived requests
        const newRequests = incoming.filter((r) => !knownRequestIdsRef.current.has(r.id));
        const newShared = newRequests.filter((r) => r.ride_type === 'shared');

        if (newShared.length > 0) {
          // Play audio notification chime for shared cab!
          playNotificationChime(true);
          setSharedRequestAlert(newShared[0]);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('🚖 GoShare: New Shared Cab Request!', {
              body: `Pickup: ${newShared[0].pickup_label} • Fare: ₹${newShared[0].final_fare}`,
              icon: '/vite.svg',
            });
          }
        } else if (newRequests.length > 0) {
          playNotificationChime(false);
        } else if (!initialAlertShownRef.current && incoming.some((r) => r.ride_type === 'shared')) {
          initialAlertShownRef.current = true;
          const topShared = incoming.find((r) => r.ride_type === 'shared');
          setSharedRequestAlert(topShared);
          playNotificationChime(true);
        }

        incoming.forEach((r) => knownRequestIdsRef.current.add(r.id));
        setRequests(incoming);
      }
    } catch (err) {
      console.warn('Driver poll error:', err);
    } finally {
      isDriverPollingRef.current = false;
    }
  };

  useEffect(() => {
    fetchDriverState();
    const interval = setInterval(fetchDriverState, 3500);
    return () => {
      clearInterval(interval);
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // 2. Simulated GPS movement step
  const handleSimulateMovement = () => {
    if (!driverLocation) return;
    if (!activeTrip) {
      const newLat = driverLocation.lat + (Math.random() - 0.5) * 0.003;
      const newLng = driverLocation.lng + (Math.random() - 0.5) * 0.003;
      setDriverLocation({ lat: newLat, lng: newLng });
      api.updateDriverLocation(newLat, newLng).catch(() => {});
      return;
    }

    // Direct vehicle toward the next uncompleted waypoint in the optimized sequence
    const uncompletedWp = (activeTrip.waypoints || [])
      .filter((w) => !w.is_completed)
      .sort((a, b) => (a.stop_order || a.stop_index || 0) - (b.stop_order || b.stop_index || 0))[0];

    const targetLat = uncompletedWp
      ? uncompletedWp.lat
      : activeTrip.status === 'accepted'
      ? activeTrip.pickup_lat
      : activeTrip.destination_lat;

    const targetLng = uncompletedWp
      ? uncompletedWp.lng
      : activeTrip.status === 'accepted'
      ? activeTrip.pickup_lng
      : activeTrip.destination_lng;

    const stepFactor = 0.25;
    const nextLat = driverLocation.lat + (targetLat - driverLocation.lat) * stepFactor;
    const nextLng = driverLocation.lng + (targetLng - driverLocation.lng) * stepFactor;

    setDriverLocation({ lat: nextLat, lng: nextLng });
    api.updateDriverLocation(nextLat, nextLng).catch(() => {});
  };

  // Toggle online availability
  const handleToggleOnline = async () => {
    setLoading(true);
    try {
      const nextStatus = !isOnline;
      await api.updateDriverStatus(nextStatus);
      setIsOnline(nextStatus);
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  // Accept incoming request
  const handleAcceptRide = async (bookingId) => {
    setLoading(true);
    setError('');
    // Instantly dismiss from pending list to prevent duplicate display
    dismissedRequestsRef.current.add(bookingId);
    setRequests((prev) => prev.filter((r) => r.id !== bookingId));

    try {
      const res = await api.acceptBooking(bookingId);
      if (res.data?.booking) {
        setActiveTrip(res.data.booking);
      }
      fetchDriverState();
    } catch (err) {
      setErrorWithAutoDismiss(err.message || 'This ride request is no longer available');
      fetchDriverState();
    } finally {
      setLoading(false);
    }
  };

  // Reject / Decline incoming request
  const handleRejectRide = async (bookingId) => {
    dismissedRequestsRef.current.add(bookingId);
    setRequests((prev) => prev.filter((r) => r.id !== bookingId));
    if (activeTrip?.id === bookingId) {
      setActiveTrip(null);
    }
    setError('');

    try {
      await api.rejectBooking(bookingId).catch(() => {});
      fetchDriverState();
    } catch (err) {
      console.warn('Reject ride notice:', err);
    }
  };

  // Verify PIN
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!activeTrip || otpInput.length !== 4) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.verifyOtp(activeTrip.id, otpInput);
      setActiveTrip(res.data?.booking);
      setOtpInput('');
      fetchDriverState();
    } catch (err) {
      setErrorWithAutoDismiss('Invalid 4-digit PIN. Please confirm PIN verbally with passenger.');
    } finally {
      setLoading(false);
    }
  };

  // Progress waypoint
  const handleCompleteWaypoint = async (waypointId) => {
    if (!activeTrip) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.completeWaypoint(activeTrip.id, waypointId);
      if (res.data?.isFullyCompleted) {
        setActiveTrip(null);
      }
      fetchDriverState();
    } catch (err) {
      setErrorWithAutoDismiss(err.message || 'Failed to advance stop');
    } finally {
      setLoading(false);
    }
  };

  // Complete ride
  const handleCompleteTrip = async () => {
    if (!activeTrip) return;
    if (!window.confirm('Mark this trip completed and collect fare?')) return;

    setLoading(true);
    setError('');
    try {
      await api.completeRide(activeTrip.id);
      setActiveTrip(null);
      fetchDriverState();
    } catch (err) {
      setErrorWithAutoDismiss(err.message || 'Failed to complete trip');
    } finally {
      setLoading(false);
    }
  };

  const sortedWaypoints = (activeTrip?.waypoints || [])
    .slice()
    .sort((a, b) => (a.stop_order || a.stop_index || 0) - (b.stop_order || b.stop_index || 0));

  const optimizedPolyline =
    sortedWaypoints.length > 0
      ? [
          ...(driverLocation ? [[driverLocation.lat, driverLocation.lng]] : []),
          ...sortedWaypoints.map((w) => [w.lat, w.lng]),
        ]
      : activeTrip
      ? [
          [activeTrip.pickup_lat, activeTrip.pickup_lng],
          [activeTrip.destination_lat, activeTrip.destination_lng],
        ]
      : [];

  const hasAvailableSeat =
    activeTrip &&
    activeTrip.ride_type === 'shared' &&
    (activeTrip.passenger_count || 1) < (activeTrip.max_passengers || 2);

  return (
    <div className="app-body">
      {/* Left Sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar-scroll">
          <ErrorBanner message={error} onDismiss={() => setError('')} />

          {/* Real-Time Shared Cab Notification Banner */}
          {sharedRequestAlert && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 95, 70, 0.4))',
                border: '2px solid #10b981',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                animation: 'pulseGlow 2s ease-in-out infinite',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Bell size={18} style={{ color: '#10b981', animation: 'bounce 1s infinite' }} />
                  <strong style={{ color: '#10b981', fontSize: '0.92rem', letterSpacing: '0.02em' }}>
                    INCOMING SHARED CAB REQUEST!
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setSharedRequestAlert(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ fontSize: '0.82rem', lineHeight: 1.45 }}>
                <div>
                  <strong style={{ color: '#10b981' }}>Pickup:</strong> {sharedRequestAlert.pickup_label}
                </div>
                <div style={{ marginTop: '0.2rem' }}>
                  <strong style={{ color: '#ef4444' }}>Dropoff:</strong> {sharedRequestAlert.destination_label}
                </div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Rider: <strong>{sharedRequestAlert.creator?.name || 'Passenger'}</strong> • Pooled Fare:{' '}
                  <strong style={{ color: '#10b981', fontSize: '1.05rem' }}>
                    ₹{sharedRequestAlert.final_fare}
                  </strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-action btn-action-green"
                  onClick={() => {
                    handleAcceptRide(sharedRequestAlert.id);
                    setSharedRequestAlert(null);
                  }}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.65rem',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <CheckCircle2 size={16} /> Accept Shared Cab Now
                </button>
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => {
                    dismissedRequestsRef.current.add(sharedRequestAlert.id);
                    setSharedRequestAlert(null);
                    setRequests((prev) => prev.filter((r) => r.id !== sharedRequestAlert.id));
                  }}
                  style={{
                    padding: '0.65rem 0.9rem',
                    fontSize: '0.82rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'var(--danger)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Co-Passenger Joined Alert Banner */}
          {copassengerAlert && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(30, 58, 138, 0.45))',
                border: '2px solid #3b82f6',
                borderRadius: 'var(--radius-md)',
                padding: '0.9rem 1rem',
                boxShadow: '0 0 18px rgba(59, 130, 246, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Users size={18} style={{ color: '#60a5fa' }} />
                  <strong style={{ color: '#60a5fa', fontSize: '0.88rem' }}>
                    CO-PASSENGER JOINED YOUR SHARED POOL!
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => setCopassengerAlert(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text)' }}>
                {copassengerAlert.message}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#93c5fd', fontWeight: 600 }}>
                Total Fare: ₹{copassengerAlert.fare || activeTrip?.final_fare} • Stops updated on live map
              </div>
            </div>
          )}

          {/* Location Permission Status Banner */}
          {locationStatus === 'requesting' && (
            <div
              style={{
                background: 'var(--accent-primary-subtle)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                animation: 'pulseGlow 2s ease-in-out infinite',
              }}
            >
              <Loader size={16} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent-primary)' }}>
                  Requesting Driver GPS Permission...
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  Please click &ldquo;Allow&rdquo; when prompted by your browser for live dispatch positioning
                </div>
              </div>
            </div>
          )}

          {locationStatus === 'denied' && (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <MapPin size={15} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--accent-warning)' }}>
                  Driver GPS Location Unavailable
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {locationErrorMsg || 'Live GPS access is required to receive nearby ride requests. Please allow location access.'}
                </div>
              </div>
              <button
                onClick={acquireDriverLocation}
                style={{
                  background: 'var(--accent-warning)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Retry Driver GPS
              </button>
            </div>
          )}

          {locationStatus === 'granted' && driverLocation && (
            <div
              style={{
                background: 'var(--accent-success-subtle)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '0.55rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckCircle2 size={14} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-success)' }}>
                📍 Real GPS position active: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)}
              </div>
            </div>
          )}

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {/* Online Toggle & Driver Status Card */}
          <div
            style={{
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{profile?.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {profile?.vehicle_type?.toUpperCase() || 'CAB'} •{' '}
                {profile?.vehicle_number || 'MH-12-AB-1234'}
              </div>
            </div>

            <button
              onClick={handleToggleOnline}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                border: 'none',
                background: isOnline ? 'var(--accent)' : 'var(--danger)',
                color: '#ffffff',
                boxShadow: isOnline
                  ? '0 0 12px var(--accent-glow)'
                  : '0 0 12px var(--danger-glow)',
              }}
            >
              <Power size={14} /> {isOnline ? 'ONLINE' : 'OFFLINE'}
            </button>
          </div>

          {/* Quick Earnings Shortcut */}
          <button
            className="btn-back"
            onClick={() => onNavigate('earnings')}
            style={{ color: 'var(--accent)', fontWeight: 600, padding: 0 }}
          >
            <TrendingUp size={16} /> View Today's Earnings & Performance
          </button>

          {/* ACTIVE TRIP CONSOLE */}
          {activeTrip ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '2px solid var(--accent)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                  }}
                >
                  <span
                    style={{
                      background: activeTrip.ride_type === 'shared' ? 'linear-gradient(135deg, #10b981, #059669)' : 'var(--accent-subtle)',
                      color: '#ffffff',
                      padding: '0.2rem 0.65rem',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {activeTrip.ride_type === 'shared' ? (
                      <>
                        <Users size={13} /> SHARED CAB ({activeTrip.passenger_count || (activeTrip.passengers?.length || 1)}/2 SEATS)
                      </>
                    ) : (
                      `${activeTrip.ride_type.toUpperCase()} TRIP`
                    )}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {activeTrip.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PRIMARY PASSENGER</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  {activeTrip.creator?.name || 'Passenger'}
                </div>
                {activeTrip.creator?.phone && (
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <Phone size={13} /> {activeTrip.creator.phone}
                  </div>
                )}

                <div
                  style={{
                    marginTop: '0.75rem',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Total Pool Fare:
                  </span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent)' }}>
                    ₹{activeTrip.final_fare}
                  </span>
                </div>

                {activeTrip.ride_type === 'shared' && activeTrip.passengers && activeTrip.passengers.length > 0 && (
                  <div
                    style={{
                      marginTop: '0.85rem',
                      borderTop: '1px solid var(--border)',
                      paddingTop: '0.75rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.45rem',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <Users size={14} /> CONFIRMED RIDERS IN POOL ({activeTrip.passengers.length}/{activeTrip.max_passengers || 2})
                    </div>
                    {activeTrip.passengers.map((p, pIdx) => (
                      <div
                        key={p.id || pIdx}
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.45rem 0.65rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div>
                          <div>
                            <strong>
                              {p.profile?.name || (pIdx === 0 ? (activeTrip.creator?.name || 'Rider 1') : 'Co-Rider')}
                            </strong>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                              (Rider {pIdx + 1})
                            </span>
                          </div>
                          {p.pickup_label && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                              📍 {p.pickup_label.substring(0, 24)}...
                            </div>
                          )}
                        </div>
                        <span style={{ fontWeight: 800, color: 'var(--accent)' }}>
                          ₹{p.fare_amount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 0: Action buttons if Trip is in Pending state */}
              {activeTrip.status === 'pending' && (
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div>
                      <strong style={{ color: '#10b981' }}>Pickup:</strong> {activeTrip.pickup_label || 'Pickup Location'}
                    </div>
                    <div>
                      <strong style={{ color: '#ef4444' }}>Dropoff:</strong> {activeTrip.destination_label || 'Destination'}
                    </div>
                    {activeTrip.route_distance_km && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Distance: ~{activeTrip.route_distance_km} km
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-action btn-action-green"
                      onClick={() => handleAcceptRide(activeTrip.id)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={16} /> Accept Ride
                    </button>
                    <button
                      type="button"
                      className="btn-action"
                      onClick={() => handleRejectRide(activeTrip.id)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '0.8rem',
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        color: 'var(--danger)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        fontWeight: 700,
                      }}
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Pool Co-Passenger Request Queue (Shown when 1 seat is open in shared cab) */}
              {hasAvailableSeat && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 95, 70, 0.22))',
                    border: '2px dashed #10b981',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Users size={18} style={{ color: '#10b981' }} />
                      <strong style={{ color: '#10b981', fontSize: '0.9rem' }}>
                        AVAILABLE FOR SHARED POOL (1 SEAT AVAILABLE)
                      </strong>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.2)',
                        padding: '0.2rem 0.55rem',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {requests.length} Co-Rider Request{requests.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {requests.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem' }}>
                      Waiting for compatible co-passenger requests along your route...
                    </div>
                  ) : (
                    requests.map((coReq) => (
                      <div
                        key={coReq.id}
                        style={{
                          background: 'var(--surface-card)',
                          border: '1.5px solid #10b981',
                          borderRadius: 'var(--radius-sm)',
                          padding: '0.85rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                            {coReq.creator?.name || 'Co-Passenger'}
                          </strong>
                          <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#10b981' }}>
                            +₹{coReq.final_fare}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <div><strong style={{ color: '#10b981' }}>Pickup:</strong> {coReq.pickup_label}</div>
                          <div style={{ marginTop: '0.15rem' }}><strong style={{ color: '#ef4444' }}>Dropoff:</strong> {coReq.destination_label}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-action btn-action-green"
                            onClick={() => handleAcceptRide(coReq.id)}
                            disabled={loading}
                            style={{
                              flex: 1,
                              padding: '0.65rem',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem',
                            }}
                          >
                            <CheckCircle2 size={16} /> Accept & Add to Shared Pool
                          </button>
                          <button
                            type="button"
                            className="btn-action"
                            onClick={() => handleRejectRide(coReq.id)}
                            disabled={loading}
                            style={{
                              padding: '0.65rem 0.8rem',
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: 'var(--danger)',
                              fontSize: '0.8rem',
                            }}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Step 1: Verify OTP PIN */}
              {activeTrip.status === 'accepted' && (
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <KeyRound size={16} color="var(--accent)" /> Enter Rider PIN at Pickup
                  </div>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.75rem',
                    }}
                  >
                    Verify the 4-digit code given by the rider to begin trip.
                  </p>

                  <form onSubmit={handleVerifyOtp} style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      className="form-input"
                      maxLength={4}
                      placeholder="4-digit PIN"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                      style={{
                        fontSize: '1.3rem',
                        fontWeight: 800,
                        textAlign: 'center',
                        letterSpacing: '0.2em',
                        flex: 1,
                      }}
                    />
                    <button
                      type="submit"
                      className="btn-action btn-action-green"
                      style={{ width: 'auto', padding: '0 1.25rem' }}
                      disabled={otpInput.length !== 4 || loading}
                    >
                      Start Ride
                    </button>
                  </form>
                </div>
              )}

              {/* Step 2: Waypoint route progression (Optimized 4-stop order for pool cab) */}
              {sortedWaypoints.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Navigation size={14} /> BEST OPTIMIZED POOL ROUTE ({sortedWaypoints.length} STOPS)
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Sequenced for minimal detour
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {sortedWaypoints.map((wp, idx) => {
                      const stopNum = wp.stop_order || wp.stop_index || idx + 1;
                      const isPickup = wp.waypoint_type === 'pickup';
                      const color = isPickup ? '#10b981' : '#ef4444';

                      return (
                        <div
                          key={wp.id || idx}
                          style={{
                            padding: '0.75rem 0.9rem',
                            background: wp.is_completed
                              ? 'rgba(16, 185, 129, 0.08)'
                              : 'var(--surface-card)',
                            border: wp.is_completed
                              ? '1px solid rgba(16, 185, 129, 0.3)'
                              : '1px solid var(--border)',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '0.75rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: color,
                                color: '#ffffff',
                                fontWeight: 900,
                                fontSize: '0.78rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {stopNum}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: 800, color }}>
                                STOP {stopNum}: {isPickup ? 'PICKUP' : 'DROPOFF'}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  color: 'var(--text)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {wp.label}
                              </div>
                            </div>
                          </div>

                          {activeTrip.status === 'in_progress' ? (
                            wp.is_completed ? (
                              <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                            ) : (
                              <button
                                onClick={() => handleCompleteWaypoint(wp.id)}
                                disabled={loading}
                                style={{
                                  background: 'var(--accent)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '0.35rem 0.75rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                }}
                              >
                                Done
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              Pending
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {activeTrip.status === 'in_progress' && (
                    <button
                      className="btn-action btn-action-green"
                      onClick={handleCompleteTrip}
                      disabled={loading}
                      style={{ marginTop: '0.5rem' }}
                    >
                      <CheckCircle2 size={18} /> Complete Trip & Collect Cash
                    </button>
                  )}
                </div>
              )}

              {/* Movement simulator */}
              <button
                type="button"
                onClick={handleSimulateMovement}
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  padding: '0.6rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                📍 Simulate GPS Step Along Route
              </button>
            </div>
          ) : (
            /* INCOMING REQUESTS STREAM */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Incoming Rides</h3>
                <span
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  {requests.length} Available
                </span>
              </div>

              {!isOnline ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <Power size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                  <p>You are offline.</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Switch online above to receive passenger booking requests.
                  </p>
                </div>
              ) : requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
                  <Car size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.4 }} />
                  <p style={{ fontWeight: 600 }}>Searching for ride requests...</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    New passenger bookings nearby will show up here automatically.
                  </p>
                </div>
              ) : (
                requests.map((req) => {
                  const isShared = req.ride_type === 'shared';
                  return (
                    <div
                      key={req.id}
                      style={{
                        background: isShared
                          ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, var(--surface-card) 100%)'
                          : 'var(--surface-card)',
                        border: isShared ? '2px solid #10b981' : '1.5px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '1.15rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: isShared ? '0 0 16px rgba(16, 185, 129, 0.22)' : 'none',
                        transition: 'border-color 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {isShared ? (
                          <span
                            style={{
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#ffffff',
                              padding: '0.25rem 0.65rem',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.35)',
                            }}
                          >
                            <Users size={13} /> SHARED CAB POOL • 2 SEATS
                          </span>
                        ) : (
                          <span
                            style={{
                              background: 'var(--accent-subtle)',
                              color: 'var(--accent)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                            }}
                          >
                            SOLO • {req.vehicle_category ? req.vehicle_category.toUpperCase() : 'CAB'}
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '1.35rem',
                            fontWeight: 900,
                            color: isShared ? '#10b981' : 'var(--text)',
                          }}
                        >
                          ₹{req.final_fare}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.85rem' }}>
                        <div>
                          <strong style={{ color: '#10b981' }}>Pickup:</strong> {req.pickup_label}
                        </div>
                        <div style={{ marginTop: '0.2rem' }}>
                          <strong style={{ color: '#ef4444' }}>Dropoff:</strong> {req.destination_label}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                          Distance: ~{req.route_distance_km} km • Rider: {req.creator?.name || 'Rider'}
                          {isShared && ' • 35% Pool Discount'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn-action btn-action-green"
                          onClick={() => handleAcceptRide(req.id)}
                          disabled={loading}
                          style={{
                            flex: 1,
                            padding: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            fontWeight: 800,
                            boxShadow: isShared ? '0 0 10px rgba(16, 185, 129, 0.3)' : 'none',
                          }}
                        >
                          <CheckCircle2 size={16} /> {isShared ? 'Accept Shared Cab' : 'Accept Ride'}
                        </button>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={() => handleRejectRide(req.id)}
                          disabled={loading}
                          style={{
                            flex: 1,
                            padding: '0.8rem',
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: 'var(--danger)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            fontWeight: 700,
                          }}
                        >
                          <XCircle size={16} /> Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Right Map Viewport */}
      <InteractiveMap
        userLocation={driverLocation}
        pickup={
          activeTrip
            ? {
                lat: activeTrip.pickup_lat,
                lng: activeTrip.pickup_lng,
                label: activeTrip.pickup_label,
              }
            : null
        }
        destination={
          activeTrip
            ? {
                lat: activeTrip.destination_lat,
                lng: activeTrip.destination_lng,
                label: activeTrip.destination_label,
              }
            : null
        }
        driverLocation={driverLocation}
        waypoints={sortedWaypoints}
        routePolyline={optimizedPolyline}
        onRequestLocation={acquireDriverLocation}
      />
    </div>
  );
}
