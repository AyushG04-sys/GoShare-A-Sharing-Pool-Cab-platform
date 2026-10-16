import React from 'react';
import { Tag, TrendingDown, Info, ShieldCheck } from 'lucide-react';

export default function FareBreakdown({ estimate, rideType = 'shared', distanceKm = 0 }) {
  if (!estimate) return null;

  const isShared = rideType === 'shared';
  const finalFare = isShared ? estimate.sharedFare : estimate.soloFare;

  return (
    <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h4 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Info size={16} color="var(--accent-primary)" /> Fare Computation Details
        </h4>
        <span className="badge badge-primary">{estimate.vehicleLabel}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Route Distance:</span>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{distanceKm} km</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Distance Slab Base:</span>
          <span>₹{estimate.baseFare}</span>
        </div>

        {isShared ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-success)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <TrendingDown size={14} /> Shared Pool Discount ({estimate.sharedDiscountPercent}%):
              </span>
              <span>- ₹{estimate.sharedSavingsVsBase}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <span>Savings vs. Solo Ride:</span>
              <span style={{ color: 'var(--accent-success)', fontWeight: 600 }}>
                Save ₹{estimate.sharedSavingsVsSolo}
              </span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
            <span>Solo Convenience (1.5×):</span>
            <span>+ ₹{estimate.soloFare - estimate.baseFare}</span>
          </div>
        )}

        <div style={{ borderTop: '1px dashed var(--border-medium)', marginTop: '0.4rem', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Total Fare Payable:</span>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
            ₹{finalFare}
          </span>
        </div>

        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
          <ShieldCheck size={13} color="var(--accent-success)" /> No surge pricing • Fuel and GST included
        </div>
      </div>
    </div>
  );
}
