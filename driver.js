window.addEventListener('error', (e) => console.error('Driver JS error:', e.message));

let pinTarget = null;
let driverDropMarker = null;

document.addEventListener('DOMContentLoaded', () => {
const driverData = JSON.parse(localStorage.getItem('rideUser') || '{}');
if (!driverData.loggedIn || driverData.role !== 'driver') {
  window.location.href = 'index.html';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  let allBookings = loadBookings();
  let modified = false;
  
  allBookings.forEach(b => {
    if (b.driverName === driverData.name && (b.status === 'accepted' || b.status === 'in_progress')) {
      b.status = 'active';
      b.driverName = 'Searching...';
      modified = true;
    }
  });
  
  if (modified) saveBookings(allBookings);
  localStorage.removeItem('rideUser');
  window.location.href = 'index.html';
});

const vehicleIcons = { rickshaw: '🛺', mini: '🚗', cab: '🚖', suv: '🚙' };
const vehicleNames = { rickshaw: 'Auto Rickshaw', mini: 'Mini', cab: 'Cab (Sedan)', suv: 'SUV' };
if (driverData.vehicleType) {
  document.getElementById('vehicleIcon').textContent = vehicleIcons[driverData.vehicleType] || '🛺';
  document.getElementById('vehicleTitle').textContent = vehicleNames[driverData.vehicleType] || 'Vehicle';
}
if (driverData.vehicleNumber) {
  document.getElementById('vehicleNumberDisplay').textContent = driverData.vehicleNumber;
}

let map, driverMarker, routeLine;
let driverPos = null;
let isOnline = false;
let bookingMarkers = [];
let glowCircles = [];
let activeBooking = null;

updateDriverStats();

const locBanner = document.getElementById('locationBanner');
const bannerGrant = document.getElementById('bannerGrant');
const bannerSkip = document.getElementById('bannerSkip');

if (bannerGrant) {
  bannerGrant.addEventListener('click', () => {
    bannerGrant.textContent = 'Locating...';
    bannerGrant.disabled = true;

    if (!navigator.geolocation) { fallbackToSimulatedGPS(); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (locBanner) locBanner.classList.add('hidden');
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        try {
          const rev = await window.Geo.geocodeReverse(lat, lng);
          if (rev && rev.display_name) label = rev.display_name.split(',')[0];
        } catch (e) {}
        driverPos = { lat, lng, label };
        initMap();
      },
      () => { 
        if (locBanner) locBanner.classList.add('hidden');
        fallbackToSimulatedGPS(); 
      },
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

function fallbackToSimulatedGPS() {
  driverPos = { lat: 18.5204, lng: 73.8567, label: "Pune (Simulated)" };
  initMap();
}

function initMap() {
  if (map) return;
  
  map = L.map('map', { zoomControl: false }).setView([driverPos.lat, driverPos.lng], 13);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 500);

  const icon = L.divIcon({ className: 'driver-marker', iconSize: [18, 18] });
  driverMarker = L.marker([driverPos.lat, driverPos.lng], { icon, draggable: true }).addTo(map);
  driverMarker.bindPopup('<strong>You</strong>').openPopup();
  
  driverMarker.on('dragend', async e => {
    const ll = e.target.getLatLng();
    let newLabel = 'Pinned location';
    document.getElementById('driverPickup').value = 'Fetching location...';
    try {
      const rev = await window.Geo.geocodeReverse(ll.lat, ll.lng);
      if (rev && rev.display_name) newLabel = rev.display_name.split(',')[0];
    } catch(err) {}
    driverPos = { lat: ll.lat, lng: ll.lng, label: newLabel };
    document.getElementById('driverPickup').value = newLabel;
  });

  map.on('click', async (e) => {
    if (!pinTarget) return;
    
    const target = pinTarget;
    pinTarget = null;
    document.getElementById('map').style.cursor = ''; 
    
    const ll = e.latlng;
    let newLabel = 'Pinned location';
    
    if (target === 'pickup') {
      document.getElementById('driverPickup').value = 'Fetching location...';
      if (driverMarker) driverMarker.setLatLng(ll);
    } else {
      document.getElementById('driverDrop').value = 'Fetching location...';
      if (driverDropMarker) {
        driverDropMarker.setLatLng(ll);
      } else {
        const icon = L.divIcon({ className: 'passenger-marker', html: '<div class="glow" style="background:#ef4444;"></div><div class="dot" style="background:#ef4444;"></div>', iconSize: [30, 30] });
        driverDropMarker = L.marker(ll, { icon }).addTo(map);
      }
    }

    map.setView(ll, 14);
    
    try {
      const rev = await window.Geo.geocodeReverse(ll.lat, ll.lng);
      if (rev && rev.display_name) newLabel = rev.display_name.split(',')[0];
    } catch(err) {}
    
    if (target === 'pickup') {
      driverPos = { lat: ll.lat, lng: ll.lng, label: newLabel };
      document.getElementById('driverPickup').value = newLabel;
      driverMarker.bindPopup('<strong>You</strong>').openPopup();
    } else {
      document.getElementById('driverDrop').value = newLabel;
    }
  });

  window.onBookingsUpdated = () => {
    refreshBookings(loadBookings());
    updateDriverStats(); 
  };
  refreshBookings(loadBookings());
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
        const rev = await window.Geo.geocodeReverse(lat, lng);
        if (rev && rev.display_name) label = rev.display_name.split(',')[0];
      } catch (e) {}
      driverPos = { lat, lng, label };
      if(driverMarker) {
        driverMarker.setLatLng([lat, lng]);
        driverMarker.bindPopup('<strong>You</strong>').openPopup();
      }
      map.setView([lat, lng], 14);
      document.getElementById('driverPickup').value = label;
    },
    () => fallbackToSimulatedGPS(),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
});

