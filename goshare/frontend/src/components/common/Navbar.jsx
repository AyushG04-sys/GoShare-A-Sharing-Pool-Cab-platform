import React from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Sun, Moon, LogOut, User, Car, ShieldAlert, Clock, Sparkles } from 'lucide-react';

export default function Navbar({ onNavigate, currentPage }) {
  const { profile, isAuthenticated, logout, role } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="app-header">
      {/* Brand Logo */}
      <div className="app-logo" onClick={() => onNavigate(isAuthenticated ? (role === 'driver' ? 'driver' : 'passenger') : 'register')}>
        <div className="app-logo-badge">G</div>
        <div className="app-logo-text">
          GoShare<span>.</span>
        </div>
      </div>

      {/* Role Navigation Links — Strictly tailored to logged in role */}
      {isAuthenticated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {/* Rider-only tab: Ride booking */}
          {role !== 'driver' && (
            <button
              className={`btn-back ${currentPage === 'passenger' ? 'active' : ''}`}
              onClick={() => onNavigate('passenger')}
              style={{
                color: currentPage === 'passenger' ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: currentPage === 'passenger' ? 700 : 500,
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                background: currentPage === 'passenger' ? 'var(--surface-hover)' : 'transparent',
              }}
            >
              Ride
            </button>
          )}

          {/* Driver-only tabs: Driver Console & Earnings */}
          {role === 'driver' && (
            <>
              <button
                className={`btn-back ${currentPage === 'driver' ? 'active' : ''}`}
                onClick={() => onNavigate('driver')}
                style={{
                  color: currentPage === 'driver' ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: currentPage === 'driver' ? 700 : 500,
                  padding: '0.4rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  background: currentPage === 'driver' ? 'var(--surface-hover)' : 'transparent',
                }}
              >
                Driver Console
              </button>

              <button
                className={`btn-back ${currentPage === 'earnings' ? 'active' : ''}`}
                onClick={() => onNavigate('earnings')}
                style={{
                  color: currentPage === 'earnings' ? 'var(--primary)' : 'var(--text-muted)',
                  fontWeight: currentPage === 'earnings' ? 700 : 500,
                  padding: '0.4rem 0.8rem',
                  borderRadius: 'var(--radius-sm)',
                  background: currentPage === 'earnings' ? 'var(--surface-hover)' : 'transparent',
                }}
              >
                Earnings
              </button>
            </>
          )}

          {/* History: shared by rider and driver */}
          <button
            className={`btn-back ${currentPage === 'history' ? 'active' : ''}`}
            onClick={() => onNavigate('history')}
            style={{
              color: currentPage === 'history' ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: currentPage === 'history' ? 700 : 500,
              padding: '0.4rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              background: currentPage === 'history' ? 'var(--surface-hover)' : 'transparent',
            }}
          >
            History
          </button>

          {/* Admin Navigation: ONLY shown for role === 'admin' */}
          {role === 'admin' && (
            <button
              className={`btn-back ${currentPage === 'admin' ? 'active' : ''}`}
              onClick={() => onNavigate('admin')}
              style={{
                color: currentPage === 'admin' ? 'var(--danger)' : 'var(--text-muted)',
                fontWeight: currentPage === 'admin' ? 700 : 500,
                padding: '0.4rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                background: currentPage === 'admin' ? 'var(--surface-hover)' : 'transparent',
              }}
            >
              Admin
            </button>
          )}
        </div>
      )}

      {/* Right Actions: Theme Toggle & User Profile (Rider/Driver toggle removed) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', color: 'var(--text-muted)' }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#6366f1" />}
        </button>

        {/* Auth status */}
        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '0.3rem 0.75rem', fontSize: '0.825rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: role === 'admin' ? 'var(--danger)' : role === 'driver' ? '#3b82f6' : 'var(--accent)' }}></span>
              <strong>{profile?.name || 'User'}</strong>
              <span style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '0.15rem 0.45rem',
                borderRadius: 'var(--radius-sm)',
                background: role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : role === 'driver' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: role === 'admin' ? '#ef4444' : role === 'driver' ? '#3b82f6' : '#10b981',
              }}>
                {role === 'driver' ? 'Driver' : role === 'admin' ? 'Admin' : 'Passenger'}
              </span>
            </div>

            <button
              onClick={logout}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: '0.35rem' }}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          currentPage === 'register' ? (
            <button
              onClick={() => onNavigate('login')}
              className="btn-action btn-action-green"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', width: 'auto' }}
            >
              Sign In
            </button>
          ) : (
            <button
              onClick={() => onNavigate('register')}
              className="btn-action btn-action-green"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', width: 'auto' }}
            >
              Sign Up
            </button>
          )
        )}
      </div>
    </header>
  );
}
