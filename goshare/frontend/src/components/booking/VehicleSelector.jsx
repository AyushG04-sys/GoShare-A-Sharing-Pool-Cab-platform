import React from 'react';
import { Users, Clock, Sparkles } from 'lucide-react';

const VEHICLES = [
  {
    type: 'rickshaw',
    label: 'Auto Rickshaw',
    icon: '🛺',
    capacity: 3,
    description: 'Quick & economical for city traffic',
  },
  {
    type: 'mini',
    label: 'Mini Hatchback',
    icon: '🚗',
    capacity: 4,
    description: 'Comfortable compact everyday ride',
  },
  {
    type: 'cab',
    label: 'Prime Sedan',
    icon: '🚖',
    capacity: 4,
    description: 'Spacious sedan with top-rated drivers',
  },
  {
    type: 'suv',
    label: 'Prime SUV',
    icon: '🚙',
    capacity: 6,
    description: 'Extra legroom & large luggage space',
  },
];

export default function VehicleSelector({
  selectedVehicle,
  onSelectVehicle,
  estimates = [],
  rideType = 'shared',
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Select Vehicle Class</span>
        <span style={{ color: 'var(--accent-primary)', fontSize: '0.8rem' }}>
          {rideType === 'shared' ? '🤝 Smart Pool Pricing Applied' : '👤 Solo Private Ride'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {VEHICLES.map((v) => {
          const estimate = estimates.find((e) => e.vehicleType === v.type);
          const isSelected = selectedVehicle === v.type;
          const displayFare = estimate
            ? rideType === 'shared'
              ? estimate.sharedFare
              : estimate.soloFare
            : null;

          return (
            <div
              key={v.type}
              onClick={() => onSelectVehicle(v.type)}
              className="card"
              style={{
                cursor: 'pointer',
                padding: '1rem',
                border: isSelected
                  ? '2px solid var(--accent-primary)'
                  : '1px solid var(--border-subtle)',
                background: isSelected ? 'var(--accent-primary-subtle)' : 'var(--bg-surface)',
                boxShadow: isSelected ? '0 0 15px rgba(37, 99, 235, 0.25)' : 'none',
                position: 'relative',
                transition: 'all var(--transition-fast)',
              }}
            >
              {estimate && rideType === 'shared' && estimate.sharedDiscountPercent > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                  }}
                >
                  <Sparkles size={10} /> {estimate.sharedDiscountPercent}% OFF
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '2rem' }} className={isSelected ? 'anim-float' : ''}>
                  {v.icon}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{v.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Users size={12} /> Seats {v.capacity}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', minHeight: 28 }}>
                {v.description}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.5rem' }}>
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                    {displayFare !== null ? `₹${displayFare}` : '--'}
                  </span>
                  {rideType === 'shared' && estimate && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'line-through', marginLeft: '0.4rem' }}>
                      ₹{estimate.soloFare}
                    </span>
                  )}
                </div>

                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Clock size={12} /> 2-5 min away
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
