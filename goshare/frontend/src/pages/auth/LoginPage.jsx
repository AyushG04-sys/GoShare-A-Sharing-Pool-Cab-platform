import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { User, Lock, Mail, ArrowRight, Zap, Car, Shield } from 'lucide-react';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import api from '../../services/api.js';

export default function LoginPage({ onNavigate }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login({ email, password });
      const { token, profile } = res.data;
      login(token, profile);

      if (profile?.role === 'driver') onNavigate('driver');
      else if (profile?.role === 'admin') onNavigate('admin');
      else onNavigate('passenger');
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('invalid login credentials')) {
        setError('Invalid email or password. If you haven\'t created an account yet, please click "Sign Up Here" below!');
      } else {
        setError(err.message || 'Authentication error');
      }
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
        padding: '2rem 1.5rem',
        background: 'radial-gradient(ellipse at 50% 20%, rgba(16, 185, 129, 0.12), transparent 70%)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: '2.5rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="app-logo-badge" style={{ margin: '0 auto 0.85rem', width: 48, height: 48, fontSize: '1.6rem' }}>
            G
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.35rem' }}>Welcome to GoShare</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Sign in with your account to book pooled rides or manage your trips
          </p>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError('')} />

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
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
                placeholder="••••••••"
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

          <button
            type="submit"
            className="btn-action btn-action-green"
            style={{ marginTop: '1.25rem' }}
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign In'} <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Don't have an account?{' '}
          <button
            onClick={() => onNavigate('register')}
            style={{ color: 'var(--accent)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Sign Up Here
          </button>
        </div>
      </div>
    </div>
  );
}
