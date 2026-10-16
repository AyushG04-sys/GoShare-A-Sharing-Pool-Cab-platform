import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import {
  getCityLandmarks,
  searchLocations,
  fetchOsrmRoute,
  getCurrentUserLocation,
  getUserLocationDetails,
} from '../../services/map.service.js';
import InteractiveMap from '../../components/map/InteractiveMap.jsx';
import Modal from '../../components/common/Modal.jsx';
import RatingModal from '../../components/ride/RatingModal.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import {
  Car,
  Users,
  Shield,
  ArrowLeft,
  Search,
  Sparkles,
  Phone,
  ShieldAlert,
  XCircle,
  Clock,
  CheckCircle2,
  MapPin,
  Loader,
  Crosshair,
} from 'lucide-react';

export default function PassengerDashboard({ onNavigate }) {
  const { profile } = useAuth();

  // Wizard step: 'rideType' | 'destination' | 'vehicle'
  const [step, setStep] = useState('rideType');

  // Ride options
  const [rideType, setRideType] = useState('shared'); // 'solo' | 'shared'
  const [femaleDriverPreferred, setFemaleDriverPreferred] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const userGender = profile?.gender ? profile.gender.toLowerCase() : null;
  const isFemaleUser = userGender === 'female';
  const isMaleUser = userGender === 'male';

  // Women / same-gender safety booking confirmation dialog state
  const [womenConfirmModalOpen, setWomenConfirmModalOpen] = useState(false);
  const [womenConfirmStep, setWomenConfirmStep] = useState(1);

  // User's detected location and city
  const [userLocation, setUserLocation] = useState(null);

  // Route & Locations — start null, will be set by geolocation or fallback
  const [pickup, setPickup] = useState(null);
  const [destination, setDestination] = useState(null);
  const [pickupQuery, setPickupQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [activeClickField, setActiveClickField] = useState('destination');
  const [locationStatus, setLocationStatus] = useState('requesting'); // 'requesting' | 'granted' | 'denied'
  const [locationErrorMsg, setLocationErrorMsg] = useState('');
  const locationRequestIdRef = useRef(0);
  const isCheckingRideRef = useRef(false);
  const isSubmittingRef = useRef(false);

  // Route calculation & Estimates
  const [estimates, setEstimates] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('cab');
  const [routePolyline, setRoutePolyline] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationMin, setDurationMin] = useState(0);

  // Active Ride state
  const [activeBooking, setActiveBooking] = useState(null);
  const [activeOtp, setActiveOtp] = useState(null);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [completedBookingToRate, setCompletedBookingToRate] = useState(null);
  const cancelledBookingIdsRef = useRef(new Set());

  // Shared pool candidate matching state
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Request real geolocation on mount for pickup location and city-localized search
  const requestLocationAccess = async () => {
    const reqId = ++locationRequestIdRef.current;
    try {
      setLocationStatus('requesting');
      setLocationErrorMsg('');
      const coords = await getCurrentUserLocation();
      if (reqId !== locationRequestIdRef.current) return;

      let details;
      try {
        details = await getUserLocationDetails(coords.lat, coords.lng);
      } catch {
        details = { label: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` };
      }

      const userLoc = {
        lat: coords.lat,
        lng: coords.lng,
        label: details?.label || `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        city: details?.city || '',
        state: details?.state || '',
        fullAddress: details?.fullAddress || '',
      };
      setUserLocation(userLoc);
      setPickup(userLoc);
      setPickupQuery(userLoc.label);
      setLocationStatus('granted');
    } catch (err) {
      if (reqId !== locationRequestIdRef.current) return;
      console.warn('Geolocation denied or unavailable:', err.message || err);
      setLocationErrorMsg(err.message || 'Location permission was denied or timed out.');
      setUserLocation(null);
      setLocationStatus('denied');
    }
  };

  useEffect(() => {
    requestLocationAccess();
  }, []);

  // 1. Poll for active ride with overlapping request guard
  useEffect(() => {
    let intervalId;
    let isMounted = true;

    async function checkActiveRide() {
      if (isCheckingRideRef.current) return;
      isCheckingRideRef.current = true;

      try {
        const res = await api.getActivePassengerRide();
        if (!isMounted) return;

        if (res.data?.booking) {
          const b = res.data.booking;
          // If this booking was cancelled by the user or already finished, do not restore it
          if (
            b.status === 'cancelled' ||
            b.status === 'completed' ||
            (b.id && cancelledBookingIdsRef.current.has(b.id))
          ) {
            setActiveBooking(null);
            return;
          }

          if (b.otp) {
            setActiveOtp(b.otp);
            localStorage.setItem(`goshare_active_otp_${b.id}`, b.otp);
          } else if (b.id) {
            const cachedOtp = localStorage.getItem(`goshare_active_otp_${b.id}`);
            if (cachedOtp) setActiveOtp(cachedOtp);
          }

          setActiveBooking((prev) => {
            if (prev && prev.status === 'in_progress' && b.status === 'completed') {
              setCompletedBookingToRate(b);
              setRatingModalOpen(true);
            }
            return b;
          });
        } else {
          setActiveBooking((prev) => {
            if (prev && prev.status === 'in_progress') {
              setCompletedBookingToRate(prev);
              setRatingModalOpen(true);
            }
            return null;
          });
        }
      } catch (err) {
        console.warn('Active ride check:', err);
      } finally {
        isCheckingRideRef.current = false;
      }
    }

    checkActiveRide();
    intervalId = setInterval(checkActiveRide, 3500);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Reset active ride state immediately if profile changes
  useEffect(() => {
    setActiveBooking(null);
    setActiveOtp(null);
    setStep('rideType');
  }, [profile?.id]);

  // 2. Calculate route polyline and estimates
  useEffect(() => {
    let cancelled = false;

    async function calcRoute() {
      if (!pickup?.lat || !destination?.lat) return;

      try {
        const routeData = await fetchOsrmRoute([pickup, destination]);
        if (cancelled) return;

        setRoutePolyline(routeData.polyline);
        setDistanceKm(routeData.distanceKm);
        setDurationMin(routeData.durationMin);

        const estRes = await api.getEstimate({
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          destination_lat: destination.lat,
          destination_lng: destination.lng,
        });

        if (!cancelled && estRes.data?.estimates) {
          setEstimates(estRes.data.estimates);
        }
      } catch (err) {
        console.warn('Error fetching route:', err);
      }
    }

    calcRoute();
    return () => {
      cancelled = true;
    };
  }, [pickup, destination]);

  // Handle map click
  const handleMapClick = (coords) => {
    const loc = {
      lat: coords.lat,
      lng: coords.lng,
      label: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
    };

    if (activeClickField === 'pickup') {
      setPickup(loc);
      setPickupQuery(loc.label);
      setActiveClickField('destination');
    } else {
      setDestination(loc);
      setDestQuery(loc.label);
      setActiveClickField('pickup');
    }
  };

  // Autocomplete search strictly localized to user's location/city
  const handleSearch = async (val, field) => {
    if (field === 'pickup') {
      setPickupQuery(val);
      if (val.trim().length > 1) {
        const results = await searchLocations(val, userLocation);
        setPickupSuggestions(results);
      } else {
        setPickupSuggestions([]);
      }
    } else {
      setDestQuery(val);
      if (val.trim().length > 1) {
        const results = await searchLocations(val, userLocation);
        setDestSuggestions(results);
      } else {
        setDestSuggestions([]);
      }
    }
  };

  // Submit booking
  const handleConfirmRide = async () => {
    if (loading || isSubmittingRef.current) return;
    if (activeBooking && ['pending', 'accepted', 'in_progress'].includes(activeBooking.status)) {
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const payload = {
        ride_type: rideType,
        vehicle_category: selectedVehicle,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_label: pickup.label,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        destination_label: destination.label,
        female_driver_preferred: femaleDriverPreferred,
        payment_method: paymentMethod,
      };

      const res = await api.createBooking(payload);
      setActiveBooking(res.data.booking);
      setActiveOtp(res.data.otp);
      if (res.data.booking?.id && res.data.otp) {
        localStorage.setItem(`goshare_active_otp_${res.data.booking.id}`, res.data.otp);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit booking');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Join an existing shared pool
  const handleJoinSharedPool = async (bookingId) => {
    if (loading || isSubmittingRef.current || !bookingId) return;
    if (activeBooking && ['pending', 'accepted', 'in_progress'].includes(activeBooking.status)) {
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const payload = {
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        pickup_label: pickup.label,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        destination_label: destination.label,
      };

      const res = await api.joinSharedRide(bookingId, payload);
      setActiveBooking(res.data.booking);
      setActiveOtp(res.data.otp);
      if (res.data.booking?.id && res.data.otp) {
        localStorage.setItem(`goshare_active_otp_${res.data.booking.id}`, res.data.otp);
      }
    } catch (err) {
      setError(err.message || 'Failed to join shared pool');
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // Search for active shared pool candidates when on vehicle selection step
  useEffect(() => {
    let cancelled = false;
    async function fetchCandidates() {
      if (step !== 'vehicle' || rideType !== 'shared' || !pickup || !destination) {
        setCandidates([]);
        setSelectedCandidateId(null);
        return;
      }

      setLoadingCandidates(true);
      try {
        const res = await api.getMatchCandidates({
          vehicle_category: selectedVehicle,
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          destination_lat: destination.lat,
          destination_lng: destination.lng,
          female_driver_preferred: femaleDriverPreferred,
        });

        if (!cancelled && res.data?.candidates) {
          const list = res.data.candidates || [];
          setCandidates(list);
          if (list.length > 0) {
            setSelectedCandidateId(list[0].bookingId);
          } else {
            setSelectedCandidateId(null);
          }
        }
      } catch (err) {
        console.warn('Error fetching match candidates:', err);
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    }

    fetchCandidates();
    return () => {
      cancelled = true;
    };
  }, [step, rideType, selectedVehicle, femaleDriverPreferred, pickup, destination]);

  // Instant Auto-Assign Nearby Driver (Demo / Test helper)
  const handleAutoAssignDriver = async (bookingId) => {
    try {
      setLoading(true);
      const res = await api.autoAssignDriver(bookingId);
      if (res.data?.booking) {
        setActiveBooking(res.data.booking);
      }
    } catch (err) {
      console.warn('Auto-assign failed:', err.message || err);
    } finally {
      setLoading(false);
    }
  };

  // Cancel ride
  const handleCancelBooking = async (bookingId) => {
    // Provide instantaneous responsive UI feedback
    if (bookingId) {
      cancelledBookingIdsRef.current.add(bookingId);
      localStorage.removeItem(`goshare_active_otp_${bookingId}`);
    }
    setActiveBooking(null);
    setActiveOtp(null);
    setStep('rideType');
    setError('');

    if (bookingId) {
      try {
        await api.cancelBooking(bookingId, 'Cancelled by rider');
      } catch (err) {
        console.warn('Backend cancel notice:', err.message || err);
      }
    }
  };

  // Emergency SOS
  const handleTriggerSos = async (bookingId) => {
    if (
      !window.confirm(
        '🚨 TRIGGER EMERGENCY SOS?\nThis broadcasts an immediate alert with your live GPS location to local dispatch and administrators.'
      )
    )
      return;

    try {
      await api.triggerSos({
        booking_id: bookingId || null,
        current_lat: pickup.lat,
        current_lng: pickup.lng,
        alert_type: 'safety',
        details: `Passenger SOS initiated by ${profile?.name} during ride`,
      });
      alert('🚨 EMERGENCY SOS BROADCAST SENT. Help is being dispatched!');
    } catch (err) {
      alert('Failed to send SOS: ' + err.message);
    }
  };

  const selectedEstimate = estimates.find((e) => e.vehicleType === selectedVehicle);

  return (
    <div className="app-body">
      {/* Left Sidebar Flow */}
      <aside className="app-sidebar">
        <div className="app-sidebar-scroll">
          <ErrorBanner message={error} onDismiss={() => setError('')} />

          {/* Location Permission Status Banner */}
          {locationStatus === 'requesting' && (
            <div
              style={{
                background: 'var(--accent-primary-subtle)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                animation: 'pulseGlow 2s ease-in-out infinite',
              }}
            >
              <Loader size={18} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-primary)' }}>
                  Requesting Location Permission...
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Please click &ldquo;Allow&rdquo; when prompted by your browser to set your pickup location
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
                padding: '0.75rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <MapPin size={16} style={{ color: 'var(--accent-warning)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-warning)' }}>
                  Location Detection Unavailable
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                  {locationErrorMsg || 'Please grant browser location access or search your pickup address above to book a cab.'}
                </div>
              </div>
              <button
                onClick={requestLocationAccess}
                style={{
                  background: 'var(--accent-warning)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Retry Location
              </button>
            </div>
          )}

          {locationStatus === 'granted' && pickup && (
            <div
              style={{
                background: 'var(--accent-success-subtle)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: '0.65rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
              }}
            >
              <CheckCircle2 size={15} style={{ color: 'var(--accent-success)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-success)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📍 Real GPS pickup detected: {pickup.label}
              </div>
            </div>
          )}

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {/* VIEW 1: ACTIVE RIDE TRACKING PANEL (If ride is active) */}
          {/* ========================================================================= */}
          {activeBooking &&
          activeBooking.status !== 'cancelled' &&
          activeBooking.status !== 'completed' &&
          !cancelledBookingIdsRef.current.has(activeBooking.id) ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Header Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted)',
                  }}
                >
                  LIVE TRIP TRACKING
                </span>
                <span
                  style={{
                    background:
                      activeBooking.status === 'in_progress'
                        ? 'var(--accent)'
                        : activeBooking.status === 'accepted'
                        ? 'var(--primary)'
                        : 'var(--warning)',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  {activeBooking.status === 'pending' && 'SEARCHING FOR DRIVER'}
                  {activeBooking.status === 'accepted' && 'DRIVER ON THE WAY'}
                  {activeBooking.status === 'in_progress' && 'RIDE IN PROGRESS'}
                </span>
              </div>

              {/* Status Graphic & Countdown */}
              <div
                style={{
                  background: 'var(--surface-card)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  textAlign: 'center',
                  border: '1px solid var(--border)',
                }}
              >
                {activeBooking.status === 'pending' ? (
                  <div>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        border: '4px solid var(--border)',
                        borderTopColor: 'var(--accent)',
                        borderRadius: '50%',
                        margin: '0 auto 1rem',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>
                      Finding your driver...
                    </h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Connecting with nearby verified cabs {userLocation?.city ? `in ${userLocation.city}` : 'in your area'}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleAutoAssignDriver(activeBooking.id)}
                      disabled={loading}
                      style={{
                        marginTop: '1rem',
                        background: 'var(--surface)',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent)',
                        borderRadius: 'var(--radius-full)',
                        padding: '0.45rem 1rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Car size={15} /> ⚡ Connect Nearby Driver (Instant Demo)
                    </button>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      ESTIMATED ARRIVAL
                    </div>
                    <div
                      style={{
                        fontSize: '3rem',
                        fontWeight: 900,
                        color: 'var(--accent)',
                        lineHeight: 1.1,
                        margin: '0.25rem 0',
                      }}
                    >
                      {activeBooking.status === 'in_progress' ? 'En Route' : '3-5'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {activeBooking.status === 'in_progress'
                        ? 'Heading towards destination'
                        : 'Minutes away'}
                    </div>
                  </div>
                )}
              </div>

              {/* Driver Details Card (When accepted) */}
              {activeBooking.driver && (
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: 'var(--surface)',
                      border: '2px solid var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.5rem',
                    }}
                  >
                    🚗
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>
                      {activeBooking.driver.name}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {activeBooking.driver.vehicle_number || 'MH-12-AB-1234'} •{' '}
                      {activeBooking.vehicle_category?.toUpperCase()}
                    </div>
                    {activeBooking.driver.phone && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          marginTop: '0.2rem',
                        }}
                      >
                        <Phone size={12} /> {activeBooking.driver.phone}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Large OTP Card */}
              <div className="tracking-otp-box">
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  SHARE THIS OTP PIN WITH DRIVER AT PICKUP
                </div>
                <div className="tracking-otp-digits">
                  {(
                    String(
                      activeOtp ||
                        activeBooking?.otp ||
                        (activeBooking?.id && localStorage.getItem(`goshare_active_otp_${activeBooking.id}`)) ||
                        '7392'
                    )
                  )
                    .slice(0, 4)
                    .split('')
                    .map((digit, idx) => (
                      <div key={idx} className="tracking-otp-digit">
                        {digit}
                      </div>
                    ))}
                </div>
              </div>

              {/* Fare & Payment Summary */}
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    TOTAL FARE PAYABLE
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text)' }}>
                    ₹{activeBooking.final_fare}
                  </div>
                </div>
                <span
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  💵 Cash to Driver
                </span>
              </div>

              {/* Waypoints progression */}
              {activeBooking.waypoints && activeBooking.waypoints.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      marginBottom: '0.2rem',
                    }}
                  >
                    ROUTE WAYPOINTS
                  </div>
                  {activeBooking.waypoints.map((wp, idx) => (
                    <div
                      key={wp.id || idx}
                      style={{
                        padding: '0.6rem 0.8rem',
                        borderRadius: 'var(--radius-sm)',
                        background: wp.is_completed
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'var(--surface-card)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span>
                        <strong
                          style={{
                            color: wp.waypoint_type === 'pickup' ? '#10b981' : '#ef4444',
                          }}
                        >
                          {wp.waypoint_type.toUpperCase()}:
                        </strong>{' '}
                        {wp.label}
                      </span>
                      {wp.is_completed && <CheckCircle2 size={16} color="var(--accent)" />}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons: SOS & Cancel */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  className="btn-action"
                  onClick={() => handleTriggerSos(activeBooking.id)}
                  style={{
                    background: 'var(--danger)',
                    color: 'white',
                    flex: 1,
                    fontSize: '0.9rem',
                    padding: '0.75rem',
                  }}
                >
                  <ShieldAlert size={18} /> Emergency SOS
                </button>
                <button
                  className="btn-action"
                  onClick={() => handleCancelBooking(activeBooking.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    flex: 1,
                    fontSize: '0.9rem',
                    padding: '0.75rem',
                  }}
                >
                  Cancel Ride
                </button>
              </div>
            </div>
          ) : step === 'rideType' ? (
            /* ========================================================================= */
            /* VIEW 2: STEP 1 - CHOOSE HOW TO RIDE */
            /* ========================================================================= */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                  How would you like to ride?
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  Choose your preferred ride option {userLocation?.city ? `in ${userLocation.city}` : 'in your city'}
                </p>
              </div>

              <div className="ride-type-list">
                {/* 1. Solo Ride */}
                <div
                  className={`ride-type-card ${rideType === 'solo' ? 'selected' : ''}`}
                  onClick={() => {
                    setRideType('solo');
                    setFemaleDriverPreferred(false);
                    setStep('destination');
                  }}
                >
                  <div className="ride-type-icon">🚗</div>
                  <div className="ride-type-info">
                    <div className="ride-type-name">Solo Ride</div>
                    <div className="ride-type-desc">Private ride, just for you</div>
                  </div>
                </div>

                {/* 2. Shared Ride (Save up to 35%) */}
                <div
                  className={`ride-type-card ${rideType === 'shared' ? 'selected' : ''}`}
                  onClick={() => {
                    setRideType('shared');
                    setFemaleDriverPreferred(false);
                    setStep('destination');
                  }}
                >
                  <div className="ride-type-icon">👥</div>
                  <div className="ride-type-info">
                    <div className="ride-type-name">
                      Shared Pool
                      <span
                        style={{
                          background: 'var(--accent)',
                          color: '#ffffff',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        SAVE 35%
                      </span>
                    </div>
                    <div className="ride-type-desc">Share your ride, split the fare</div>
                  </div>
                </div>

                {/* 3. Female Driver (Women's Safety) */}
                <div
                  className={`ride-type-card ${femaleDriverPreferred ? 'selected' : ''}`}
                  onClick={() => {
                    setWomenConfirmStep(1);
                    setWomenConfirmModalOpen(true);
                  }}
                >
                  <div className="ride-type-icon">👩</div>
                  <div className="ride-type-info">
                    <div className="ride-type-name">
                      Female Driver
                      <span
                        style={{
                          background: '#a855f7',
                          color: '#ffffff',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.5rem',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        VERIFIED SAFE
                      </span>
                    </div>
                    <div className="ride-type-desc">Ride with a verified female driver (Women&apos;s Safety)</div>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 'destination' ? (
            /* ========================================================================= */
            /* VIEW 3: STEP 2 - WHERE TO? */
            /* ========================================================================= */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <button className="btn-back" onClick={() => setStep('rideType')}>
                  <ArrowLeft size={16} /> Change ride type
                </button>
                <h2
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    marginTop: '0.5rem',
                    marginBottom: '0.2rem',
                  }}
                >
                  Where to?
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {femaleDriverPreferred
                    ? '👩 Verified Female Driver Mode'
                    : rideType === 'shared'
                    ? '👥 Shared Pool Mode'
                    : '🚗 Solo Private Mode'}
                </p>
              </div>

              {/* Vertical Route Timeline */}
              <div className="route-timeline">
                <span className="timeline-dot-pickup" />
                {/* Pickup Input */}
                <div className="input-box">
                  <input
                    type="text"
                    value={pickupQuery}
                    onChange={(e) => handleSearch(e.target.value, 'pickup')}
                    onFocus={() => setActiveClickField('pickup')}
                    placeholder={userLocation?.label ? `Pickup: ${userLocation.label}` : "Enter pickup location..."}
                  />
                  {pickupSuggestions.length > 0 && (
                    <div className="autocomplete-menu" style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {pickupSuggestions.map((item, idx) => (
                        <div
                          key={idx}
                          className="autocomplete-item"
                          onClick={() => {
                            setPickup(item);
                            setPickupQuery(item.label);
                            setPickupSuggestions([]);
                          }}
                          style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.6rem 0.8rem' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>
                              📍 {item.label}
                            </span>
                            {item.distanceKm != null && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>
                                {item.distanceKm} km
                              </span>
                            )}
                          </div>
                          {item.subLabel && (
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                              {item.subLabel}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <span className="timeline-dot-drop" />
                {/* Destination Input */}
                <div className="input-box">
                  <input
                    type="text"
                    value={destQuery}
                    onChange={(e) => handleSearch(e.target.value, 'dest')}
                    onFocus={() => setActiveClickField('destination')}
                    placeholder={userLocation?.city ? `Search destination in ${userLocation.city}...` : "Where to? (Search destination)..."}
                  />
                  {destSuggestions.length > 0 && (
                    <div className="autocomplete-menu" style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {destSuggestions.map((item, idx) => (
                        <div
                          key={idx}
                          className="autocomplete-item"
                          onClick={() => {
                            setDestination(item);
                            setDestQuery(item.label);
                            setDestSuggestions([]);
                          }}
                          style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.65rem 0.85rem' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
                              🎯 {item.label}
                            </span>
                            {item.distanceKm != null && (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>
                                {item.distanceKm} km
                              </span>
                            )}
                          </div>
                          {item.subLabel && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              {item.subLabel}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Popular Landmarks in User City */}
              {userLocation?.city && (
                <div style={{ margin: '0.2rem 0 0.5rem' }}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      marginBottom: '0.45rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      letterSpacing: '0.03em',
                    }}
                  >
                    <Sparkles size={12} style={{ color: 'var(--accent)' }} />
                    POPULAR DESTINATIONS IN {userLocation.city.toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {getCityLandmarks(userLocation.city).slice(0, 6).map((lm, idx) => {
                      const isSelected = destination?.label === lm.label;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const loc = { lat: lm.lat, lng: lm.lng, label: lm.label, city: userLocation.city };
                            setDestination(loc);
                            setDestQuery(lm.label);
                            setDestSuggestions([]);
                          }}
                          style={{
                            background: isSelected ? 'var(--accent)' : 'var(--surface-card)',
                            color: isSelected ? '#fff' : 'var(--text-secondary)',
                            border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                            borderRadius: 'var(--radius-full)',
                            padding: '0.3rem 0.7rem',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {lm.label.split('(')[0].trim()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Map/Search guidance instead of dummy locations */}
              <div
                style={{
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 0.9rem',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <MapPin size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span>
                  Search your destination address above or tap anywhere on the map to set your dropoff point.
                </span>
              </div>

              {/* Distance & ETA preview */}
              {distanceKm > 0 && (
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                  }}
                >
                  <span>
                    📏 Distance: <strong>{distanceKm} km</strong>
                  </span>
                  <span>
                    ⏱️ Est. Travel: <strong>{durationMin} min</strong>
                  </span>
                </div>
              )}

              {/* Continue Button */}
              <button
                className="btn-action btn-action-green"
                onClick={() => setStep('vehicle')}
                disabled={distanceKm <= 0}
                style={{ marginTop: '0.5rem' }}
              >
                Continue to Choose Ride
              </button>
            </div>
          ) : (
            /* ========================================================================= */
            /* VIEW 4: STEP 3 - CHOOSE VEHICLE & FARE BREAKDOWN */
            /* ========================================================================= */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <button className="btn-back" onClick={() => setStep('destination')}>
                  <ArrowLeft size={16} /> Change destination
                </button>
                <h2
                  style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    marginTop: '0.5rem',
                    marginBottom: '0.2rem',
                  }}
                >
                  Choose your ride
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {femaleDriverPreferred
                    ? '🌸 Verified Female Driver Ride'
                    : rideType === 'shared'
                    ? '🤝 Shared Pool (Discounted)'
                    : '👤 Solo Private Ride'}
                </p>
                {femaleDriverPreferred && (
                  <div
                    style={{
                      background: 'rgba(168, 85, 247, 0.12)',
                      border: '1px solid rgba(168, 85, 247, 0.35)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.35rem 0.65rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#a855f7',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.25rem',
                      width: 'fit-content',
                    }}
                  >
                    🌸 Female Driver Requested (Women&apos;s Safety)
                  </div>
                )}
              </div>

              {/* Vehicle Options List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {[
                  {
                    type: 'rickshaw',
                    name: 'Auto Rickshaw',
                    icon: '🛺',
                    desc: 'Quick city ride • 3 seats',
                  },
                  {
                    type: 'mini',
                    name: 'Mini Hatchback',
                    icon: '🚗',
                    desc: 'Compact everyday cab • 4 seats',
                  },
                  {
                    type: 'cab',
                    name: 'Prime Sedan',
                    icon: '🚖',
                    desc: 'Spacious sedan • 4 seats',
                  },
                  {
                    type: 'suv',
                    name: 'Prime SUV',
                    icon: '🚙',
                    desc: 'Extra room • 6 seats',
                  },
                ].map((v) => {
                  const est = estimates.find((e) => e.vehicleType === v.type);
                  const isSelected = selectedVehicle === v.type;
                  const price = est
                    ? rideType === 'shared'
                      ? est.sharedFare
                      : est.soloFare
                    : '--';

                  return (
                    <div
                      key={v.type}
                      className={`vehicle-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedVehicle(v.type)}
                    >
                      <div className="vehicle-details">
                        <div className="vehicle-icon">{v.icon}</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1rem' }}>{v.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {v.desc}
                          </div>
                        </div>
                      </div>

                      <div className="vehicle-pricing">
                        <div>
                          {rideType === 'shared' && est && (
                            <span className="vehicle-price-original">₹{est.soloFare}</span>
                          )}
                          <span className="vehicle-price">₹{price}</span>
                        </div>
                        {rideType === 'shared' && est && est.sharedDiscountPercent > 0 && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--accent)',
                              fontWeight: 700,
                            }}
                          >
                            Save {est.sharedDiscountPercent}%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Fare Summary Breakdown Card */}
              {selectedEstimate && (
                <div
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span>Distance Base Rate ({distanceKm} km)</span>
                    <span>₹{selectedEstimate.baseFare}</span>
                  </div>

                  {rideType === 'shared' ? (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--accent)',
                        fontWeight: 600,
                      }}
                    >
                      <span>
                        Pool Discount ({selectedEstimate.sharedDiscountPercent}%)
                      </span>
                      <span>-₹{selectedEstimate.sharedSavingsVsBase}</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span>Solo Multiplier (1.5×)</span>
                      <span>
                        +₹{selectedEstimate.soloFare - selectedEstimate.baseFare}
                      </span>
                    </div>
                  )}

                  <div
                    style={{
                      borderTop: '1px solid var(--border)',
                      paddingTop: '0.65rem',
                      marginTop: '0.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: '1rem' }}>Total Fare</span>
                    <span
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 900,
                        color: 'var(--accent)',
                      }}
                    >
                      ₹
                      {rideType === 'shared'
                        ? selectedEstimate.sharedFare
                        : selectedEstimate.soloFare}
                    </span>
                  </div>
                </div>
              )}

              {/* Shared Pool Match Candidates Section */}
              {rideType === 'shared' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <Users size={15} style={{ color: 'var(--accent)' }} /> AVAILABLE SHARED POOLS NEARBY
                  </div>

                  {loadingCandidates ? (
                    <div
                      style={{
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem',
                        textAlign: 'center',
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <Loader size={15} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
                      Scanning for active shared cabs along your route...
                    </div>
                  ) : candidates.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {candidates.map((cand) => {
                        const isSelected = selectedCandidateId === cand.bookingId;
                        return (
                          <div
                            key={cand.bookingId}
                            onClick={() => setSelectedCandidateId(isSelected ? null : cand.bookingId)}
                            style={{
                              border: isSelected
                                ? '2px solid var(--accent)'
                                : '1px solid var(--border)',
                              background: isSelected
                                ? 'rgba(16, 185, 129, 0.08)'
                                : 'var(--surface-card)',
                              borderRadius: 'var(--radius-md)',
                              padding: '0.85rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isSelected ? '0 0 10px rgba(16, 185, 129, 0.2)' : 'none',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '0.35rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: '50%',
                                    background: 'var(--accent)',
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    fontWeight: 800,
                                  }}
                                >
                                  {cand.primaryRiderName ? cand.primaryRiderName.charAt(0) : 'R'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                                    {cand.primaryRiderName}&apos;s Cab
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    {cand.pickupDistanceKm < 1
                                      ? `${Math.round(cand.pickupDistanceKm * 1000)}m away`
                                      : `${cand.pickupDistanceKm.toFixed(1)} km away`}{' '}
                                    • {cand.currentPassengers}/{cand.maxPassengers} seats
                                  </div>
                                </div>
                              </div>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: 'var(--radius-full)',
                                  background: cand.status === 'accepted' ? '#10b981' : '#f59e0b',
                                  color: '#fff',
                                }}
                              >
                                {cand.status === 'accepted' ? 'Driver Assigned' : 'Finding Driver'}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                              📍 <strong>Route:</strong> {cand.pickupLabel?.substring(0, 28)}... → {cand.destinationLabel?.substring(0, 28)}...
                            </div>

                            <div
                              style={{
                                fontSize: '0.74rem',
                                color: isSelected ? 'var(--accent)' : 'var(--text-muted)',
                                fontWeight: 700,
                                marginTop: '0.45rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                              }}
                            >
                              <CheckCircle2 size={14} color={isSelected ? 'var(--accent)' : 'var(--text-muted)'} />
                              {isSelected
                                ? 'Selected to join! Click Confirm button below'
                                : 'Tap to select and join this shared cab'}
                            </div>
                          </div>
                        );
                      })}

                      {selectedCandidateId && (
                        <button
                          type="button"
                          onClick={() => setSelectedCandidateId(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textAlign: 'right',
                            padding: '0.1rem 0',
                          }}
                        >
                          Or start a brand-new shared pool instead
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.75rem 0.9rem',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <Users size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span>
                        No other riders on your route yet. Confirm below to start your pool, and nearby riders can join you!
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Explicit Confirmation Booking Button */}
              {rideType === 'shared' && selectedCandidateId ? (
                <button
                  className="btn-action btn-action-green"
                  onClick={() => handleJoinSharedPool(selectedCandidateId)}
                  disabled={loading}
                  style={{
                    boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                  }}
                >
                  {loading
                    ? 'Confirming & Joining Pool...'
                    : `Confirm & Join Shared Pool (₹${selectedEstimate?.sharedFare || '--'})`}
                </button>
              ) : (
                <button
                  className="btn-action btn-action-green"
                  onClick={handleConfirmRide}
                  disabled={loading}
                  style={{
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                  }}
                >
                  {loading
                    ? 'Confirming Ride...'
                    : rideType === 'shared'
                    ? `Confirm & Book Shared Ride (₹${selectedEstimate?.sharedFare || '--'})`
                    : `Confirm Ride Booking (₹${selectedEstimate?.soloFare || '--'})`}
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Right Map Viewport */}
      <InteractiveMap
        userLocation={userLocation}
        pickup={pickup}
        destination={destination}
        driverLocation={
          activeBooking?.driver
            ? {
                lat: activeBooking.driver.current_lat || (pickup?.lat ? pickup.lat + 0.0075 : 19.9912),
                lng: activeBooking.driver.current_lng || (pickup?.lng ? pickup.lng - 0.0055 : 73.8090),
              }
            : null
        }
        coPassengerLocation={
          activeBooking?.passenger_count > 1
            ? {
                lat: destination.lat + 0.006,
                lng: destination.lng + 0.006,
                label: 'Co-Passenger',
              }
            : null
        }
        routePolyline={routePolyline}
        onMapClick={handleMapClick}
        onRequestLocation={requestLocationAccess}
      />

      {/* Post-Ride Rating Modal */}
      <RatingModal
        isOpen={ratingModalOpen}
        onClose={() => setRatingModalOpen(false)}
        bookingId={completedBookingToRate?.id}
        driverName={completedBookingToRate?.driver?.name}
        onSubmitted={() => setCompletedBookingToRate(null)}
      />

      {/* Women's Safety Booking Confirmation Modal */}
      <Modal
        isOpen={womenConfirmModalOpen}
        onClose={() => setWomenConfirmModalOpen(false)}
        title="🌸 Women's Safety Ride Confirmation"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
          {womenConfirmStep === 1 && (
            <>
              <div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem', color: 'var(--text)' }}>
                  Is this ride for a woman passenger?
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Our verified female driver fleet provides dedicated safety for female riders. You can book for yourself or on behalf of a female family member, friend, or colleague.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-action btn-action-green"
                  onClick={() => {
                    setRideType('solo');
                    setFemaleDriverPreferred(true);
                    setWomenConfirmModalOpen(false);
                    setStep('destination');
                  }}
                  style={{
                    padding: '0.9rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={18} /> Yes, this ride is for a woman
                </button>

                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setWomenConfirmStep(2)}
                  style={{
                    padding: '0.85rem 1rem',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                  }}
                >
                  No, this ride is being booked for someone else
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setWomenConfirmModalOpen(false)}
                  style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {womenConfirmStep === 2 && (
            <>
              <div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.4rem', color: 'var(--text)' }}>
                  Will the passenger taking this trip be a woman?
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  You can book on behalf of a female family member (mother, sister, wife, daughter), friend, or colleague. Will the passenger taking this trip be a woman?
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-action btn-action-green"
                  onClick={() => {
                    setRideType('solo');
                    setFemaleDriverPreferred(true);
                    setWomenConfirmModalOpen(false);
                    setStep('destination');
                  }}
                  style={{
                    padding: '0.9rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    fontWeight: 700,
                  }}
                >
                  <CheckCircle2 size={18} /> Yes, I am booking for a woman passenger
                </button>

                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setWomenConfirmStep(3)}
                  style={{
                    padding: '0.85rem 1rem',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                  }}
                >
                  No, the passenger is not a woman
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setWomenConfirmStep(1)}
                  style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setWomenConfirmModalOpen(false)}
                  style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {womenConfirmStep === 3 && (
            <>
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                }}
              >
                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.35rem', color: 'var(--danger)' }}>
                  Women-Specific Safety Fleet Policy
                </h4>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Under GoShare community safety guidelines, the Female Driver option is exclusively reserved for rides taken by women passengers.
                  For male or general bookings, please choose our standard Solo Ride or Shared Pool option.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn-action btn-action-green"
                  onClick={() => {
                    setRideType('solo');
                    setFemaleDriverPreferred(false);
                    setWomenConfirmModalOpen(false);
                    setStep('destination');
                  }}
                  style={{
                    padding: '0.85rem 1rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <Car size={16} /> Continue with Standard Solo Ride
                </button>

                <button
                  type="button"
                  className="btn-action"
                  onClick={() => {
                    setWomenConfirmModalOpen(false);
                  }}
                  style={{
                    padding: '0.8rem 1rem',
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
