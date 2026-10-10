import { APP_CONFIG } from './config.js';
import { Geo } from './geocode.js';
import { loadBookings, addBooking, updateBooking, removeBooking, triggerSOS } from './store.js';

window.addEventListener('error', (e) => console.error('JS error:', e.message));

const userData = JSON.parse(localStorage.getItem('rideUser') || '{}');
if (!userData.loggedIn || userData.role !== 'user') window.location.href = 'index.html';

const greetingEl = document.getElementById('userGreeting');
if (greetingEl) greetingEl.textContent = 'Hello, ' + (userData.name || 'User');

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('rideUser');
  window.location.href = 'index.html';
});

let map, userMarker, pickupMarker, dropMarker, routeLine, driverRouteLine;
let userPos = null, dropPlace = null, selectedRide = null, currentBooking = null;
let nearbyVehicleMarkers = [], activeDriverMarker = null;
let tripDistanceKm = 0, tripDurationMin = 0;
let bookingToRate = null, selectedStar = 5;
let carAnimationTimer;
let pinTarget = null;

initApp();

async function initApp() {
  const locBanner = document.getElementById('locationBanner');
  const bannerGrant = document.getElementById('bannerGrant');
  const bannerSkip = document.getElementById('bannerSkip');

  if (bannerGrant) {
    bannerGrant.addEventListener('click', () => {
      bannerGrant.textContent = 'Locating...';
      bannerGrant.disabled = true;
      if (!navigator.geolocation) return fallbackToSimulatedGPS();
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (locBanner) locBanner.classList.add('hidden');
          const lat = pos.coords.latitude, lng = pos.coords.longitude;
          let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          try {
            const rev = await Geo.geocodeReverse(lat, lng);
            if (rev && rev.display_name) label = rev.display_name.split(',')[0];
          } catch (e) {}
          userPos = { lat, lng, label };
          setupMapAt(userPos, label);
        },
        () => { if (locBanner) locBanner.classList.add('hidden'); fallbackToSimulatedGPS(); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }
  if (bannerSkip) {
    bannerSkip.addEventListener('click', () => {
      if (locBanner) locBanner.classList.add('hidden');
      fallbackToSimulatedGPS();
    });
  }
}

function fallbackToSimulatedGPS() {
  userPos = { lat: 18.5204, lng: 73.8567, label: "Pune (Simulated)" };
  setupMapAt(userPos, userPos.label);
}

async function setupMapAt(pos, label) {
  if (map) return;

  map = L.map('map', { zoomControl: false }).setView([pos.lat, pos.lng], 13);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 500);

  const icon = L.divIcon({ className: 'user-marker', iconSize: [18, 18] });
  userMarker = L.marker([pos.lat, pos.lng], { icon, draggable: true }).addTo(map);
  userMarker.bindPopup(`<strong>${label}</strong>`).openPopup();

  userMarker.on('dragend', async e => {
    const ll = e.target.getLatLng();
    let newLabel = 'Pinned location';
    document.getElementById('pickupInput').value = 'Fetching location...';
    try {
      const rev = await Geo.geocodeReverse(ll.lat, ll.lng);
      if (rev && rev.display_name) newLabel = rev.display_name.split(',')[0];
    } catch(err) {}
    userPos = { lat: ll.lat, lng: ll.lng, label: newLabel };
    document.getElementById('pickupInput').value = newLabel;
    userMarker.bindPopup(`<strong>${newLabel}</strong>`).openPopup();
    if (dropPlace) drawRouteAndPrice();
  });

  map.on('click', async (e) => {
    if (!pinTarget) return;

    const target = pinTarget;
    pinTarget = null;
    document.getElementById('map').style.cursor = '';

    const ll = e.latlng;
    let newLabel = 'Pinned location';

    if (target === 'pickup') {
      document.getElementById('pickupInput').value = 'Fetching location...';
      if (userMarker) {
        userMarker.setLatLng(ll);
      } else {
        const icon = L.divIcon({ className: 'user-marker', iconSize: [18, 18] });
        userMarker = L.marker(ll, { icon, draggable: true }).addTo(map);
      }
    } else {
      document.getElementById('dropInput').value = 'Fetching location...';
      if (dropMarker) {
        dropMarker.setLatLng(ll);
      } else {
        const icon = L.divIcon({ className: 'passenger-marker', html: '<div class="glow"></div><div class="dot"></div>', iconSize: [30, 30] });
        dropMarker = L.marker(ll, { icon }).addTo(map);
      }
    }

    map.setView(ll, 14);

    try {
      const rev = await Geo.geocodeReverse(ll.lat, ll.lng);
      if (rev && rev.display_name) newLabel = rev.display_name.split(',')[0];
    } catch(err) {}

    if (target === 'pickup') {
      userPos = { lat: ll.lat, lng: ll.lng, label: newLabel };
      document.getElementById('pickupInput').value = newLabel;
      userMarker.bindPopup(`<strong>${newLabel}</strong>`).openPopup();
    } else {
      dropPlace = { lat: ll.lat, lng: ll.lng, label: newLabel };
      document.getElementById('dropInput').value = newLabel;
    }

    if (userPos && dropPlace) drawRouteAndPrice();
  });

  document.getElementById('pickupInput').value = label;
  setupAutocomplete();
  simulateNearbyDrivers();

  // Initial data load
  refreshNearbyAndShared(await loadBookings());
}

document.getElementById('locateBtn')?.addEventListener('click', () => {
  document.getElementById('locateMenu').classList.toggle('hidden');
});

document.getElementById('useGpsBtn')?.addEventListener('click', () => {
  document.getElementById('locateMenu').classList.add('hidden');
  pinTarget = null;
  document.getElementById('map').style.cursor = '';

  if (!navigator.geolocation) return fallbackToSimulatedGPS();
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const rev = await Geo.geocodeReverse(lat, lng);
        if (rev && rev.display_name) label = rev.display_name.split(',')[0];
      } catch (e) {}
      userPos = { lat, lng, label };
      if(userMarker) {
        userMarker.setLatLng([lat, lng]);
        userMarker.bindPopup(`<strong>${label}</strong>`).openPopup();
      }
      map.setView([lat, lng], 14);
      document.getElementById('pickupInput').value = label;
      if (dropPlace) drawRouteAndPrice();
    },
    () => fallbackToSimulatedGPS(),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

document.getElementById('pinPickupBtn')?.addEventListener('click', () => {
  document.getElementById('locateMenu').classList.add('hidden');
  pinTarget = 'pickup';
  document.getElementById('map').style.cursor = 'crosshair';
  document.getElementById('pickupInput').value = 'Tap map to pin pickup...';
});

document.getElementById('pinDropBtn')?.addEventListener('click', () => {
  document.getElementById('locateMenu').classList.add('hidden');
  pinTarget = 'drop';
  document.getElementById('map').style.cursor = 'crosshair';
  document.getElementById('dropInput').value = 'Tap map to pin destination...';
});

function setupAutocomplete() {
  let activeInput = null, searchSeq = 0, lastTypingAt = 0;
  const suggestions = document.getElementById('searchSuggestions');
  [document.getElementById('pickupInput'), document.getElementById('dropInput')].forEach(input => {
    if(!input) return;
    input.addEventListener('focus', () => activeInput = input);
    input.addEventListener('input', () => {
      lastTypingAt = Date.now();
      if (input.value.trim().length < 3) suggestions.classList.add('hidden');
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim();
        if(q.length >= 3) {
          try {
            const data = await Geo.geocodeSearch(q, 1);
            if(data && data.length > 0) await selectPlace(data[0], activeInput, suggestions);
          } catch(err) {}
        }
      }
    });
  });
  setInterval(async () => {
    if (Date.now() - lastTypingAt > 350 && activeInput && activeInput.value.trim().length >= 3) {
      const q = activeInput.value.trim();
      lastTypingAt = Infinity;
      const seq = ++searchSeq;
      try {
        const data = await Geo.geocodeSearch(q, 5);
        if (seq === searchSeq) renderSuggestions(data, suggestions, activeInput);
      } catch (e) {}
    }
  }, 600);
}