document.getElementById('pinPickupBtn')?.addEventListener('click', () => {
  document.getElementById('locateMenu').classList.add('hidden');
  pinTarget = 'pickup';
  document.getElementById('map').style.cursor = 'crosshair'; 
  document.getElementById('driverPickup').value = 'Tap map to pin location...';
});

document.getElementById('pinDropBtn')?.addEventListener('click', () => {
  document.getElementById('locateMenu').classList.add('hidden');
  pinTarget = 'drop';
  document.getElementById('map').style.cursor = 'crosshair'; 
  document.getElementById('driverDrop').value = 'Tap map to pin destination...';
});

function updateDriverStats() {
  const allBookings = loadBookings();
  const myCompleted = allBookings.filter(b => b.driverName === driverData.name && b.status === 'completed');
  
  let totalEarnings = 0;
  let totalRating = 0;
  let ratedTrips = 0;
  
  myCompleted.forEach(b => {
    totalEarnings += (b.fare || 0);
    if (b.rating) {
      totalRating += b.rating;
      ratedTrips++;
    }
  });
  
  const avgRating = ratedTrips > 0 ? (totalRating / ratedTrips).toFixed(1) : '5.0';
  
  document.getElementById('todayEarnings').textContent = totalEarnings;
  document.getElementById('ridesCount').textContent = myCompleted.length;
  document.getElementById('driverRating').textContent = avgRating;
}

