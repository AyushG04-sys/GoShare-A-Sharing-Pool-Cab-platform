import React from 'react';
import { Phone, Car, MapPin, CheckCircle2, ShieldAlert, XCircle, Navigation, ShieldCheck } from 'lucide-react';

export default function ActiveRideCard({
  booking,
  rawOtp,
  onCancel,
  onTriggerSos,
  isDriverView = false,
}) {
  if (!booking) return null;

  const {
    id,
    status,
    ride_type,
    vehicle_category,
    final_fare,
    driver,
    creator,
    pickup_label,
    destination_label,
    waypoints = [],
    passenger_count = 1,
  } = booking;

  const isPending = status === 'pending';
  const isAccepted = status === 'accepted';
  const isInProgress = status === 'in_progress';

  return (
    <div className="card card-glass anim-pulse" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid var(--accent-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-primary">{vehicle_category.toUpperCase()}</span>
          <span className="badge badge-success">{ride_type.toUpperCase()} POOL</span>
          {passenger_count > 1 && (
            <span className="badge badge-warning">2 RIDERS POOLED</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            className={`badge ${
              isPending ? 'badge-warning' : isAccepted ? 'badge-primary' : 'badge-success'
            }`}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
          >
            {isPending && '🔍 Finding Driver...'}
            {isAccepted && '🚗 Driver En Route'}
            {isInProgress && '🟢 Ride In Progress'}
          </span>
        </div>
      </div>

      {/* Driver or Passenger Info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
        {!isDriverView ? (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              ASSIGNED DRIVER & VEHICLE
            </div>
            {driver ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {driver.name}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                  <Car size={14} /> {driver.vehicle_number || 'MH-12-AB-9876'}
                </div>
                {driver.phone && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                    <Phone size={13} /> {driver.phone}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                Matching nearby available drivers in Pune...
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
              PRIMARY PASSENGER
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{creator?.name || 'Passenger'}</div>
            {creator?.phone && (
              <div style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Phone size={14} /> {creator.phone}
              </div>
            )}
          </div>
        )}

        {/* Fare & OTP Box for Rider */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isDriverView ? 'flex-start' : 'flex-end', justifyContent: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>FARE PAYABLE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
            ₹{final_fare}
          </div>

          {!isDriverView && (
            <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                RIDE START PIN (Share with driver)
              </div>
              <div style={{ display: 'inline-flex', gap: '0.35rem', marginTop: '0.2rem' }}>
                {String(rawOtp || '••••')
                  .split('')
                  .map((digit, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--accent-primary)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: '1rem',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      {digit}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Waypoint Route Progression Timeline */}
      {waypoints && waypoints.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            WAYPOINT PROGRESSION
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {waypoints.map((wp, index) => {
              const isCompleted = wp.is_completed;
              return (
                <div
                  key={wp.id || index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    background: isCompleted ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: isCompleted
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid var(--border-subtle)',
                  }}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={18} color="var(--accent-success)" />
                  ) : (
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: '2px solid var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                      }}
                    >
                      {index + 1}
                    </div>
                  )}

                  <div style={{ flex: 1, fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: wp.waypoint_type === 'pickup' ? '#34d399' : '#f87171' }}>
                      {wp.waypoint_type.toUpperCase()}:
                    </span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{wp.label}</span>
                  </div>

                  <span className={`badge ${wp.waypoint_type === 'pickup' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>
                    {wp.waypoint_type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Footer: Emergency SOS & Cancellation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => onTriggerSos && onTriggerSos(id)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
        >
          <ShieldAlert size={16} /> EMERGENCY SOS
        </button>

        {!isDriverView && (isPending || isAccepted) && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onCancel && onCancel(id)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-danger)' }}
          >
            <XCircle size={15} /> Cancel Booking
          </button>
        )}
      </div>
    </div>
  );
}
