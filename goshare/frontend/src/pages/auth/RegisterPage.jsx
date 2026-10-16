import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../services/api.js';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import { User, Car, ArrowRight, ShieldCheck, Mail, Lock, Phone } from 'lucide-react';

export default function RegisterPage({ onNavigate }) {
  const { login } = useAuth();
  const [role, setRole] = useState('user');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('male');

  // Driver fields
  const [vehicleType, setVehicleType] = useState('cab');
  const [vehicleNumber, setVehicleNumber] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (role === 'driver' && (!gender || (gender !== 'female' && gender !== 'male'))) {
      setError('Please select your gender (Female or Male Driver Partner).');
      setLoading(false);
      return;
    }

    try {
      const cleanedPhone = phone ? phone.trim() : null;
      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        phone: cleanedPhone || null,
        role,
        gender,
        ...(role === 'driver' && {
          vehicle_type: vehicleType,
          vehicle_number: (vehicleNumber || 'MH-12-AB-1234').trim().toUpperCase(),
        }),
      };

      const res = await api.register(payload);
      const token = res.data?.token || res.data?.session?.access_token;
      const registeredProfile = res.data?.profile || payload;

      if (token) {
        login(token, registeredProfile);
      } else {
        // If account created but requires login
        onNavigate('login');
        return;
      }

      if (role === 'driver') onNavigate('driver');
      else onNavigate('passenger');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2.5rem 1.5rem',
        background: 'radial-gradient(ellipse at 50% 20%, rgba(16, 185, 129, 0.12), transparent 70%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 540,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '2.25rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: '0.25rem' }}>Sign Up for GoShare</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Join thousands saving money and sharing rides across your city
          </p>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError('')} />

        {/* Role Toggle Tabs */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-secondary)',
            padding: '0.35rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            border: '1px solid var(--border)',
            gap: '0.35rem',
          }}
        >
          <button
            type="button"
            className={`btn ${role === 'user' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setRole('user')}
            style={{ flex: 1, padding: '0.65rem' }}
          >
            <User size={16} /> I want to Ride (Passenger)
          </button>
          <button
            type="button"
            className={`btn ${role === 'driver' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setRole('driver');
              if (gender !== 'female' && gender !== 'male') {
                setGender('female');
              }
            }}
            style={{ flex: 1, padding: '0.65rem' }}
          >
            <Car size={16} /> I want to Drive (Partner)
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Aarav Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={{ paddingLeft: '2.5rem' }}
              />
              <User
                size={16}
                style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  placeholder="aarav@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Lock
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Phone Number (Optional)</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  className="form-input"
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Phone
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">
                Gender <span style={{ color: 'var(--accent)', fontWeight: 700 }}>*</span>
              </label>
              {role === 'driver' ? (
                <div>
                  <select
                    className="form-select"
                    value={gender === 'male' ? 'male' : 'female'}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="female">Female Driver Partner</option>
                    <option value="male">Male Driver Partner</option>
                  </select>
                  <div
                    style={{
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)',
                      marginTop: '0.35rem',
                      lineHeight: 1.3,
                    }}
                  >
                    🔒 Stored in your profile to power women&apos;s safety &amp; driver ride matching.
                  </div>
                </div>
              ) : (
                <select
                  className="form-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              )}
            </div>
          </div>

          {/* Conditional Driver Fields */}
          {role === 'driver' && (
            <div
              style={{
                background: 'var(--bg-secondary)',
                padding: '1.25rem',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.25rem',
                border: '1px solid var(--border-medium)',
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
                  gap: '0.4rem',
                }}
              >
                <Car size={16} /> Driver & Vehicle Particulars
              </div>

              <div className="grid-2">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Vehicle Category</label>
                  <select
                    className="form-select"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                  >
                    <option value="rickshaw">🛺 Auto Rickshaw</option>
                    <option value="mini">🚗 Mini Hatchback</option>
                    <option value="cab">🚖 Prime Sedan (Cab)</option>
                    <option value="suv">🚙 Prime SUV</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Plate / Registration No.</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. MH-12-AB-1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    required={role === 'driver'}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: '1rem', marginBottom: '0.25rem' }}>
              <ErrorBanner message={error} onDismiss={() => setError('')} />
            </div>
          )}

          <button
            type="submit"
            className="btn-action btn-action-green"
            style={{ marginTop: error ? '0.75rem' : '1rem' }}
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Sign Up & Continue'} <ArrowRight size={16} />
          </button>
        </form>

        <div
          style={{
            textAlign: 'center',
            marginTop: '1.5rem',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
          }}
        >
          Already registered?{' '}
          <button
            onClick={() => onNavigate('login')}
            style={{ color: 'var(--accent)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Sign In Here
          </button>
        </div>
      </div>
    </div>
  );
}
