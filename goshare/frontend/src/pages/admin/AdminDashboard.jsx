import React, { useState, useEffect } from 'react';
import api from '../../services/api.js';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';
import ErrorBanner from '../../components/common/ErrorBanner.jsx';
import {
  ShieldAlert,
  Users,
  Car,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
} from 'lucide-react';

export default function AdminDashboard({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('sos'); // 'sos' | 'drivers' | 'bookings' | 'users'
  const [stats, setStats] = useState(null);
  const [sosAlerts, setSosAlerts] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAllData = async () => {
    try {
      const [statsRes, sosRes, driversRes, bookingsRes, usersRes] = await Promise.all([
        api.getAdminStats().catch(() => ({ data: null })),
        api.getSosAlerts().catch(() => ({ data: { alerts: [] } })),
        api.getAdminDrivers().catch(() => ({ data: { drivers: [] } })),
        api.getAdminBookings().catch(() => ({ data: { bookings: [] } })),
        api.getAdminUsers().catch(() => ({ data: { users: [] } })),
      ]);

      if (statsRes.data) setStats(statsRes.data);
      setSosAlerts(sosRes.data?.alerts || []);
      setDrivers(driversRes.data?.drivers || []);
      setBookings(bookingsRes.data?.bookings || []);
      setUsers(usersRes.data?.users || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update SOS status
  const handleUpdateSos = async (alertId, status) => {
    setActionLoading(true);
    try {
      await api.updateSosAlert(alertId, status, `Updated by admin to ${status}`);
      fetchAllData();
    } catch (err) {
      alert('Error updating SOS: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Change user role
  const handleChangeRole = async (userId, newRole) => {
    if (!window.confirm(`Change this user's role to ${newRole}?`)) return;
    try {
      await api.updateUserRole(userId, newRole);
      fetchAllData();
    } catch (err) {
      alert('Error updating user role: ' + err.message);
    }
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'clamp(1rem, 4vw, 2.5rem) 1rem' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
      {/* Admin Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldAlert size={28} color="var(--accent-danger)" /> Admin Operations Center
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Live platform metrics, emergency SOS dispatch, driver leaderboards, and booking oversight
          </p>
        </div>

        {stats?.activeSosAlerts > 0 && (
          <div
            className="badge badge-danger anim-pulse"
            style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
          >
            🚨 {stats.activeSosAlerts} ACTIVE EMERGENCY ALERTS
          </div>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        <div className="card card-hover" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL REGISTERED USERS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem' }}>
            {stats?.totalUsers || users.length || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Passengers & commuters</div>
        </div>

        <div className="card card-hover" style={{ borderLeft: '4px solid var(--accent-success)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ACTIVE DRIVER FLEET</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem' }}>
            {stats?.totalDrivers || drivers.length || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pune city partners</div>
        </div>

        <div className="card card-hover" style={{ borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SYSTEM BOOKINGS</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem' }}>
            {stats?.totalBookings || bookings.length || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {stats?.completedBookings || 0} completed rides
          </div>
        </div>

        <div className="card card-hover" style={{ borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL PLATFORM FARE VOLUME</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.2rem', color: 'var(--accent-success)' }}>
            ₹{stats?.totalRevenue || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aggregated revenue</div>
        </div>
      </div>

      {/* Tab Selector */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-medium)',
          marginBottom: '1.5rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: '0.5rem',
        }}
      >
        <button
          className={`btn ${activeTab === 'sos' ? 'btn-danger' : 'btn-ghost'}`}
          onClick={() => setActiveTab('sos')}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <ShieldAlert size={16} /> Emergency SOS Alerts ({sosAlerts.length})
        </button>
        <button
          className={`btn ${activeTab === 'drivers' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('drivers')}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <Car size={16} /> Driver Leaderboard ({drivers.length})
        </button>
        <button
          className={`btn ${activeTab === 'bookings' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('bookings')}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <FileText size={16} /> All Bookings ({bookings.length})
        </button>
        <button
          className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('users')}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <Users size={16} /> User Directory ({users.length})
        </button>
      </div>

      {/* Tab 1: Emergency SOS Monitor */}
      {activeTab === 'sos' && (
        <div className="card card-glass" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={20} /> Live SOS Emergency Incident Feed
          </h3>

          {sosAlerts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <CheckCircle size={40} color="var(--accent-success)" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ fontWeight: 600 }}>Zero Active Emergencies</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                All trips are safely progressing. Live incidents will ping here in real time.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {sosAlerts.map((alert) => {
                const isActive = alert.status === 'active';
                return (
                  <div
                    key={alert.id}
                    className="card"
                    style={{
                      background: isActive ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)',
                      border: isActive ? '2px solid var(--accent-danger)' : '1px solid var(--border-subtle)',
                      padding: '1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span className={`badge ${isActive ? 'badge-danger' : 'badge-success'}`}>
                          {alert.status.toUpperCase()}
                        </span>
                        <span className="badge badge-primary">{alert.alert_type.toUpperCase()}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {new Date(alert.created_at).toLocaleTimeString()}
                        </span>
                      </div>

                      <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                        Caller: {alert.user?.name || 'User'} ({alert.user?.phone || 'No phone'})
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        GPS Coordinates: <strong>{alert.current_lat.toFixed(4)}, {alert.current_lng.toFixed(4)}</strong>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        Details: {alert.details}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {alert.status === 'active' && (
                        <button
                          className="btn btn-warning btn-sm"
                          onClick={() => handleUpdateSos(alert.id, 'acknowledged')}
                          disabled={actionLoading}
                        >
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== 'resolved' && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleUpdateSos(alert.id, 'resolved')}
                          disabled={actionLoading}
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Driver Leaderboard */}
      {activeTab === 'drivers' && (
        <div className="card card-glass" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Driver Partner Leaderboard</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Driver Name</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Completed Trips</th>
                  <th>Total Earnings</th>
                  <th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.phone}</div>
                    </td>
                    <td>
                      {d.vehicle_type?.toUpperCase()}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.vehicle_number}</div>
                    </td>
                    <td>
                      <span className={`badge ${d.is_available ? 'badge-success' : 'badge-warning'}`}>
                        {d.is_available ? 'Online' : 'Busy / Off'}
                      </span>
                    </td>
                    <td><strong>{d.tripCount || 0}</strong></td>
                    <td style={{ color: 'var(--accent-success)', fontWeight: 700 }}>₹{d.totalEarnings || 0}</td>
                    <td>⭐ {d.avgRating || 5.0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: System Bookings */}
      {activeTab === 'bookings' && (
        <div className="card card-glass" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>System Bookings Log</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Ride Details</th>
                  <th>Pickup</th>
                  <th>Destination</th>
                  <th>Fare</th>
                  <th>Status</th>
                  <th>Driver</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="badge badge-primary">{b.vehicle_category}</span>
                      <span className="badge badge-success" style={{ marginLeft: '0.3rem' }}>{b.ride_type}</span>
                    </td>
                    <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.pickup_label}
                    </td>
                    <td style={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.destination_label}
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>₹{b.final_fare}</td>
                    <td>
                      <span className={`badge ${b.status === 'completed' ? 'badge-success' : b.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>{b.driver?.name || 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: User Directory */}
      {activeTab === 'users' && (
        <div className="card card-glass" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>User Directory & Permissions</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Current Role</th>
                  <th>Manage Permissions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.phone || 'N/A'}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'driver' ? 'badge-warning' : 'badge-primary'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <select
                        className="form-select"
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.id, e.target.value)}
                        style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      >
                        <option value="user">Passenger (user)</option>
                        <option value="driver">Driver</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
