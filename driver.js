import { APP_CONFIG } from './config.js';
import { Geo } from './geocode.js';
import { loadBookings, updateBooking, removeBooking, findBookingById } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const driverData = JSON.parse(sessionStorage.getItem('rideUser') || '{}');
  if (!driverData.loggedIn || driverData.role !== 'driver') window.location.href = 'index.html';

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });

  const vehicleIcons = { rickshaw: '🛺', mini: '🚗', cab: '🚖', suv: '🚙' };
  const vehicleLabels = { rickshaw: 'Auto Rickshaw', mini: 'Mini', cab: 'Cab / Sedan', suv: 'SUV' };
  const myVehicle = (driverData.vehicleType || 'rickshaw').toLowerCase();

  if (driverData.vehicleType) document.getElementById('vehicleIcon').textContent = vehicleIcons[myVehicle] || '🛺';
  if (driverData.vehicleType) document.getElementById('vehicleTitle').textContent = vehicleLabels[myVehicle] || 'Auto Rickshaw';
  if (driverData.vehicleNumber) document.getElementById('vehicleNumberDisplay').textContent = driverData.vehicleNumber;

  let map, pickupMarker, dropMarker;
  let sharedMarkers = [];
  let currentRouteLayer = null;

  let savedLat = sessionStorage.getItem('driverLat');
  let savedLng = sessionStorage.getItem('driverLng');
  let driverPos = (savedLat && savedLng) ? { lat: parseFloat(savedLat), lng: parseFloat(savedLng) } : { lat: 18.5204, lng: 73.8567 };
  let driverDropPos = JSON.parse(sessionStorage.getItem('driverDropPos') || 'null');
  let activeBooking = null;
  let currentRouteCoords = '';
  let lastRidesStateHash = '';

  let isOnline = sessionStorage.getItem('driverOnline') === 'true';
  document.getElementById('onlineToggle').checked = isOnline;
  document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
  document.getElementById('statusText').style.color = isOnline ? '#10b981' : '#94a3b8';

  let rejectedBookings = JSON.parse(sessionStorage.getItem('rejectedBookings') || '[]');

  function updateDriverPos(lat, lng) { driverPos = { lat, lng }; sessionStorage.setItem('driverLat', lat); sessionStorage.setItem('driverLng', lng); }
  function updateDriverDropPos(lat, lng) { driverDropPos = { lat, lng }; sessionStorage.setItem('driverDropPos', JSON.stringify(driverDropPos)); }

  const syncAddressInput = async (lat, lng, inputId) => {
    const rev = await Geo.geocodeReverse(lat, lng);
    if (rev && rev.display_name) {
      const formatted = rev.display_name.split(',').slice(0, 3).join(', ');
      document.getElementById(inputId).value = formatted;
      sessionStorage.setItem('driver_' + inputId, formatted);
    }
  };

  if (sessionStorage.getItem('driver_pickupInput')) document.getElementById('pickupInput').value = sessionStorage.getItem('driver_pickupInput');
  if (sessionStorage.getItem('driver_dropInput')) document.getElementById('dropInput').value = sessionStorage.getItem('driver_dropInput');

  map = L.map('map', { zoomControl: false }).setView([driverPos.lat, driverPos.lng], 14);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  pickupMarker = L.marker([driverPos.lat, driverPos.lng], { draggable: false }).addTo(map);
  pickupMarker.bindPopup('<b>Your Start</b>').openPopup();

  if (driverDropPos) {
    dropMarker = L.marker([driverDropPos.lat, driverDropPos.lng], { draggable: false }).addTo(map);
    dropMarker.bindPopup('<b>Destination</b>');
    drawRoute([driverPos, driverDropPos]);
  }

  if (!sessionStorage.getItem('driver_pickupInput')) syncAddressInput(driverPos.lat, driverPos.lng, 'pickupInput');

  const gpsModal = document.getElementById('gpsModal');
  if (sessionStorage.getItem('gpsPromptAnswered') === 'true') {
    gpsModal.classList.add('hidden');
    if (navigator.geolocation && !driverDropPos) {
      navigator.geolocation.getCurrentPosition(async pos => {
        updateDriverPos(pos.coords.latitude, pos.coords.longitude);
        pickupMarker.setLatLng([driverPos.lat, driverPos.lng]);
        if (!activeBooking) map.setView([driverPos.lat, driverPos.lng], 15);
        syncAddressInput(driverPos.lat, driverPos.lng, 'pickupInput');
      }, () => {}, { enableHighAccuracy: true, timeout: 10000 });
    }
  }

  document.getElementById('denyGpsBtn')?.addEventListener('click', () => { sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); });

  document.getElementById('allowGpsBtn')?.addEventListener('click', () => {
    if (!navigator.geolocation) { alert("GPS not supported."); sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); return; }
    document.getElementById('allowGpsBtn').textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => { sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); updateDriverPos(pos.coords.latitude, pos.coords.longitude); map.setView([driverPos.lat, driverPos.lng], 15); pickupMarker.setLatLng([driverPos.lat, driverPos.lng]).openPopup(); syncAddressInput(driverPos.lat, driverPos.lng, 'pickupInput'); if (driverDropPos) drawRoute([driverPos, driverDropPos]); },
      () => { alert("Failed to get GPS."); sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  const setupAutocomplete = (inputId, dropdownId, isPickup) => {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    let timeout;
    input.addEventListener('input', (e) => {
      sessionStorage.setItem('driver_' + inputId, e.target.value); clearTimeout(timeout);
      const query = e.target.value;
      if (query.length < 3) { dropdown.innerHTML = ''; dropdown.classList.add('hidden'); return; }
      timeout = setTimeout(async () => {
        const results = await Geo.searchPlaces(query);
        dropdown.innerHTML = '';
        if (results.length > 0) {
          results.forEach(place => {
            const div = document.createElement('div'); div.className = 'autocomplete-item'; div.textContent = place.display_name;
            div.onclick = () => {
              input.value = place.display_name; sessionStorage.setItem('driver_' + inputId, place.display_name); dropdown.classList.add('hidden');
              const lat = parseFloat(place.lat), lon = parseFloat(place.lon);
              if (isPickup) { updateDriverPos(lat, lon); pickupMarker.setLatLng([lat, lon]).openPopup(); map.setView([lat, lon], 14); }
              else { updateDriverDropPos(lat, lon); if (!dropMarker) { dropMarker = L.marker([lat, lon], { draggable: false }).addTo(map); dropMarker.bindPopup('<b>Destination</b>'); } dropMarker.setLatLng([lat, lon]).openPopup(); }
              if (driverPos && driverDropPos) drawRoute([driverPos, driverDropPos]);
            };
            dropdown.appendChild(div);
          });
          dropdown.classList.remove('hidden');
        } else dropdown.classList.add('hidden');
      }, 500);
    });
    document.addEventListener('click', (e) => { if (e.target !== input && e.target !== dropdown) dropdown.classList.add('hidden'); });
  };

  setupAutocomplete('pickupInput', 'pickupDropdown', true);
  setupAutocomplete('dropInput', 'dropDropdown', false);

  async function drawRoute(waypoints) {
    if (!waypoints || waypoints.length < 2) return;
    const coordsStr = waypoints.map(w => `${w.lat},${w.lng}`).join('-');
    if (currentRouteCoords === coordsStr) return; currentRouteCoords = coordsStr;
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const routeGeometry = await Geo.getOptimizedRoute(waypoints);
    if (routeGeometry && map) { currentRouteLayer = L.geoJSON(routeGeometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.8 } }).addTo(map); map.fitBounds(currentRouteLayer.getBounds(), { padding: [50, 50] }); }
  }

  document.getElementById('onlineToggle')?.addEventListener('change', (e) => {
    isOnline = e.target.checked; sessionStorage.setItem('driverOnline', isOnline);
    document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
    document.getElementById('statusText').style.color = isOnline ? '#10b981' : '#94a3b8';
  });

  setInterval(async () => { refreshBookings(await loadBookings()); }, 3000);

  function refreshBookings(allBookings) {
    const activeRides = allBookings.filter(b => b.driverName === driverData.name && (b.status === 'accepted' || b.status === 'in_progress'));
    renderActiveRides(activeRides);
    if (!isOnline) return;
    const requests = allBookings.filter(b => b.status === 'active' && b.driverName === 'Searching...' && (b.vehicleType || '').toLowerCase() === myVehicle && !rejectedBookings.includes(String(b.id)) && !rejectedBookings.includes(Number(b.id)) && (!b.isShared || (b.coPassenger && b.coPassenger.joinedUserId)));
    if (requests.length > 0 && !activeBooking) { activeBooking = requests[0]; showRequestModal(activeBooking); }
    else if (requests.length === 0 && activeBooking) { document.getElementById('requestModal').classList.add('hidden'); activeBooking = null; if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; } clearSharedMarkers(); }
  }

  function clearSharedMarkers() { sharedMarkers.forEach(m => map.removeLayer(m)); sharedMarkers = []; }

  function showRequestModal(req) {
    document.getElementById('passengerName').textContent = req.userName;
    document.getElementById('passengerFare').textContent = req.fare;
    clearSharedMarkers();

    const rideTypeEl = document.getElementById('requestRideType');
    const sharedBadge = document.getElementById('requestSharedBadge');
    const femaleBadge = document.getElementById('requestFemaleBadge');
    const coPassengerRow = document.getElementById('requestCoPassenger');
    sharedBadge.classList.add('hidden'); femaleBadge.classList.add('hidden'); coPassengerRow.classList.add('hidden');

    if (req.isShared) {
      rideTypeEl.innerHTML = 'Shared <span class="request-badge badge-shared">SHARED</span>';
      sharedBadge.classList.remove('hidden');
      if (req.coPassenger && req.coPassenger.joinedUserId) { coPassengerRow.classList.remove('hidden'); document.getElementById('requestCoPassengerName').textContent = req.coPassenger.joinedUserId; }
    } else if (req.femaleDriver) {
      rideTypeEl.innerHTML = 'Female Driver <span class="request-badge badge-female">♀ FEMALE</span>';
      femaleBadge.classList.remove('hidden');
    } else {
      rideTypeEl.innerHTML = 'Solo <span class="request-badge badge-solo">SOLO</span>';
    }

    const paymentIcons = { cash: '💵 Cash', upi: '📱 UPI' };
    document.getElementById('requestPayment').textContent = paymentIcons[req.paymentMethod] || '💵 Cash';

    const waypoints = [{ lat: driverPos.lat, lng: driverPos.lng }, { lat: req.pickupLat, lng: req.pickupLng }];
    if (req.isShared && req.coPassenger && req.coPassenger.pickupLat) {
      const coPickupLabel = req.coPassenger.pickupLabel || 'Co-Passenger Pickup';
      const coDropLabel = req.coPassenger.dropLabel || 'Co-Passenger Drop';
      const coName = req.coPassenger.joinedUserId || 'Co-Passenger';
      document.getElementById('passengerRoute').textContent = `${req.pickupLabel} → ${coPickupLabel} → ${coDropLabel} → ${req.dropLabel}`;
      waypoints.push({ lat: req.coPassenger.pickupLat, lng: req.coPassenger.pickupLng });
      waypoints.push({ lat: req.coPassenger.dropLat, lng: req.coPassenger.dropLng });
      const iconPick = L.divIcon({ className: 'co-passenger-marker', html: '👥', iconSize: [20, 20] });
      const iconDrop = L.divIcon({ className: 'co-passenger-marker', html: '👋', iconSize: [20, 20] });
      sharedMarkers.push(L.marker([req.coPassenger.pickupLat, req.coPassenger.pickupLng], { icon: iconPick }).addTo(map).bindPopup(`<b>${coName} Pickup</b>`));
      sharedMarkers.push(L.marker([req.coPassenger.dropLat, req.coPassenger.dropLng], { icon: iconDrop }).addTo(map).bindPopup(`<b>${coName} Drop</b>`));
    } else {
      document.getElementById('passengerRoute').textContent = `${req.pickupLabel} → ${req.dropLabel}`;
    }

    waypoints.push({ lat: req.dropLat, lng: req.dropLng });
    document.getElementById('requestModal').classList.remove('hidden');
    drawRoute(waypoints);

    document.getElementById('acceptBtn').onclick = async (e) => {
      e.preventDefault();
      document.getElementById('requestModal').classList.add('hidden');
      await updateBooking(req.id, { status: 'accepted', driverName: driverData.name, driverPos, user1PickedUp: false, user2PickedUp: false, user1DroppedOff: false, user2DroppedOff: false });
      activeBooking = null;
      const allBookings = await loadBookings(); refreshBookings(allBookings);
    };

    document.getElementById('rejectBtn').onclick = (e) => {
      e.preventDefault();
      rejectedBookings.push(String(req.id)); sessionStorage.setItem('rejectedBookings', JSON.stringify(rejectedBookings));
      document.getElementById('requestModal').classList.add('hidden');
      if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; } clearSharedMarkers(); activeBooking = null;
    };
  }

  function renderActiveRides(rides) {
    const stateHash = JSON.stringify(rides.map(r => r.id + r.status + (r.user1PickedUp||'') + (r.user2PickedUp||'') + (r.user1DroppedOff||'') + (r.user2DroppedOff||'')));
    if (stateHash === lastRidesStateHash) return; lastRidesStateHash = stateHash;

    const container = document.getElementById('activeRidesContainer');
    container.innerHTML = '';

    if (rides.length === 0) {
      if (!activeBooking) { clearSharedMarkers(); if (driverDropPos) drawRoute([driverPos, driverDropPos]); else if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; } }
      container.innerHTML = '<div class="empty-state">' + (isOnline ? 'Waiting for ride requests...' : 'Go online to find passengers') + '</div>';
      return;
    }

    rides.forEach(b => {
      const waypoints = [{ lat: driverPos.lat, lng: driverPos.lng }, { lat: b.pickupLat, lng: b.pickupLng }];
      if (b.isShared && b.coPassenger && b.coPassenger.pickupLat) {
        waypoints.push({ lat: b.coPassenger.pickupLat, lng: b.coPassenger.pickupLng });
        waypoints.push({ lat: b.coPassenger.dropLat, lng: b.coPassenger.dropLng });
      }
      waypoints.push({ lat: b.dropLat, lng: b.dropLng });
      drawRoute(waypoints);

      const paymentIcons = { cash: '💵 Cash', upi: '📱 UPI' };

      if (b.isShared && b.coPassenger && b.coPassenger.joinedUserId) {
        // ===== SHARED RIDE: Individual cards for each user =====

        // User 1 Card
        const card1 = document.createElement('div');
        card1.className = 'active-ride-card';
        const u1Picked = b.user1PickedUp;
        const u1Dropped = b.user1DroppedOff;
        const u1Payment = paymentIcons[b.paymentMethod] || '💵 Cash';

        card1.innerHTML = `
          <div class="active-ride-header">
            <div class="active-ride-name">👤 ${b.userName}</div>
            <div class="active-ride-otp">OTP ${b.otp}</div>
          </div>
          <div class="active-ride-route">📍 Pickup: ${b.pickupLabel}</div>
          <div class="active-ride-meta">
            <span class="meta-badge badge-shared">SHARED</span>
            <span class="meta-badge meta-payment">${u1Payment}</span>
            <span class="meta-badge meta-fare">₹${b.fare}</span>
          </div>
        `;
        if (!u1Dropped) {
          const btn1 = document.createElement('button');
          btn1.className = 'active-ride-action ' + (u1Picked ? 'complete-btn' : 'start-btn');
          btn1.textContent = u1Picked ? '🏁 Drop off ' + b.userName : '▶ Pick up ' + b.userName;
          btn1.onclick = async (e) => {
            e.preventDefault();
            if (!u1Picked) {
              await updateBooking(b.id, { user1PickedUp: true, status: 'in_progress' });
            } else {
              await updateBooking(b.id, { user1DroppedOff: true });
              const updated = await loadBookings();
              const rb = findBookingById(updated, b.id);
              if (rb && rb.user1DroppedOff && rb.user2DroppedOff) {
                await updateBooking(b.id, { status: 'completed' });
              }
            }
            const allBookings = await loadBookings(); refreshBookings(allBookings);
          };
          card1.appendChild(btn1);
        } else {
          const done1 = document.createElement('div');
          done1.style.cssText = 'text-align:center;color:#10b981;font-weight:600;font-size:13px;padding:8px;';
          done1.textContent = '✓ ' + b.userName + ' dropped off';
          card1.appendChild(done1);
        }
        container.appendChild(card1);

        // User 2 Card (Co-Passenger)
        const card2 = document.createElement('div');
        card2.className = 'active-ride-card';
        const u2Picked = b.user2PickedUp;
        const u2Dropped = b.user2DroppedOff;
        const u2Payment = paymentIcons[b.coPassenger.paymentMethod] || '💵 Cash';

        card2.innerHTML = `
          <div class="active-ride-header">
            <div class="active-ride-name">👥 ${b.coPassenger.joinedUserId}</div>
            <div style="font-size:12px;color:#94a3b8;">Co-Passenger</div>
          </div>
          <div class="active-ride-route">📍 Pickup: ${b.coPassenger.pickupLabel || 'Co-Passenger Pickup'}</div>
          <div class="active-ride-meta">
            <span class="meta-badge badge-shared">SHARED</span>
            <span class="meta-badge meta-payment">${u2Payment}</span>
            <span class="meta-badge meta-fare">₹${b.coPassenger.fare || b.fare}</span>
          </div>
        `;
        if (!u2Dropped) {
          const btn2 = document.createElement('button');
          btn2.className = 'active-ride-action ' + (u2Picked ? 'complete-btn' : 'start-btn');
          btn2.textContent = u2Picked ? '🏁 Drop off ' + b.coPassenger.joinedUserId : '▶ Pick up ' + b.coPassenger.joinedUserId;
          btn2.onclick = async (e) => {
            e.preventDefault();
            if (!u2Picked) {
              await updateBooking(b.id, { user2PickedUp: true, status: 'in_progress' });
            } else {
              await updateBooking(b.id, { user2DroppedOff: true });
              const updated = await loadBookings();
              const rb = findBookingById(updated, b.id);
              if (rb && rb.user1DroppedOff && rb.user2DroppedOff) {
                await updateBooking(b.id, { status: 'completed' });
              }
            }
            const allBookings = await loadBookings(); refreshBookings(allBookings);
          };
          card2.appendChild(btn2);
        } else {
          const done2 = document.createElement('div');
          done2.style.cssText = 'text-align:center;color:#10b981;font-weight:600;font-size:13px;padding:8px;';
          done2.textContent = '✓ ' + b.coPassenger.joinedUserId + ' dropped off';
          card2.appendChild(done2);
        }
        container.appendChild(card2);

      } else {
        // ===== SOLO RIDE: Single card =====
        const card = document.createElement('div');
        card.className = 'active-ride-card';
        const payment = paymentIcons[b.paymentMethod] || '💵 Cash';
        let typeBadge = b.femaleDriver ? '<span class="meta-badge badge-female">♀ FEMALE</span>' : '<span class="meta-badge badge-solo">SOLO</span>';

        card.innerHTML = `
          <div class="active-ride-header">
            <div class="active-ride-name">${b.userName}</div>
            <div class="active-ride-otp">OTP ${b.otp}</div>
          </div>
          <div class="active-ride-route">${b.status === 'accepted' ? '📍 Pickup: ' + b.pickupLabel : '🏁 Drop: ' + b.dropLabel}</div>
          <div class="active-ride-meta">${typeBadge}<span class="meta-badge meta-payment">${payment}</span><span class="meta-badge meta-fare">₹${b.fare}</span></div>
        `;

        const actionBtn = document.createElement('button');
        actionBtn.className = 'active-ride-action ' + (b.status === 'accepted' ? 'start-btn' : 'complete-btn');
        actionBtn.textContent = b.status === 'accepted' ? '▶ Start Trip' : '✓ Complete Trip';
        actionBtn.onclick = async (e) => {
          e.preventDefault();
          await updateBooking(b.id, { status: b.status === 'accepted' ? 'in_progress' : 'completed' });
          if (b.status !== 'accepted' && currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; clearSharedMarkers(); }
          const allBookings = await loadBookings(); refreshBookings(allBookings);
        };
        card.appendChild(actionBtn);
        container.appendChild(card);
      }
    });
  }
});