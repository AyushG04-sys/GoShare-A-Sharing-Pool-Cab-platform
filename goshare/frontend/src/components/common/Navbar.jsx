import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { Sun, Moon, LogOut, User, Car, ShieldAlert, Clock, Sparkles, Menu, X, TrendingUp } from 'lucide-react';

export default function Navbar({ onNavigate, currentPage }) {
  const { profile, isAuthenticated, logout, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (page) => {
    setMobileMenuOpen(false);
    onNavigate(page);
  };

  const handleLogout = () => {
    setMobileMenuOpen(false);
    logout();
  };

  return (
    <header className="app-header">
      {/* Brand Logo */}
      <div
        className="app-logo"
        onClick={() => handleNavClick(isAuthenticated ? (role === 'driver' ? 'driver' : 'passenger') : 'register')}
      >
        <div className="app-logo-badge">G</div>
        <div className="app-logo-text">
          GoShare<span>.</span>
        </div>
      </div>

      {/* Role Navigation Links — Desktop (hidden on mobile <= 768px via .desktop-nav) */}
      {isAuthenticated && (
        <div className="desktop-nav">
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

      {/* Right Actions: Theme Toggle, User Profile, Mobile Menu Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto' }}>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', color: 'var(--text-muted)' }}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun size={18} color="#fbbf24" /> : <Moon size={18} color="#6366f1" />}
        </button>

        {/* Auth status */}
        {isAuthenticated ? (
          <>
            {/* Desktop user pill + logout (hidden on mobile <= 768px via .desktop-auth-pill) */}
            <div className="desktop-auth-pill">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.825rem',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: role === 'admin' ? 'var(--danger)' : role === 'driver' ? '#3b82f6' : 'var(--accent)',
                  }}
                />
                <strong>{profile?.name || 'User'}</strong>
                <span
                  style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    background:
                      role === 'admin'
                        ? 'rgba(239, 68, 68, 0.15)'
                        : role === 'driver'
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(16, 185, 129, 0.15)',
                    color: role === 'admin' ? '#ef4444' : role === 'driver' ? '#3b82f6' : '#10b981',
                  }}
                >
                  {role === 'driver' ? 'Driver' : role === 'admin' ? 'Admin' : 'Passenger'}
                </span>
              </div>

              <button
                onClick={handleLogout}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: '0.35rem' }}
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>

            {/* Mobile Menu Button (visible <= 768px) */}
            <button
              className="mobile-nav-toggle"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </>
        ) : (
          currentPage === 'register' ? (
            <button
              onClick={() => handleNavClick('login')}
              className="btn-action btn-action-green"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', width: 'auto' }}
            >
              Sign In
            </button>
          ) : (
            <button
              onClick={() => handleNavClick('register')}
              className="btn-action btn-action-green"
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem', width: 'auto' }}
            >
              Sign Up
            </button>
          )
        )}
      </div>

      {/* Mobile Dropdown Menu (only rendered when open on mobile) */}
      {isAuthenticated && mobileMenuOpen && (
        <div className="mobile-nav-dropdown">
          {/* User profile row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.6rem 0.75rem',
              background: 'var(--surface-card)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: role === 'admin' ? 'var(--danger)' : role === 'driver' ? '#3b82f6' : 'var(--accent)',
                }}
              />
              <strong style={{ fontSize: '0.9rem' }}>{profile?.name || 'User'}</strong>
            </div>
            <span
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                background:
                  role === 'admin'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : role === 'driver'
                    ? 'rgba(59, 130, 246, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                color: role === 'admin' ? '#ef4444' : role === 'driver' ? '#3b82f6' : '#10b981',
              }}
            >
              {role === 'driver' ? 'Driver Partner' : role === 'admin' ? 'Admin' : 'Passenger'}
            </span>
          </div>

          {/* Navigation Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {role !== 'driver' && (
              <button
                className={`btn ${currentPage === 'passenger' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => handleNavClick('passenger')}
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem', fontSize: '0.92rem' }}
              >
                <Car size={18} /> Ride Booking
              </button>
            )}

            {role === 'driver' && (
              <>
                <button
                  className={`btn ${currentPage === 'driver' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleNavClick('driver')}
                  style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem', fontSize: '0.92rem' }}
                >
                  <Car size={18} /> Driver Console
                </button>

                <button
                  className={`btn ${currentPage === 'earnings' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => handleNavClick('earnings')}
                  style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem', fontSize: '0.92rem' }}
                >
                  <TrendingUp size={18} /> Earnings & Performance
                </button>
              </>
            )}

            <button
              className={`btn ${currentPage === 'history' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handleNavClick('history')}
              style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem', fontSize: '0.92rem' }}
            >
              <Clock size={18} /> Ride History
            </button>

            {role === 'admin' && (
              <button
                className={`btn ${currentPage === 'admin' ? 'btn-danger' : 'btn-ghost'}`}
                onClick={() => handleNavClick('admin')}
                style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem', fontSize: '0.92rem' }}
              >
                <ShieldAlert size={18} /> Admin Operations
              </button>
            )}
          </div>

          {/* Logout button */}
          <button
            className="btn btn-secondary"
            onClick={handleLogout}
            style={{
              justifyContent: 'center',
              marginTop: '0.35rem',
              color: 'var(--danger)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              padding: '0.7rem',
            }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}
    </header>
  );
}
