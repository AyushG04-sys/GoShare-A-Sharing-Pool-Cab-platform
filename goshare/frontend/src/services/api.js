/**
 * Unified API Client for GoShare Backend
 */

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const BASE_URL = API_BASE ? `${API_BASE}/api` : '/api';

export class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(endpoint, options = {}) {
  const token =
    (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('goshare_token')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('goshare_token')) ||
    null;

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    cache: 'no-store',
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, config);
  } catch (err) {
    throw new ApiError('Network connection failed. Please ensure the backend server is reachable.', 0);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let errorMsg = data.error?.message || data.message;
    if (data.error?.details && Array.isArray(data.error.details) && data.error.details.length > 0) {
      const detailMsgs = data.error.details
        .map((d) => (d.message ? d.message.replace(/\"/g, '') : ''))
        .filter(Boolean);
      if (detailMsgs.length > 0) {
        errorMsg = detailMsgs.join('; ');
      }
    }
    if (!errorMsg) {
      if (response.status === 500 || response.status === 502 || response.status === 503) {
        errorMsg = 'Cannot connect to backend server. Please verify backend status and network connectivity.';
      } else {
        errorMsg = `Request failed with status ${response.status}`;
      }
    } else if (errorMsg.includes('Cannot coerce') || errorMsg.includes('PGRST116')) {
      errorMsg = 'This ride request is no longer available (it may have been cancelled by the passenger).';
    }
    throw new ApiError(errorMsg, response.status, data.error?.details || null);
  }

  return data;
}

export const api = {
  // Auth endpoints
  login: (body) => request('/auth/login', { method: 'POST', body }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  demoLogin: (role) => request('/auth/demo-login', { method: 'POST', body: { role } }),
  getProfile: () => request('/auth/me'),
  updateProfile: (body) => request('/auth/profile', { method: 'PUT', body }),

  // Bookings endpoints
  getEstimate: (coords) => request('/bookings/estimate', { method: 'POST', body: coords }),
  getMatchCandidates: (coords) => request('/bookings/match-candidates', { method: 'POST', body: coords }),
  createBooking: (body) => request('/bookings', { method: 'POST', body }),
  joinSharedRide: (bookingId, body) => request(`/bookings/${bookingId}/join`, { method: 'POST', body }),
  getActivePassengerRide: () => request('/bookings/active'),
  autoAssignDriver: (bookingId) => request(`/bookings/${bookingId}/auto-accept`, { method: 'POST' }),
  getRideHistory: (limit = 20, offset = 0) => request(`/bookings/history?limit=${limit}&offset=${offset}`),
  cancelBooking: (bookingId, reason) => request(`/bookings/${bookingId}/cancel`, { method: 'POST', body: { reason } }),

  // Driver endpoints
  getDriverActiveRide: () => request('/driver/active'),
  getDriverRequests: () => request('/driver/requests'),
  updateDriverStatus: (is_available) => request('/driver/status', { method: 'POST', body: { is_available } }),
  updateDriverLocation: (lat, lng) => request('/driver/location', { method: 'POST', body: { lat, lng } }),
  acceptBooking: (bookingId) => request(`/driver/bookings/${bookingId}/accept`, { method: 'POST' }),
  rejectBooking: (bookingId) => request(`/driver/bookings/${bookingId}/reject`, { method: 'POST' }),
  verifyOtp: (bookingId, otp) => request(`/driver/bookings/${bookingId}/verify-otp`, { method: 'POST', body: { otp } }),
  completeWaypoint: (bookingId, waypointId) => request(`/driver/bookings/${bookingId}/waypoints/${waypointId}`, { method: 'POST' }),
  completeRide: (bookingId) => request(`/driver/bookings/${bookingId}/complete`, { method: 'POST' }),
  getDriverEarnings: () => request('/driver/earnings'),

  // Admin endpoints
  getAdminStats: () => request('/admin/stats'),
  getAdminDrivers: () => request('/admin/drivers'),
  getAdminBookings: (status) => request(`/admin/bookings${status ? `?status=${status}` : ''}`),
  getAdminUsers: () => request('/admin/users'),
  updateUserRole: (userId, role) => request(`/admin/users/${userId}/role`, { method: 'PATCH', body: { role } }),

  // SOS endpoints
  triggerSos: (payload) => request('/sos', { method: 'POST', body: payload }),
  getSosAlerts: () => request('/sos'),
  updateSosAlert: (alertId, status, notes) => request(`/sos/${alertId}`, { method: 'PATCH', body: { status, notes } }),

  // Ratings endpoints
  submitRating: (payload) => request('/ratings', { method: 'POST', body: payload }),
  getDriverRatings: (driverId) => request(`/ratings/driver/${driverId}`),
};

export default api;
