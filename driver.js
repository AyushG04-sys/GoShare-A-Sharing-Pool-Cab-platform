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

  function updateDriverPos(lat, lng) {
    driverPos = { lat, lng };
    sessionStorage.setItem('driverLat', lat);
    sessionStorage.setItem('driverLng', lng);
  }

  function updateDriverDropPos(lat, lng) {
    driverDropPos = { lat, lng };
    sessionStorage.setItem('driverDropPos', JSON.stringify(driverDropPos));
  }

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

  // ===== MAP INIT =====
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

  // ===== GPS MODAL =====
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

  document.getElementById('denyGpsBtn')?.addEventListener('click', () => {
    sessionStorage.setItem('gpsPromptAnswered', 'true');
    gpsModal.classList.add('hidden');
  });

  document.getElementById('allowGpsBtn')?.addEventListener('click', () => {
    if (!navigator.geolocation) { alert("GPS not supported."); sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); return; }
    document.getElementById('allowGpsBtn').textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      sessionStorage.setItem('gpsPromptAnswered', 'true');
      gpsModal.classList.add('hidden');
      updateDriverPos(pos.coords.latitude, pos.coords.longitude);
      map.setView([driverPos.lat, driverPos.lng], 15);
      pickupMarker.setLatLng([driverPos.lat, driverPos.lng]).openPopup();
      syncAddressInput(driverPos.lat, driverPos.lng, 'pickupInput');
      if (driverDropPos) drawRoute([driverPos, driverDropPos]);
    }, () => { alert("Failed to get GPS."); sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); }, { enableHighAccuracy: true, timeout: 15000 });
  });

  // ===== AUTOCOMPLETE =====
  const setupAutocomplete = (inputId, dropdownId, isPickup) => {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    let timeout;
    input.addEventListener('input', (e) => {
      sessionStorage.setItem('driver_' + inputId, e.target.value);
      clearTimeout(timeout);
      const query = e.target.value;
      if (query.length < 3) { dropdown.innerHTML = ''; dropdown.classList.add('hidden'); return; }
      timeout = setTimeout(async () => {
        const results = await Geo.searchPlaces(query);
        dropdown.innerHTML = '';
        if (results.length > 0) {
          results.forEach(place => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.textContent = place.display_name;
            div.onclick = () => {
              input.value = place.display_name;
              sessionStorage.setItem('driver_' + inputId, place.display_name);
              dropdown.classList.add('hidden');
              const lat = parseFloat(place.lat), lon = parseFloat(place.lon);
              if (isPickup) {
                updateDriverPos(lat, lon);
                pickupMarker.setLatLng([lat, lon]).openPopup();
                map.setView([lat, lon], 14);
              } else {
                updateDriverDropPos(lat, lon);
                if (!dropMarker) {
                  dropMarker = L.marker([lat, lon], { draggable: false }).addTo(map);
                  dropMarker.bindPopup('<b>Destination</b>');
                } else {
                  dropMarker.setLatLng([lat, lon]);
                }
                dropMarker.openPopup();
              }
              if (driverDropPos) drawRoute([driverPos, driverDropPos]);
            };
            dropdown.appendChild(div);
          });
          dropdown.classList.remove('hidden');
        } else {
          dropdown.classList.add('hidden');
        }
      }, 500);
    });
    document.addEventListener('click', (e) => {
      if (e.target !== input && e.target !== dropdown) dropdown.classList.add('hidden');
    });
  };

  setupAutocomplete('pickupInput', 'pickupDropdown', true);
  setupAutocomplete('dropInput', 'dropDropdown', false);

  // ===== DISTANCE HELPER =====
  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // ===== ROUTE OPTIMIZATION =====
  function optimizeRoute(startPos, pickups, dropoffs) {
    const result = [{ lat: startPos.lat, lng: startPos.lng }];
    const sortedPickups = [...pickups].sort((a, b) => {
      const last = result[result.length - 1];
      return getDistance(last.lat, last.lng, a.lat, a.lng) - getDistance(last.lat, last.lng, b.lat, b.lng);
    });
    result.push(...sortedPickups);
    const lastStop = sortedPickups.length > 0 ? sortedPickups[sortedPickups.length - 1] : startPos;
    const sortedDropoffs = [...dropoffs].sort((a, b) => {
      return getDistance(lastStop.lat, lastStop.lng, a.lat, a.lng) - getDistance(lastStop.lat, lastStop.lng, b.lat, b.lng);
    });
    result.push(...sortedDropoffs);
    return result;
  }

  // ===== DRAW ROUTE =====
  async function drawRoute(waypoints) {
    const coordsStr = waypoints.map(w => `${w.lat},${w.lng}`).join('-');
    if (currentRouteCoords === coordsStr) return;
    currentRouteCoords = coordsStr;
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const routeGeometry = await Geo.getOptimizedRoute(waypoints);
    if (routeGeometry && map) {
      currentRouteLayer = L.geoJSON(routeGeometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.8 } }).addTo(map);
      map.fitBounds(currentRouteLayer.getBounds(), { padding: [50, 50] });
    }
  }

  // ===== ONLINE/TOGGLE =====
  document.getElementById('onlineToggle').addEventListener('change', async (e) => {
    isOnline = e.target.checked;
    sessionStorage.setItem('driverOnline', isOnline);
    document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
    document.getElementById('statusText').style.color = isOnline ? '#10b981' : '#94a3b8';

    if (!isOnline && activeBooking) {
      await updateBooking(activeBooking.id, { status: 'active', driverName: 'Searching...', driverPos: null });
      activeBooking = null;
      sessionStorage.removeItem('activeBookingId');
    }
    renderSidebar();
  });

  // ===== CLEAR MAP MARKERS =====
  function clearRideMarkers() {
    sharedMarkers.forEach(m => map.removeLayer(m));
    sharedMarkers = [];
    if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteLayer = null; }
    currentRouteCoords = '';
  }

  // ===== SHOW RIDE REQUEST MODAL =====
  function showRequestModal(booking) {
    const modal = document.getElementById('requestModal');
    const isShared = booking.isShared;
    const isFemale = booking.femaleDriver;

    document.getElementById('passengerName').textContent = booking.userName || 'Passenger';
    document.getElementById('passengerRoute').textContent = `${booking.pickupLabel || 'Pickup'} → ${booking.dropLabel || 'Drop'}`;
    document.getElementById('passengerFare').textContent = booking.fare;
    document.getElementById('requestPayment').textContent = booking.paymentMethod === 'upi' ? '📱 UPI' : '💵 Cash';

    const typeSpan = document.getElementById('requestRideType');
    const sharedBadge = document.getElementById('requestSharedBadge');
    const femaleBadge = document.getElementById('requestFemaleBadge');

    typeSpan.textContent = isShared ? 'Shared' : (isFemale ? 'Female Driver' : 'Solo');
    sharedBadge.classList.toggle('hidden', !isShared);
    femaleBadge.classList.toggle('hidden', !isFemale);

    const coPassRow = document.getElementById('requestCoPassenger');
    const coPassName = document.getElementById('requestCoPassengerName');
    if (isShared && booking.coPassenger && booking.coPassenger.joinedUserId) {
      coPassRow.classList.remove('hidden');
      coPassName.textContent = booking.coPassenger.joinedUserId;
    } else {
      coPassRow.classList.add('hidden');
    }

    modal.classList.remove('hidden');

    // Draw pickup and drop markers on map
    clearRideMarkers();
    const pickupBlip = L.marker([booking.pickupLat, booking.pickupLng], {
      icon: L.divIcon({ className: 'pickup-blip', html: '<div style="width:16px;height:16px;background:#3b82f6;border:2px solid white;border-radius:50%;"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map).bindPopup('<b>Passenger Pickup</b>');
    sharedMarkers.push(pickupBlip);

    const dropBlip = L.marker([booking.dropLat, booking.dropLng], {
      icon: L.divIcon({ className: 'drop-blip', html: '<div style="width:16px;height:16px;background:#ef4444;border:2px solid white;border-radius:50%;"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })
    }).addTo(map).bindPopup('<b>Passenger Drop</b>');
    sharedMarkers.push(dropBlip);

    // Draw route from driver to pickup to drop
    drawRoute([driverPos, { lat: booking.pickupLat, lng: booking.pickupLng }, { lat: booking.dropLat, lng: booking.dropLng }]);

    // Accept handler
    document.getElementById('acceptBtn').onclick = async () => {
      await updateBooking(booking.id, {
        status: 'accepted',
        driverName: driverData.name,
        driverPhone: driverData.phone,
        driverId: driverData.id,
        driverPos: { lat: driverPos.lat, lng: driverPos.lng },
        vehicleType: myVehicle
      });
      activeBooking = booking;
      sessionStorage.setItem('activeBookingId', booking.id);
      modal.classList.add('hidden');
      renderSidebar();
    };

    // Reject handler
    document.getElementById('rejectBtn').onclick = async () => {
      rejectedBookings.push(booking.id);
      sessionStorage.setItem('rejectedBookings', JSON.stringify(rejectedBookings));
      modal.classList.add('hidden');
      clearRideMarkers();
      if (driverDropPos) drawRoute([driverPos, driverDropPos]);
    };
  }

  // ===== RENDER SIDEBAR =====
  function renderSidebar() {
    const container = document.getElementById('activeRidesContainer');

    if (!isOnline) {
      container.innerHTML = '<div class="empty-state">Go online to find passengers</div>';
      return;
    }

    if (activeBooking) {
      const b = activeBooking;
      const isShared = b.isShared;
      const hasCoPassenger = isShared && b.coPassenger && b.coPassenger.joinedUserId;

      let statusLabel = '';
      let actionBtn = '';

      if (b.status === 'accepted') {
        statusLabel = 'Heading to pickup';
        actionBtn = `<button class="active-ride-action start-btn" id="startRideBtn">✓ Verify OTP & Start</button>`;
      } else if (b.status === 'in_progress') {
        if (isShared) {
          const u1Picked = b.user1PickedUp;
          const u2Picked = hasCoPassenger && b.user2PickedUp;
          const u1Dropped = b.user1DroppedOff;
          const u2Dropped = hasCoPassenger && b.user2DroppedOff;

          let nextAction = '';
          if (!u1Picked) nextAction = `<button class="active-ride-action start-btn" id="pickUser1Btn">📍 Pick up ${b.userName}</button>`;
          else if (hasCoPassenger && !u2Picked) nextAction = `<button class="active-ride-action start-btn" id="pickUser2Btn">📍 Pick up ${b.coPassenger.joinedUserId}</button>`;
          else if (!u1Dropped) nextAction = `<button class="active-ride-action complete-btn" id="dropUser1Btn">🏁 Drop off ${b.userName}</button>`;
          else if (hasCoPassenger && !u2Dropped) nextAction = `<button class="active-ride-action complete-btn" id="dropUser2Btn">🏁 Drop off ${b.coPassenger.joinedUserId}</button>`;

          statusLabel = 'Trip in progress';
          actionBtn = nextAction;
        } else {
          const u1Picked = b.user1PickedUp || b.status === 'in_progress';
          const u1Dropped = b.user1DroppedOff;

          if (!u1Picked) {
            statusLabel = 'Heading to pickup';
            actionBtn = `<button class="active-ride-action start-btn" id="pickUser1Btn">📍 Mark Picked Up</button>`;
          } else if (!u1Dropped) {
            statusLabel = 'Trip in progress';
            actionBtn = `<button class="active-ride-action complete-btn" id="dropUser1Btn">🏁 Complete Ride</button>`;
          }
        }
      }

      const badgeHtml = isShared ? '<span class="meta-badge" style="background:#10b981;color:white;">👥 SHARED</span>' : '';
      const femaleHtml = b.femaleDriver ? '<span class="meta-badge" style="background:#a855f7;color:white;">♀ FEMALE</span>' : '';
      const paymentLabel = b.paymentMethod === 'upi' ? '📱 UPI' : '💵 Cash';

      let coPassHtml = '';
      if (hasCoPassenger) {
        coPassHtml = `<div class="co-passenger-row">👥 Co-passenger: ${b.coPassenger.joinedUserId}</div>`;
      }

      container.innerHTML = `
        <div class="active-ride-card">
          <div class="active-ride-header">
            <span class="active-ride-name">${b.userName || 'Passenger'}</span>
            <span class="active-ride-otp">OTP: ${b.otp || '----'}</span>
          </div>
          <div class="active-ride-route">${b.pickupLabel || 'Pickup'} → ${b.dropLabel || 'Drop'}</div>
          <div class="active-ride-meta">
            <span class="meta-badge meta-payment">${paymentLabel}</span>
            <span class="meta-badge meta-fare">₹${b.fare}</span>
            ${badgeHtml} ${femaleHtml}
          </div>
          ${coPassHtml}
          <p style="color: #60a5fa; font-weight: 600; font-size: 13px; margin: 8px 0;">${statusLabel}</p>
          ${actionBtn}
        </div>
      `;

      bindRideActions(b);
    } else {
      container.innerHTML = '<div class="empty-state" style="color: #94a3b8;">Waiting for ride requests...</div>';
    }
  }

  // ===== BIND RIDE ACTION BUTTONS =====
  function bindRideActions(booking) {
    const startBtn = document.getElementById('startRideBtn');
    const pickUser1Btn = document.getElementById('pickUser1Btn');
    const pickUser2Btn = document.getElementById('pickUser2Btn');
    const dropUser1Btn = document.getElementById('dropUser1Btn');
    const dropUser2Btn = document.getElementById('dropUser2Btn');

    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        const enteredOtp = prompt('Enter the 4-digit OTP from passenger:');
        if (String(enteredOtp) !== String(booking.otp)) {
          alert('❌ Invalid OTP. Please ask the passenger for the correct OTP.');
          return;
        }
        await updateBooking(booking.id, {
          status: 'in_progress',
          user1PickedUp: true,
          driverPos: { lat: driverPos.lat, lng: driverPos.lng }
        });
        activeBooking.status = 'in_progress';
        activeBooking.user1PickedUp = true;
        renderSidebar();
      });
    }

    if (pickUser1Btn) {
      pickUser1Btn.addEventListener('click', async () => {
        await updateBooking(booking.id, {
          user1PickedUp: true,
          driverPos: { lat: driverPos.lat, lng: driverPos.lng }
        });
        activeBooking.user1PickedUp = true;
        renderSidebar();
      });
    }

    if (pickUser2Btn) {
      pickUser2Btn.addEventListener('click', async () => {
        await updateBooking(booking.id, {
          user2PickedUp: true,
          driverPos: { lat: driverPos.lat, lng: driverPos.lng }
        });
        activeBooking.user2PickedUp = true;
        renderSidebar();
      });
    }

    if (dropUser1Btn) {
      dropUser1Btn.addEventListener('click', async () => {
        await updateBooking(booking.id, {
          user1DroppedOff: true,
          status: booking.isShared ? 'in_progress' : 'completed',
          driverPos: { lat: driverPos.lat, lng: driverPos.lng }
        });
        activeBooking.user1DroppedOff = true;
        if (!booking.isShared) {
          activeBooking = null;
          sessionStorage.removeItem('activeBookingId');
          clearRideMarkers();
          if (driverDropPos) drawRoute([driverPos, driverDropPos]);
        }
        renderSidebar();
      });
    }

    if (dropUser2Btn) {
      dropUser2Btn.addEventListener('click', async () => {
        await updateBooking(booking.id, {
          user2DroppedOff: true,
          status: 'completed',
          driverPos: { lat: driverPos.lat, lng: driverPos.lng }
        });
        activeBooking = null;
        sessionStorage.removeItem('activeBookingId');
        clearRideMarkers();
        if (driverDropPos) drawRoute([driverPos, driverDropPos]);
        renderSidebar();
      });
    }
  }

  // ===== UPDATE MAP FOR ACTIVE RIDE =====
  function updateRideMap(booking) {
    if (!map || !booking) return;

    clearRideMarkers();

    const pickups = [{ lat: booking.pickupLat, lng: booking.pickupLng }];
    const dropoffs = [{ lat: booking.dropLat, lng: booking.dropLng }];

    // Driver sees ALL waypoints including co-passenger
    if (booking.isShared && booking.coPassenger && booking.coPassenger.joinedUserId) {
      pickups.push({ lat: booking.coPassenger.pickupLat, lng: booking.coPassenger.pickupLng });
      dropoffs.push({ lat: booking.coPassenger.dropLat, lng: booking.coPassenger.dropLng });

      const coBlip = L.marker([booking.coPassenger.pickupLat, booking.coPassenger.pickupLng], {
        icon: L.divIcon({
          className: 'co-passenger-blip',
          html: '<div style="width:36px;height:36px;background:rgba(16,185,129,0.2);border:2px solid #10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;">👥</div>',
          iconSize: [36, 36], iconAnchor: [18, 18]
        })
      }).addTo(map).bindPopup('<b>Co-Passenger Pickup</b>');
      sharedMarkers.push(coBlip);

      const coDrop = L.marker([booking.coPassenger.dropLat, booking.coPassenger.dropLng], {
        icon: L.divIcon({
          className: 'co-passenger-drop',
          html: '<div style="width:14px;height:14px;background:#a855f7;border:2px solid white;border-radius:50%;"></div>',
          iconSize: [14, 14], iconAnchor: [7, 7]
        })
      }).addTo(map).bindPopup('<b>Co-Passenger Drop</b>');
      sharedMarkers.push(coDrop);
    }

    const pickupBlip = L.marker([booking.pickupLat, booking.pickupLng], {
      icon: L.divIcon({
        className: 'passenger-pickup',
        html: '<div style="width:16px;height:16px;background:#3b82f6;border:2px solid white;border-radius:50%;"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(map).bindPopup('<b>Passenger Pickup</b>');
    sharedMarkers.push(pickupBlip);

    const dropBlip = L.marker([booking.dropLat, booking.dropLng], {
      icon: L.divIcon({
        className: 'passenger-drop',
        html: '<div style="width:16px;height:16px;background:#ef4444;border:2px solid white;border-radius:50%;"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8]
      })
    }).addTo(map).bindPopup('<b>Passenger Drop</b>');
    sharedMarkers.push(dropBlip);

    const optimizedWaypoints = optimizeRoute(driverPos, pickups, dropoffs);
    drawRoute(optimizedWaypoints);
  }

  // ===== DRIVER POSITION SIMULATION =====
  function simulateDriverMovement(booking) {
    if (!booking) return;

    let targetLat, targetLng;

    if (booking.status === 'accepted') {
      targetLat = booking.pickupLat;
      targetLng = booking.pickupLng;
    } else if (booking.status === 'in_progress') {
      if (!booking.user1DroppedOff) {
        targetLat = booking.dropLat;
        targetLng = booking.dropLng;
      } else if (booking.isShared && booking.coPassenger && !booking.user2DroppedOff) {
        targetLat = booking.coPassenger.dropLat;
        targetLng = booking.coPassenger.dropLng;
      }
    }

    if (targetLat !== undefined && targetLng !== undefined) {
      const step = 0.0005;
      const dLat = targetLat - driverPos.lat;
      const dLng = targetLng - driverPos.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist > step) {
        const newLat = driverPos.lat + (dLat / dist) * step;
        const newLng = driverPos.lng + (dLng / dist) * step;
        updateDriverPos(newLat, newLng);
        pickupMarker.setLatLng([newLat, newLng]);
      }
    }
  }

  // ===== MAIN POLLING LOOP =====
  setInterval(async () => {
    if (!isOnline) return;

    try {
      const allBookings = await loadBookings();

      const savedActiveId = sessionStorage.getItem('activeBookingId');
      if (savedActiveId) {
        const myRide = findBookingById(allBookings, savedActiveId);
        if (myRide && (myRide.status === 'accepted' || myRide.status === 'in_progress')) {
          activeBooking = myRide;
          simulateDriverMovement(myRide);
          await updateBooking(myRide.id, {
            driverPos: { lat: driverPos.lat, lng: driverPos.lng }
          });
          updateRideMap(myRide);
          renderSidebar();
          return;
        } else if (myRide && (myRide.status === 'completed' || myRide.status === 'cancelled')) {
          activeBooking = null;
          sessionStorage.removeItem('activeBookingId');
          clearRideMarkers();
          if (driverDropPos) drawRoute([driverPos, driverDropPos]);
          renderSidebar();
          return;
        }
      }

      // No active ride — look for new requests
      const pendingRequests = allBookings.filter(b => {
        if (b.status !== 'active') return false;
        if (rejectedBookings.includes(b.id)) return false;
        if (b.driverName && b.driverName !== 'Searching...') return false;
        const bookingVehicle = (b.vehicleType || 'rickshaw').toLowerCase();
        if (bookingVehicle !== myVehicle) return false;
        if (b.femaleDriver && driverData.gender !== 'female') return false;
        return true;
      });

      // Only show modal if it's currently hidden (don't re-show if already displaying a request)
      if (pendingRequests.length > 0 && document.getElementById('requestModal').classList.contains('hidden')) {
        pendingRequests.sort((a, b) => {
          const distA = getDistance(driverPos.lat, driverPos.lng, a.pickupLat, a.pickupLng);
          const distB = getDistance(driverPos.lat, driverPos.lng, b.pickupLat, b.pickupLng);
          return distA - distB;
        });
        showRequestModal(pendingRequests[0]);
      }

      renderSidebar();

    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 3000);

  // ===== INITIAL RENDER =====
  renderSidebar();

  // ===== GPS TRACKING (continuous) =====
  if (navigator.geolocation && isOnline) {
    navigator.geolocation.watchPosition(pos => {
      updateDriverPos(pos.coords.latitude, pos.coords.longitude);
      pickupMarker.setLatLng([driverPos.lat, driverPos.lng]);
    }, () => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
  }
});