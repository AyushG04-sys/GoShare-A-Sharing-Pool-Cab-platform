/**
 * Map, Geocoding, and Routing Service
 * Integrates Leaflet, OpenStreetMap Nominatim, Photon, and OSRM routing.
 * Provides hyper-localized destination/pickup search optimized for the user's current city.
 */

export const DEFAULT_CENTER = {
  lat: 18.5204,
  lng: 73.8567,
  label: 'Pune, Maharashtra',
  city: 'Pune',
  state: 'Maharashtra',
};

/**
 * Returns city landmark presets dynamically based on the detected user city.
 */
export function getCityLandmarks(city, lat = null, lng = null) {
  const normCity = (city || '').toLowerCase();

  if (normCity.includes('nashik') || normCity.includes('nasik')) {
    return [
      { label: 'Ashok Stambh Circle', lat: 20.0068, lng: 73.7849, category: 'Hub' },
      { label: 'Nashik Road Railway Station', lat: 19.9547, lng: 73.8344, category: 'Station' },
      { label: 'College Road (Canada Corner)', lat: 20.0042, lng: 73.7656, category: 'Commercial' },
      { label: 'Nashik City Centre Mall', lat: 19.9863, lng: 73.7588, category: 'Mall' },
      { label: 'Panchavati (Ramkund)', lat: 20.0067, lng: 73.7936, category: 'Heritage' },
      { label: 'Gangapur Road', lat: 20.0191, lng: 73.7320, category: 'Residential' },
      { label: 'Indira Nagar', lat: 19.9705, lng: 73.7812, category: 'Residential' },
      { label: 'Mumbai Naka Bus Stop', lat: 19.9892, lng: 73.7865, category: 'Transit' },
    ];
  }

  if (normCity.includes('mumbai') || normCity.includes('thane') || normCity.includes('navi mumbai')) {
    return [
      { label: 'Chhatrapati Shivaji Maharaj Terminus (CSMT)', lat: 18.9402, lng: 72.8354, category: 'Station' },
      { label: 'Bandra Kurla Complex (BKC)', lat: 19.0657, lng: 72.8687, category: 'Business' },
      { label: 'Dadar Central Station', lat: 19.0178, lng: 72.8478, category: 'Transit' },
      { label: 'Andheri West (Infinity Mall)', lat: 19.1415, lng: 72.8315, category: 'Mall' },
      { label: 'Thane Railway Station', lat: 19.1860, lng: 72.9759, category: 'Station' },
      { label: 'Navi Mumbai (Vashi)', lat: 19.0771, lng: 72.9986, category: 'Hub' },
    ];
  }

  // Default to Pune / Maharashtra hubs
  return [
    { label: 'Pune Railway Station', lat: 18.5289, lng: 73.8744, category: 'Station' },
    { label: 'Swargate Bus Terminal', lat: 18.5018, lng: 73.8586, category: 'Transit' },
    { label: 'Shivajinagar Station', lat: 18.5314, lng: 73.8446, category: 'Transit' },
    { label: 'Kothrud (Chandani Chowk)', lat: 18.5074, lng: 73.7915, category: 'Hub' },
    { label: 'Viman Nagar (Phoenix Mall)', lat: 18.5626, lng: 73.9168, category: 'Mall' },
    { label: 'Hinjawadi IT Park (Phase 1)', lat: 18.5913, lng: 73.7389, category: 'Tech Park' },
    { label: 'Hadapsar (Magarpatta)', lat: 18.5135, lng: 73.9298, category: 'Business' },
    { label: 'Pune Airport (PNQ)', lat: 18.5822, lng: 73.9197, category: 'Airport' },
  ];
}

export const PRESET_LOCATIONS = getCityLandmarks('Pune');

export class GeolocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GeolocationError';
    this.code = code;
    this.isPermissionDenied = code === 1;
    this.isPositionUnavailable = code === 2;
    this.isTimeout = code === 3;
  }
}

export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function mapGeoError(error) {
  let msg = 'Failed to detect your location.';
  if (error.code === 1) {
    msg = 'Location permission was denied. Please allow location access in your browser settings or enter your pickup address manually.';
  } else if (error.code === 2) {
    msg = 'Location position is currently unavailable from your device or network. You can retry or search your address manually.';
  } else if (error.code === 3) {
    msg = 'Location request timed out. You can retry or search your address manually.';
  }
  return new GeolocationError(error.code || 0, msg);
}

/**
 * Prompts browser for device geolocation with resilient fallback and validation.
 */
