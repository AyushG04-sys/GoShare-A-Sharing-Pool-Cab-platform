import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { TrendingUp, Award, Star, ArrowLeft, CheckCircle, IndianRupee, Car } from 'lucide-react';

export default function DriverEarningsPage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await api.getDriverEarnings();
        setStats(res.data);
      } catch (err) {
        setError(err.message || 'Failed to load driver earnings');
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '2.5rem 1.5rem' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <button
        className="btn-back"
        onClick={() => onNavigate('driver')}
        style={{ marginBottom: '1rem' }}
      >
        <ArrowLeft size={16} /> Back to Driver Console
      </button>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={24} color="var(--accent-primary)" /> Earnings & Performance
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Track your revenue, completed trips, and passenger feedback
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <LoadingSpinner message="Calculating your earnings..." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Metric Cards */}
          <div className="grid-3">
            <div className="card card-hover" style={{ borderLeft: '4px solid var(--accent-success)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                TOTAL EARNINGS
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-success)', display: 'flex', alignItems: 'center' }}>
                ₹{stats?.totalEarnings || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Paid out directly in cash & UPI
              </div>
            </div>

            <div className="card card-hover" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                COMPLETED TRIPS
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                {stats?.completedTrips || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Successful passenger drops in Pune
              </div>
            </div>

            <div className="card card-hover" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                AVERAGE RATING
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Star size={24} fill="#f59e0b" /> {stats?.avgRating || 5.0}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Based on {stats?.totalReviews || 0} passenger reviews
              </div>
            </div>
          </div>

          {/* Performance Badge Card */}
          <div className="card card-glass" style={{ padding: '1.75rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
              }}
            >
              <Award size={32} />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>Top Rated Driver Partner</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Your punctuality and high completion rates qualify you for priority booking matching in high-demand zones.
              </p>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