function renderSuggestions(places, suggestionsEl, activeInput) {
  suggestionsEl.innerHTML = '';
  if (!places || !places.length) return suggestionsEl.classList.add('hidden');
  places.forEach(place => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';

    const strong = document.createElement('strong');
    strong.textContent = place.display_name.split(',')[0];

    const small = document.createElement('small');
    small.textContent = place.display_name.split(',').slice(0, 2).join(',');

    div.appendChild(strong);
    div.appendChild(document.createElement('br'));
    div.appendChild(small);

    div.addEventListener('click', () => selectPlace(place, activeInput, suggestionsEl));
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.classList.remove('hidden');
}

async function selectPlace(place, activeInput, suggestionsEl) {
  const lat = parseFloat(place.lat), lng = parseFloat(place.lon);
  const shortName = place.display_name.split(',')[0];
  suggestionsEl.classList.add('hidden');

  if (activeInput.id === 'pickupInput') {
    activeInput.value = shortName;
    userPos = { lat, lng, label: shortName };
    if (userMarker) userMarker.setLatLng([lat, lng]);
    map.setView([lat, lng], 14);
  } else {
    activeInput.value = shortName;
    dropPlace = { lat, lng, label: shortName };
    if (dropMarker) map.removeLayer(dropMarker);
    const icon = L.divIcon({ className: 'passenger-marker', html: '<div class="glow"></div><div class="dot"></div>', iconSize: [30, 30] });
    dropMarker = L.marker([lat, lng], { icon }).addTo(map);
    map.setView([lat, lng], 14);
  }
  if (userPos && dropPlace) await drawRouteAndPrice();
}

async function drawRouteAndPrice() {
  if (!userPos || !dropPlace) return;
  document.getElementById('tripMeta').classList.remove('hidden');
  const { km, min } = await Geo.routeDistanceKm(userPos, dropPlace);
  tripDistanceKm = km;
  tripDurationMin = min;

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${userPos.lng},${userPos.lat};${dropPlace.lng},${dropPlace.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok') {
      const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: 0.7 }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }
  } catch (e) {}
  renderRideOptions();
}