export function getCurrentUserLocation() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new GeolocationError(0, 'Geolocation is not supported by your browser.'));
      return;
    }

    // Try high accuracy first
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          reject(new GeolocationError(0, 'Received invalid geographic coordinates.'));
          return;
        }
        resolve({ lat: latitude, lng: longitude, accuracy });
      },
      (firstError) => {
        // If permission explicitly denied, do not retry
        if (firstError.code === 1) {
          reject(mapGeoError(firstError));
          return;
        }

        // If timeout or position unavailable on high accuracy, fallback to standard accuracy
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => {
            const { latitude, longitude, accuracy } = fallbackPos.coords;
            if (!isValidCoordinate(latitude, longitude)) {
              reject(new GeolocationError(0, 'Received invalid geographic coordinates.'));
              return;
            }
            resolve({ lat: latitude, lng: longitude, accuracy });
          },
          (secondError) => {
            reject(mapGeoError(secondError || firstError));
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
    );
  });
}

/**
 * Sets up a location watcher with explicit error handling and cleanup function.
 */
export function watchCurrentUserLocation(onSuccess, onError, options = {}) {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    if (onError) onError(new GeolocationError(0, 'Geolocation is not supported.'));
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (isValidCoordinate(latitude, longitude)) {
        onSuccess({ lat: latitude, lng: longitude, accuracy });
      }
    },
    (err) => {
      if (onError) onError(mapGeoError(err));
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000, ...options }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}

/**
 * Reverse geocodes coordinates to detailed address components including city and state.
 */
export async function getUserLocationDetails(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'GoShare-RideSharing/1.0',
      },
    });
    if (!res.ok) throw new Error('Reverse geocode failed');
    const data = await res.json();
    const addr = data.address || {};

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.suburb ||
      addr.county ||
      addr.state_district ||
      '';
    const state = addr.state || '';
    const country = addr.country || 'India';
    const suburb = addr.suburb || addr.neighbourhood || addr.residential || '';

    // Create a concise user-friendly display label (e.g., "Shalimar, Nashik")
    const labelParts = [suburb, city, state].filter(Boolean);
    const label =
      labelParts.length > 0
        ? labelParts.slice(0, 2).join(', ')
        : data.display_name.split(',').slice(0, 3).join(', ').trim();

    return {
      lat,
      lng,
      label,
      fullAddress: data.display_name,
      city,
      state,
      country,
      suburb,
      address: addr,
    };
  } catch (err) {
    console.warn('Location detail fetch failed:', err);
    return {
      lat,
      lng,
      label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      fullAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      city: '',
      state: '',
      country: 'India',
    };
  }
}

/**
 * Reverse geocodes coordinates to a simple address string.
 */
export async function reverseGeocode(lat, lng) {
  const details = await getUserLocationDetails(lat, lng);
  return details.label;
}

/**
 * Searches real-world locations strictly optimized and bounded to the user's detected location/city.
 * For example: if user is in Nashik and searches "Ashok Stambh Circle",
 * suggestions will strictly be for Nashik and not from any other city or state.
 *
 * @param {string} query Search input
 * @param {object|null} userLocation { lat, lng, city, state }
 */
