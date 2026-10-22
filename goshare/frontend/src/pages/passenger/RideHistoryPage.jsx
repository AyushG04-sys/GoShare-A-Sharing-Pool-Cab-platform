import React, { useEffect, useState } from 'react';
import api from '../../services/api.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import RatingModal from '../../components/ride/RatingModal.jsx';
import { Clock, MapPin, Star, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

export default function RideHistoryPage({ onNavigate }) {
  const [rides, setRides] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Rating modal state
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const [selectedRideToRate, setSelectedRideToRate] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getRideHistory(50, 0);
      setRides(res.data?.rides || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to fetch ride history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'clamp(1rem, 4vw, 2.5rem) 1rem' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onNavigate('passenger')}
            style={{ marginBottom: '0.5rem', paddingLeft: 0 }}
          >
            <ArrowLeft size={16} /> Back to Booking
          </button>
          <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={24} color="var(--accent-primary)" /> Ride History
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            All past completed and cancelled trips on your GoShare account
          </p>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {loading ? (
        <LoadingSpinner message="Retrieving your ride history..." />
      ) : rides.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <Clock size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No past rides found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            You haven't completed any rides yet. Book your first pooled ride today!
          </p>
          <button className="btn btn-primary" onClick={() => onNavigate('passenger')}>
            Book a Ride Now
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {rides.map((ride) => {
            const isCompleted = ride.status === 'completed';
            const rideDate = new Date(ride.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={ride.id}
                className="card card-hover"
                style={{
                  padding: '1.25rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  borderLeft: `4px solid ${isCompleted ? 'var(--accent-success)' : 'var(--accent-danger)'}`,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxWidth: 540, flex: '1 1 280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span className="badge badge-primary">{ride.vehicle_category.toUpperCase()}</span>
                    <span className="badge badge-success">{ride.ride_type.toUpperCase()}</span>
                    <span
                      className={`badge ${isCompleted ? 'badge-success' : 'badge-danger'}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      {isCompleted ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {ride.status.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{rideDate}</span>
                  </div>

                  <div style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>From:</span> {ride.pickup_label}
                  </div>
                  <div style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ color: '#f87171', fontWeight: 600 }}>To:</span> {ride.destination_label}
                  </div>

                  {ride.driver && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                      Driver: <strong>{ride.driver.name}</strong> • {ride.driver.vehicle_number || 'MH-12-AB-9876'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                    ₹{ride.final_fare}
                  </div>

                  {isCompleted && (
                    <div>
                      {ride.rating && ride.rating.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 600 }}>
                          <Star size={14} fill="#f59e0b" /> Rated {ride.rating[0].rating}/5
                        </div>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedRideToRate(ride);
                            setRatingModalOpen(true);
                          }}
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          <Star size={12} /> Rate Driver
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rating Modal */}
      <RatingModal
        isOpen={ratingModalOpen}
        onClose={() => setRatingModalOpen(false)}
        bookingId={selectedRideToRate?.id}
        driverName={selectedRideToRate?.driver?.name}
        onSubmitted={() => {
          setSelectedRideToRate(null);
          fetchHistory();
        }}
      />
      </div>
    </div>
  );
}