function renderRideOptions() {
  const cfg = APP_CONFIG.PRICING;
  const container = document.getElementById('rideOptions');
  const shareInfo = document.getElementById('shareInfo');

  document.getElementById('distanceText').textContent = tripDistanceKm.toFixed(1) + ' km';
  document.getElementById('durationText').textContent = '~' + tripDurationMin + ' min';

  // We need an async wrapper because loadBookings is now async
  (async () => {
    const bookings = await loadBookings();
    const peers = bookings.filter(b => b.userId !== userData.phone && (b.status === 'active' || b.status === 'accepted' || b.status === 'in_progress') && Geo.haversineKm({ lat: b.dropLat, lng: b.dropLng }, dropPlace) < 1.5 && Geo.haversineKm(userPos, { lat: b.pickupLat, lng: b.pickupLng }) < 5).length;

    if (peers > 0) {
      shareInfo.classList.remove('hidden');
      document.getElementById('shareCount').textContent = peers;
      const solo = APP_CONFIG.calculateFare(selectedRide || 'rickshaw', tripDistanceKm, false);
      const shared = APP_CONFIG.calculateFare(selectedRide || 'rickshaw', tripDistanceKm, true);
      document.getElementById('savingsAmount').textContent = solo - shared;
    } else {
      shareInfo.classList.add('hidden');
    }

    container.innerHTML = '<h4>Choose a ride</h4>';
    Object.entries(cfg).forEach(([key, v]) => {
      const sharedPrice = APP_CONFIG.calculateFare(key, tripDistanceKm, peers > 0);
      const soloPrice = APP_CONFIG.calculateFare(key, tripDistanceKm, false);

      const div = document.createElement('div');
      div.className = 'ride-option';
      div.dataset.type = key;

      const iconDiv = document.createElement('div');
      iconDiv.className = 'ride-icon';
      iconDiv.textContent = v.icon;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'ride-info';
      const name = document.createElement('div');
      name.className = 'ride-name';
      name.textContent = `${v.label} `;
      const badge = document.createElement('span');
      badge.className = 'share-badge';
      badge.textContent = peers > 0 ? 'Share -25%' : 'Share';
      name.appendChild(badge);
      infoDiv.appendChild(name);

      const priceDiv = document.createElement('div');
      priceDiv.className = 'ride-price';
      const priceStrong = document.createElement('strong');
      priceStrong.textContent = `₹${sharedPrice}`;
      priceDiv.appendChild(priceStrong);
      if (peers > 0) {
        const strike = document.createElement('div');
        strike.className = 'strike';
        strike.textContent = `₹${soloPrice}`;
        priceDiv.appendChild(strike);
      }

      div.appendChild(iconDiv);
      div.appendChild(infoDiv);
      div.appendChild(priceDiv);

      div.addEventListener('click', () => {
        container.querySelectorAll('.ride-option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        selectedRide = key;
        document.getElementById('confirmRideBtn').disabled = false;
      });
      container.appendChild(div);
    });
  })();
}

async function refreshNearbyAndShared() {
  nearbyVehicleMarkers.forEach(m => map && map.removeLayer(m));
  nearbyVehicleMarkers = [];

  const bookings = await loadBookings();

  if (currentBooking && ['active','accepted','in_progress'].includes(currentBooking.status)) {
    const coPassengers = bookings.filter(b => b.driverName === currentBooking.driverName && b.id !== currentBooking.id && ['active','accepted','in_progress'].includes(b.status));
    coPassengers.forEach(cp => {
      const icon = L.divIcon({ className: 'passenger-marker', html: '<div class="glow" style="background:#f59e0b;"></div><div class="dot" style="background:#f59e0b;"></div>', iconSize: [30, 30] });
      nearbyVehicleMarkers.push(L.marker([cp.pickupLat, cp.pickupLng], { icon }).bindPopup(`<strong>Co-Passenger</strong><br>Waiting at: ${cp.pickupLabel}`).addTo(map));
    });
  } else {
    simulateNearbyDrivers();
  }
}

function simulateNearbyDrivers() {
  if (!userPos || !map) return;
  const drivers = [{ type: 'rickshaw', offset: [0.004, 0.003] }, { type: 'mini', offset: [-0.003, 0.005] }, { type: 'cab', offset: [0.005, -0.004] }, { type: 'suv', offset: [-0.006, -0.002] }];
  drivers.forEach(d => {
    const icon = L.divIcon({ className: 'nearby-vehicle-marker', html: `<div class="nv-circle">${APP_CONFIG.PRICING[d.type].icon}</div>`, iconSize: [40, 40] });
    nearbyVehicleMarkers.push(L.marker([userPos.lat + d.offset[0], userPos.lng + d.offset[1]], { icon }).addTo(map));
  });
}

async function drawAnimatedRoute(origin, destination, isApproach) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok') {
      const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);

      if (isApproach) {
        if (driverRouteLine) map.removeLayer(driverRouteLine);
        driverRouteLine = L.polyline(coords, { color: '#f59e0b', weight: 4, dashArray: '10, 10' }).addTo(map);
        map.fitBounds(driverRouteLine.getBounds(), { padding: [50, 50] });
      } else {
        if (routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline(coords, { color: '#3b82f6', weight: 5 }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
      }

      if (activeDriverMarker) map.removeLayer(activeDriverMarker);
      const icon = L.divIcon({ className: 'driver-marker', html: '<div style="font-size:20px; text-shadow:0 2px 4px rgba(0,0,0,0.3);">🚕</div>', iconSize: [24, 24] });
      activeDriverMarker = L.marker(coords[0], { icon }).addTo(map);

      let i = 0;
      if (carAnimationTimer) clearInterval(carAnimationTimer);
      carAnimationTimer = setInterval(() => {
        i += 2;
        if (i >= coords.length) {
          clearInterval(carAnimationTimer);
          activeDriverMarker.setLatLng(coords[coords.length-1]);
        } else {
          activeDriverMarker.setLatLng(coords[i]);
        }
      }, 300);
    }
  } catch (e) {}
}