function renderActiveRides() {
  const container = document.getElementById('activeRidesContainer');
  if (!container) return;
  container.innerHTML = '';
  
  const allBookings = loadBookings();
  const myActiveRides = allBookings.filter(b => b.driverName === driverData.name && (b.status === 'accepted' || b.status === 'in_progress'));

  myActiveRides.forEach(b => {
    const card = document.createElement('div');
    card.style.cssText = "background: #e0f2fe; padding: 16px; border-radius: 12px; margin-bottom: 16px; border-left: 4px solid #0284c7;";
    
    let contentHtml = `
      <h4 style="color: #0369a1; margin-bottom: 8px;">${b.status === 'accepted' ? 'Driving to Pickup' : 'Trip in Progress'}</h4>
      <p style="font-weight: 700; font-size: 15px;">Passenger: ${b.userName}</p>
      <p style="font-size: 13px; color: #0c4a6e; margin-bottom: 12px;">
        ${b.status === 'accepted' ? 'Pickup: ' + (b.pickupLabel || 'Unknown Pickup') : 'Drop: ' + (b.dropLabel || 'Unknown Drop')}
      </p>
    `;

    if (b.status === 'accepted') {
      contentHtml += `
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <input type="text" id="otp_${b.id}" placeholder="4-digit OTP" maxlength="4" style="flex:1; padding: 10px; border-radius: 8px; border: 1px solid #bae6fd; font-size: 16px; text-align: center; font-weight: bold; letter-spacing: 2px;">
          <button id="verify_${b.id}" class="primary-btn" style="width: auto; padding: 10px 16px;">Verify</button>
        </div>
      `;
    } else {
      contentHtml += `
        <button id="complete_${b.id}" class="primary-btn" style="background: #0284c7; margin-bottom: 8px; width: 100%;">Mark as Completed</button>
      `;
    }
    
    contentHtml += `<button id="route_${b.id}" class="secondary-btn" style="width: 100%;">Show Route on Map</button>`;
    
    card.innerHTML = contentHtml;
    container.appendChild(card);

    if (b.status === 'accepted') {
      document.getElementById(`verify_${b.id}`).addEventListener('click', () => {
        const inputOtp = document.getElementById(`otp_${b.id}`).value.trim();
        if (inputOtp !== String(b.otp)) {
          alert('Incorrect OTP for ' + b.userName);
          return;
        }
        const freshBookings = loadBookings();
        const target = freshBookings.find(x => x.id === b.id);
        if (target) {
          target.status = 'in_progress';
          saveBookings(freshBookings);
          renderActiveRides();
          drawRoute({ lat: target.pickupLat, lng: target.pickupLng }, { lat: target.dropLat, lng: target.dropLng }, false);
        }
      });
    } else {
      document.getElementById(`complete_${b.id}`).addEventListener('click', () => {
        const freshBookings = loadBookings();
        const target = freshBookings.find(x => x.id === b.id);
        if (target) {
          target.status = 'completed';
          saveBookings(freshBookings);
          renderActiveRides();
          updateDriverStats();
          if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
        }
      });
    }

    document.getElementById(`route_${b.id}`).addEventListener('click', () => {
      if (b.status === 'accepted') {
        drawRoute(driverPos, { lat: b.pickupLat, lng: b.pickupLng }, true);
      } else {
        drawRoute({ lat: b.pickupLat, lng: b.pickupLng }, { lat: b.dropLat, lng: b.dropLng }, false);
      }
    });

  });
}

function refreshBookings(bookings) {
  if (!map) return;
  bookingMarkers.forEach(m => map.removeLayer(m));
  bookingMarkers = [];
  glowCircles.forEach(c => map.removeLayer(c));
  glowCircles = [];
  
  renderActiveRides();

  const matchedDiv = document.getElementById('matchedPassengers');
  if (!isOnline) {
    matchedDiv.innerHTML = '<h4>Passengers on your route</h4><p class="empty-state">Go online to find passengers</p>';
    return;
  }

  // FIX: Added vehicle type filter so drivers only see relevant requests
  const active = bookings.filter(b => b.status === 'active' && b.vehicleType === driverData.vehicleType);
  
  matchedDiv.innerHTML = '<h4>Passengers on your route</h4>';

  if (active.length === 0) {
    matchedDiv.innerHTML += '<p class="empty-state">No passengers nearby yet</p>';
  }

  active.forEach((b, idx) => {
    const pickup = { lat: b.pickupLat, lng: b.pickupLng };
    const distFromDriver = window.Geo.haversineKm(driverPos, pickup);

    const icon = L.divIcon({ className: 'passenger-marker', html: '<div class="glow"></div><div class="dot"></div>', iconSize: [30, 30] });
    const m = L.marker(pickup, { icon }).addTo(map);
    m.bindPopup(`<strong>${b.userName}</strong><br>Pickup: ${b.pickupLabel || 'Pickup'}<br>Drop: ${b.dropLabel || 'Drop'}`);
    bookingMarkers.push(m);

    const circle = L.circle(pickup, { radius: 200, color: '#00c853', weight: 2, opacity: 0.5, fillColor: '#00c853', fillOpacity: 0.1 }).addTo(map);
    glowCircles.push(circle);

    const card = document.createElement('div');
    card.className = 'passenger-card';
    card.innerHTML = `
      <div class="passenger-avatar">👤</div>
      <div class="passenger-details">
        <div class="passenger-name">${b.userName}</div>
        <div class="passenger-route-text">${distFromDriver.toFixed(1)} km away</div>
      </div>
      <div class="passenger-fare">₹${b.fare}</div>
    `;
    card.addEventListener('click', () => {
      map.setView(pickup, 15);
      m.openPopup();
      showRequestModal(b, distFromDriver);
    });
    matchedDiv.appendChild(card);
  });
}