export async function searchLocations(query, userLocation = null) {
  if (!query || query.trim().length < 2) return [];

  const cleanQuery = query.trim();
  const encodedQuery = encodeURIComponent(cleanQuery);

  // If user coordinates are provided, perform localized search
  if (userLocation?.lat && userLocation?.lng) {
    const { lat, lng, city, state } = userLocation;
    // ~35-40 km bounding box around user's city position
    const d = 0.35;
    const viewbox = `${lng - d},${lat + d},${lng + d},${lat - d}`;

    // STRATEGY 1: Strictly bounded Nominatim search inside user's city viewbox
    // bounded=1 guarantees NO results outside the viewbox (e.g. no results from other cities/states)
    const boundedUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&viewbox=${viewbox}&bounded=1&limit=8&addressdetails=1`;

    try {
      const res = await fetch(boundedUrl, {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'GoShare-RideSharing/1.0',
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const results = data.map((item) => {
            const itemLat = parseFloat(item.lat);
            const itemLng = parseFloat(item.lon);
            const dist = haversineDistance(lat, lng, itemLat, itemLng);
            const addr = item.address || {};
            const itemCity = addr.city || addr.town || addr.village || addr.suburb || city || '';
            const itemState = addr.state || state || '';
            const mainLabel = item.display_name.split(',').slice(0, 2).join(',').trim();

            return {
              label: mainLabel,
              subLabel: `${itemCity ? itemCity + ', ' : ''}${itemState ? itemState : ''} • ${dist < 1 ? Math.round(dist * 1000) + ' m' : dist.toFixed(1) + ' km'} away`,
              fullAddress: item.display_name,
              lat: itemLat,
              lng: itemLng,
              city: itemCity,
              state: itemState,
              distanceKm: Math.round(dist * 10) / 10,
            };
          });

          // Sort by nearest to user location first
          results.sort((a, b) => a.distanceKm - b.distanceKm);
          return results;
        }
      }
    } catch (err) {
      console.warn('Bounded Nominatim search failed:', err);
    }

    // STRATEGY 2: If bounded viewbox didn't return matches (e.g. spelling variation),
    // search with user's city context explicitly appended to keep suggestions strictly local
    if (city) {
      try {
        const cityQuery = encodeURIComponent(`${cleanQuery}, ${city}`);
        const cityUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${cityQuery}&limit=6&addressdetails=1`;
        const res = await fetch(cityUrl, {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'GoShare-RideSharing/1.0',
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const results = data
              .map((item) => {
                const itemLat = parseFloat(item.lat);
                const itemLng = parseFloat(item.lon);
                const dist = haversineDistance(lat, lng, itemLat, itemLng);
                const addr = item.address || {};
                const itemCity = addr.city || addr.town || addr.county || city;
                const itemState = addr.state || state || '';
                const mainLabel = item.display_name.split(',').slice(0, 2).join(',').trim();

                return {
                  label: mainLabel,
                  subLabel: `${itemCity ? itemCity + ', ' : ''}${itemState ? itemState : ''} • ${dist.toFixed(1)} km away`,
                  fullAddress: item.display_name,
                  lat: itemLat,
                  lng: itemLng,
                  city: itemCity,
                  state: itemState,
                  distanceKm: Math.round(dist * 10) / 10,
                };
              })
              // Strictly keep results within the metro area (< 50 km)
              .filter((item) => item.distanceKm <= 50)
              .sort((a, b) => a.distanceKm - b.distanceKm);

            if (results.length > 0) return results;
          }
        }
      } catch (err) {
        console.warn('City-appended Nominatim search failed:', err);
      }
    }

    // STRATEGY 3: Photon proximity search with lat & lon coordinates bias
    try {
      const photonUrl = `https://photon.komoot.io/api/?q=${encodedQuery}&lat=${lat}&lon=${lng}&limit=8`;
      const pRes = await fetch(photonUrl);
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData.features && pData.features.length > 0) {
          const results = pData.features
            .map((f) => {
              const p = f.properties;
              const fLat = f.geometry.coordinates[1];
              const fLng = f.geometry.coordinates[0];
              const dist = haversineDistance(lat, lng, fLat, fLng);
              const name = p.name || cleanQuery;
              const neighborhood = p.district || p.street || '';
              const mainLabel = neighborhood ? `${name}, ${neighborhood}` : name;
              const fCity = p.city || city || '';
              const fState = p.state || state || '';

              return {
                label: mainLabel,
                subLabel: `${fCity ? fCity + ', ' : ''}${fState ? fState : ''} • ${dist.toFixed(1)} km away`,
                fullAddress: [name, neighborhood, fCity, fState].filter(Boolean).join(', '),
                lat: fLat,
                lng: fLng,
                city: fCity,
                state: fState,
                distanceKm: Math.round(dist * 10) / 10,
              };
            })
            // Filter strictly to results within the metro region (< 60 km) to prevent foreign states
            .filter((item) => item.distanceKm <= 60)
            .sort((a, b) => a.distanceKm - b.distanceKm);

          if (results.length > 0) return results;
        }
      }
    } catch (err) {
      console.warn('Photon proximity search failed:', err);
    }
  }

  // FALLBACK (No user location available): search with India country bias
  const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&countrycodes=in&limit=6&addressdetails=1`;
  try {
    const res = await fetch(fallbackUrl, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'GoShare-RideSharing/1.0',
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item) => {
      const addr = item.address || {};
      const itemCity = addr.city || addr.town || addr.county || '';
      const itemState = addr.state || '';
      return {
        label: item.display_name.split(',').slice(0, 2).join(',').trim(),
        subLabel: `${itemCity ? itemCity + ', ' : ''}${itemState}`,
        fullAddress: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        city: itemCity,
        state: itemState,
        distanceKm: null,
      };
    });
  } catch (err) {
    console.warn('Fallback search failed:', err);
    return [];
  }
}

/**
 * Fetches turn-by-turn driving route polyline from OSRM.
 * Falls back to straight line path if service is unreachable.
 * @param {Array<{lat: number, lng: number}>} points
 */
export async function fetchOsrmRoute(points) {
  if (!points || points.length < 2) {
    return { polyline: [], distanceKm: 0, durationMin: 0 };
  }

  // OSRM expects coordinates in lng,lat format joined by semicolons
  const coordsString = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('OSRM route failed');
    const data = await res.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      // GeoJSON coordinates are [lng, lat], Leaflet polyline expects [lat, lng]
      const polyline = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const distanceKm = Math.round((route.distance / 1000) * 100) / 100;
      const durationMin = Math.round(route.duration / 60);

      return {
        polyline,
        distanceKm,
        durationMin,
      };
    }
  } catch (err) {
    console.warn('OSRM routing request failed, falling back to direct line interpolation:', err);
  }

  // Graceful fallback
  const polyline = points.map((p) => [p.lat, p.lng]);
  let dist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    dist += haversineDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  const roundedDist = Math.round(dist * 100) / 100;
  const durationMin = Math.max(3, Math.round((roundedDist / 25) * 60));

  return {
    polyline,
    distanceKm: roundedDist,
    durationMin,
  };
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