document.getElementById('confirmRideBtn')?.addEventListener('click', async () => {
  if (!userPos || !dropPlace || !selectedRide) return;
  const cfg = APP_CONFIG.PRICING[selectedRide];

  const pLabel = userPos.label || document.getElementById('pickupInput').value || 'Unknown Pickup';
  const dLabel = dropPlace.label || document.getElementById('dropInput').value || 'Unknown Drop';

  const bookings = await loadBookings();
  const peers = bookings.filter(b => b.userId !== userData.phone && (b.status === 'active' || b.status === 'accepted' || b.status === 'in_progress') && Geo.haversineKm({ lat: b.dropLat, lng: b.dropLng }, dropPlace) < 1.5 && Geo.haversineKm(userPos, { lat: b.pickupLat, lng: b.pickupLng }) < 5).length;
  const isShared = peers > 0;

  const booking = {
    userId: userData.phone, userName: userData.name, vehicleType: selectedRide,
    vehicleLabel: cfg.label, plate: 'MH 12 AB ' + (1000 + Math.floor(Math.random() * 8999)), driverName: 'Searching...',
    pickupLat: userPos.lat, pickupLng: userPos.lng, dropLat: dropPlace.lat, dropLng: dropPlace.lng,
    pickupLabel: pLabel, dropLabel: dLabel,
    driverPos: { lat: userPos.lat + 0.015, lng: userPos.lng + 0.015 },
    fare: APP_CONFIG.calculateFare(selectedRide, tripDistanceKm, isShared),
    soloFare: APP_CONFIG.calculateFare(selectedRide, tripDistanceKm, false),
    sharedFare: APP_CONFIG.calculateFare(selectedRide, tripDistanceKm, true),
    isSharedDiscountApplied: isShared,
    status: 'active',
    otp: Math.floor(1000 + Math.random() * 9000)
  };

  currentBooking = await addBooking(booking);

  document.querySelector('#rideModal h3').textContent = 'Looking for shared ride...';
  document.querySelector('#rideModal .loader').classList.remove('hidden');
  document.getElementById('modalStatus').textContent = 'Finding riders going your way';
  document.getElementById('rideModal').classList.remove('hidden');
  document.getElementById('rideConfirmed').classList.remove('hidden');
  document.getElementById('confEta').textContent = 'Waiting for driver...';
});