function showRequestModal(b, distKm) {
  activeBooking = b;
  document.getElementById('passengerName').textContent = b.userName;
  document.getElementById('passengerRoute').textContent = `${distKm.toFixed(1)} km to pickup`;
  document.getElementById('passengerFare').textContent = b.fare;
  document.getElementById('requestModal').classList.remove('hidden');
}

document.getElementById('rejectBtn').addEventListener('click', () => {
  activeBooking = null;
  document.getElementById('requestModal').classList.add('hidden');
});

document.getElementById('acceptBtn').addEventListener('click', () => {
  if (!activeBooking) return;
  
  const allBookings = loadBookings();
  const target = allBookings.find(b => b.id === activeBooking.id);
  if (target) {
    target.status = 'accepted';
    target.driverName = driverData.name;
    const vNames = { rickshaw: 'Auto Rickshaw', mini: 'Mini', cab: 'Cab (Sedan)', suv: 'SUV' };
    target.plate = driverData.vehicleNumber || 'MH 12 AB 1234'; 
    target.vehicleLabel = vNames[driverData.vehicleType] || target.vehicleLabel;
    saveBookings(allBookings);
    
    drawRoute(driverPos, { lat: target.pickupLat, lng: target.pickupLng }, true);
  }
  
  document.getElementById('requestModal').classList.add('hidden');
  activeBooking = null;
  refreshBookings(loadBookings());
});

async function drawRoute(origin, destination, isApproach = false) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok') {
      const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      if (routeLine) map.removeLayer(routeLine);
      
      if (isApproach) {
        routeLine = L.polyline(coords, { color: '#f59e0b', weight: 4, dashArray: '10, 10', opacity: 0.9 }).addTo(map);
      } else {
        routeLine = L.polyline(coords, { color: '#3b82f6', weight: 5, opacity: 0.7 }).addTo(map);
      }
      
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    }
  } catch (e) {}
}

const onlineToggle = document.getElementById('onlineToggle');
const statusText = document.getElementById('statusText');
onlineToggle.addEventListener('change', () => {
  isOnline = onlineToggle.checked;
  statusText.textContent = isOnline ? 'Online' : 'Offline';
  statusText.style.color = isOnline ? 'var(--accent)' : 'var(--text-muted)';
  refreshBookings(loadBookings());
});

document.getElementById('historyBtn')?.addEventListener('click', () => {
  const allBookings = loadBookings();
  const myHistory = allBookings.filter(b => b.driverName === driverData.name && b.status === 'completed');
  
  const historyList = document.getElementById('historyList');
  historyList.innerHTML = '';
  
  if (myHistory.length === 0) {
    historyList.innerHTML = '<p class="empty-state" style="text-align:center; color:var(--text-muted);">No completed rides yet.</p>';
  } else {
    myHistory.sort((a,b) => b.createdAt - a.createdAt).forEach(b => {
      const date = new Date(b.createdAt || Date.now()).toLocaleString();
      const div = document.createElement('div');
      div.style.borderBottom = '1px solid var(--border)';
      div.style.paddingBottom = '12px';
      div.style.marginBottom = '12px';
      div.innerHTML = `
        <div style="display:flex; justify-content: space-between; margin-bottom: 8px;">
          <strong style="font-size: 14px;">${date}</strong>
          <strong style="color: var(--accent); font-size: 15px;">₹${b.fare}</strong>
        </div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;"><strong>Passenger:</strong> ${b.userName}</div>
        <div style="font-size: 13px; color: var(--text-muted);"><strong>Route:</strong> ${b.pickupLabel || 'Location'} → ${b.dropLabel || 'Location'}</div>
        <div style="font-size: 13px; color: #fbbf24; font-weight:bold;">${b.rating ? 'Rating Received: ' + b.rating + ' ★' : 'No rating yet'}</div>
      `;
      historyList.appendChild(div);
    });
  }
  document.getElementById('historyModal').classList.remove('hidden');
});

document.getElementById('closeHistoryModal')?.addEventListener('click', () => {
  document.getElementById('historyModal').classList.add('hidden');
});

});