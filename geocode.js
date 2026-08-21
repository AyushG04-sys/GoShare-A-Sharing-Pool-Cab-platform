// =====================================================
// Nominatim geocoder with 1 req/sec rate limit
// =====================================================
// https://operations.osmfoundation.org/policies/nominatim/
// Public usage limit: 1 request per second.

const NOMINATIM = 'https://nominatim.openstreetmap.org';

let _lastRequestAt = 0;
const _queue = [];
let _running = false;

async function _flush() {
  if (_running) return;
  _running = true;
  while (_queue.length) {
    const { url, resolve, reject } = _queue.shift();
    const wait = Math.max(0, 1100 - (Date.now() - _lastRequestAt));
    if (wait) await new Promise(r => setTimeout(r, wait));
    try {
      _lastRequestAt = Date.now();
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      resolve(await res.json());
    } catch (e) {
      reject(e);
    }
  }
  _running = false;
}

function _enqueue(url) {
  return new Promise((resolve, reject) => {
    _queue.push({ url, resolve, reject });
    _flush();
  });
}

// Search a place by free-text query (returns array of {lat, lon, display_name, ...})
async function geocodeSearch(query, limit = 5) {
  const url = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&limit=${limit}&addressdetails=1`;
  return _enqueue(url);
}

// Reverse: lat/lng -> address
async function geocodeReverse(lat, lng) {
  const url = `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
  try {
    return await _enqueue(url);
  } catch (e) {
    console.warn('Reverse geocode failed (likely file:// or network issue):', e.message);
    return { display_name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
  }
}

// Compute road distance (km) and duration (min) using OSRM public demo server.
// Falls back to Haversine + avg speed if the request fails.
async function routeDistanceKm(origin, destination) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
      `?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM ' + res.status);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) throw new Error('no route');
    const r = data.routes[0];
    return { km: r.distance / 1000, min: Math.round(r.duration / 60) };
  } catch (e) {
    const km = haversineKm(origin, destination);
    const min = Math.round((km / window.APP_CONFIG.AVG_SPEED_KMH) * 60);
    return { km, min };
  }
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

window.Geo = { geocodeSearch, geocodeReverse, routeDistanceKm, haversineKm };