document.getElementById('sosBtn')?.addEventListener('click', async () => {
  if (currentBooking) {
    await triggerSOS({
      userId: userData.phone, userName: userData.name, driverName: currentBooking.driverName,
      plate: currentBooking.plate, lat: userPos.lat, lng: userPos.lng, timestamp: Date.now()
    });
    alert("🚨 SOS ALERT SENT! \nAdministrators have been notified of your live location and your driver's details.");
  }
});

// State-Aware Polling
setInterval(async () => {
  if (!currentBooking) return;
  const bookings = await loadBookings();
  const target = bookings.find(b => b.id === currentBooking.id);
  if (!target) return;

  if (document.getElementById('liveFare')) {
    document.getElementById('liveFare').textContent = `₹${target.fare}`;
    if (target.isSharedDiscountApplied) {
      document.querySelector('#rideModal h3').textContent = 'Shared Ride Confirmed! (-25% Applied)';
    }
  }

  if (target.status === 'accepted' && currentBooking.status === 'active') {
    currentBooking = target;

    document.querySelector('#rideModal h3').textContent = target.isSharedDiscountApplied ? 'Shared Ride Confirmed! (-25% Applied)' : 'Ride Confirmed!';
    document.querySelector('#rideModal .loader').classList.add('hidden');
    document.getElementById('modalStatus').textContent = 'Driver is on the way to your pickup location.';
    document.getElementById('confDriver').textContent = target.driverName;
    document.getElementById('confVehicle').textContent = target.vehicleLabel;
    document.getElementById('confPlate').textContent = target.plate;

    if (!document.getElementById('fareRow')) {
      const fRow = document.createElement('div');
      fRow.className = 'confirmed-row'; fRow.id = 'fareRow';
      const label = document.createElement('span');
      label.textContent = 'Final Fare';
      const value = document.createElement('strong');
      value.id = 'liveFare';
      value.style.fontSize = '16px';
      value.style.color = '#059669';
      value.textContent = `₹${target.fare}`;
      fRow.appendChild(label);
      fRow.appendChild(value);
      document.getElementById('rideConfirmed').insertBefore(fRow, document.getElementById('cancelRideBtn'));
    }

    if (!document.getElementById('otpRow')) {
      const row = document.createElement('div');
      row.className = 'confirmed-row'; row.id = 'otpRow';
      const label = document.createElement('span');
      label.textContent = 'Pickup OTP';
      const value = document.createElement('strong');
      value.style.fontSize = '18px';
      value.style.letterSpacing = '2px';
      value.style.color = 'var(--accent)';
      value.textContent = target.otp;
      row.appendChild(label);
      row.appendChild(value);
      document.getElementById('rideConfirmed').insertBefore(row, document.getElementById('cancelRideBtn'));
    }

    const driverDist = Geo.haversineKm(target.driverPos, userPos);
    document.getElementById('confEta').textContent = `${driverDist.toFixed(1)} km away (~${Math.max(1, Math.round((driverDist/25)*60))} min)`;

    drawAnimatedRoute(target.driverPos, userPos, true);
  }

  if (target.status === 'in_progress' && currentBooking.status === 'accepted') {
    currentBooking = target;
    document.getElementById('modalStatus').textContent = 'Trip in progress! You are on your way.';
    document.getElementById('confEta').textContent = 'Heading to destination...';
    document.getElementById('cancelRideBtn')?.classList.add('hidden');

    drawAnimatedRoute(userPos, dropPlace, false);
  }

  if (target.status === 'completed') {
    currentBooking = null;
    document.getElementById('rideModal').classList.add('hidden');

    if (dropMarker) { map.removeLayer(dropMarker); dropMarker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (driverRouteLine) { map.removeLayer(driverRouteLine); driverRouteLine = null; }
    if (activeDriverMarker) { map.removeLayer(activeDriverMarker); activeDriverMarker = null; }
    if (carAnimationTimer) clearInterval(carAnimationTimer);

    document.getElementById('otpRow')?.remove();
    document.getElementById('fareRow')?.remove();
    document.getElementById('cancelRideBtn')?.classList.remove('hidden');

    if (!target.rating) {
      bookingToRate = target;
      document.getElementById('ratingDriverName').textContent = target.driverName;
      document.getElementById('ratingModal').classList.remove('hidden');
    }
  }
}, 3000);

document.getElementById('closeModal')?.addEventListener('click', () => document.getElementById('rideModal').classList.add('hidden'));
document.getElementById('cancelRideBtn')?.addEventListener('click', async () => {
  if (currentBooking) await removeBooking(currentBooking.id);
  currentBooking = null;
  document.getElementById('rideModal').classList.add('hidden');
  if (driverRouteLine) map.removeLayer(driverRouteLine);
  if (activeDriverMarker) map.removeLayer(activeDriverMarker);
  if (carAnimationTimer) clearInterval(carAnimationTimer);
});

const stars = document.querySelectorAll('#starRating .star');
stars.forEach(star => {
  star.addEventListener('click', (e) => {
    selectedStar = parseInt(e.target.dataset.val);
    stars.forEach(s => {
      s.textContent = parseInt(s.dataset.val) <= selectedStar ? '★' : '☆';
      s.style.color = parseInt(s.dataset.val) <= selectedStar ? '#fbbf24' : '#d1d5db';
    });
  });
});

document.getElementById('submitRatingBtn')?.addEventListener('click', async () => {
  if (bookingToRate) {
    const updates = { rating: selectedStar };
    await updateBooking(bookingToRate.id, updates);
  }
  document.getElementById('ratingModal').classList.add('hidden');
  bookingToRate = null;
});
document.getElementById('closeRatingModal')?.addEventListener('click', () => {
  document.getElementById('ratingModal').classList.add('hidden');
  bookingToRate = null;
});

document.getElementById('historyBtn')?.addEventListener('click', async () => {
  const allBookings = await loadBookings(userData.phone);
  const myHistory = allBookings.filter(b => b.status === 'completed');
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';

  if (myHistory.length === 0) {
    historyList.innerHTML = '<p class="empty-state" style="text-align:center; color:var(--text-muted);">No completed rides yet.</p>';
  } else {
    myHistory.sort((a,b) => b.createdAt - a.createdAt).forEach(b => {
      const div = document.createElement('div');
      div.style.borderBottom = '1px solid var(--border)'; div.style.paddingBottom = '12px'; div.style.marginBottom = '12px';

      const header = document.createElement('div');
      header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.marginBottom = '8px';
      const date = document.createElement('strong');
      date.style.fontSize = '14px';
      date.textContent = new Date(b.createdAt || Date.now()).toLocaleString();
      const fare = document.createElement('strong');
      fare.style.color = 'var(--accent)'; fare.style.fontSize = '15px';
      fare.textContent = `₹${b.fare}`;
      header.appendChild(date);
      header.appendChild(fare);

      const driverInfo = document.createElement('div');
      driverInfo.style.fontSize = '13px'; driverInfo.style.color = 'var(--text-muted)'; driverInfo.style.marginBottom = '4px';
      const dLabel = document.createElement('strong');
      dLabel.textContent = 'Driver: ';
      driverInfo.appendChild(dLabel);
      driverInfo.appendChild(document.createTextNode(`${b.driverName} (${b.vehicleLabel})`));

      const routeInfo = document.createElement('div');
      routeInfo.style.fontSize = '13px'; routeInfo.style.color = 'var(--text-muted)';
      const rLabel = document.createElement('strong');
      rLabel.textContent = 'Route: ';
      routeInfo.appendChild(rLabel);
      routeInfo.appendChild(document.createTextNode(`${b.pickupLabel} → ${b.dropLabel}`));

      const ratingInfo = document.createElement('div');
      ratingInfo.style.fontSize = '13px'; ratingInfo.style.color = '#fbbf24'; ratingInfo.style.fontWeight = 'bold';
      ratingInfo.textContent = b.rating ? `Rated: ${b.rating} ★` : '';

      div.appendChild(header);
      div.appendChild(driverInfo);
      div.appendChild(routeInfo);
      div.appendChild(ratingInfo);
      historyList.appendChild(div);
    });
  }
  document.getElementById('historyModal').classList.remove('hidden');
});
document.getElementById('closeHistoryModal')?.addEventListener('click', () => document.getElementById('historyModal').classList.add('hidden'));
