import React, { useState } from 'react';
import Modal from '../common/Modal.jsx';
import { Star, CheckCircle } from 'lucide-react';
import api from '../../services/api.js';

export default function RatingModal({ isOpen, onClose, bookingId, driverName, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!bookingId) return;

    setSubmitting(true);
    setError('');
    try {
      await api.submitRating({
        booking_id: bookingId,
        rating,
        comment,
      });
      setSuccess(true);
      setTimeout(() => {
        if (onSubmitted) onSubmitted();
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Rate Your Driver">
      {success ? (
        <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <CheckCircle size={48} color="var(--accent-success)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Thank You!</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Your feedback helps keep the GoShare community safe and reliable.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              How was your trip with <strong style={{ color: 'var(--text-primary)' }}>{driverName || 'your driver'}</strong>?
            </div>

            {/* Interactive Stars */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', margin: '1rem 0' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(star)}
                  style={{
                    padding: '0.25rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transform: (hoverRating || rating) >= star ? 'scale(1.15)' : 'scale(1)',
                    transition: 'transform var(--transition-fast)',
                  }}
                >
                  <Star
                    size={32}
                    fill={(hoverRating || rating) >= star ? '#f59e0b' : 'none'}
                    color={(hoverRating || rating) >= star ? '#f59e0b' : 'var(--text-muted)'}
                  />
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--accent-warning)', fontWeight: 600 }}>
              {rating === 5 && '🌟 Exceptional service!'}
              {rating === 4 && '👍 Great ride!'}
              {rating === 3 && '🙂 Average trip'}
              {rating === 2 && '😕 Could have been better'}
              {rating === 1 && '⚠️ Poor experience'}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Feedback or Comments (Optional)</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Polite driving, clean car, smooth ride..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Skip
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
