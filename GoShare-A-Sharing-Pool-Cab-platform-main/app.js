import { APP_CONFIG } from './config.js';
import { Geo } from './geocode.js';
import { addBooking, loadBookings, triggerSOS, updateBooking, findBookingById } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const userData = JSON.parse(sessionStorage.getItem('rideUser') || '{}');
  if (!userData.loggedIn || userData.role !== 'user') window.location.href = 'index.html';
  if (document.getElementById('userNameDisplay')) document.getElementById('userNameDisplay').textContent = userData.name;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = 'index.html';
  });

  let map, pickupMarker, dropMarker, driverMarker, coPassengerBlip, currentRouteLayer;
  let userPos = { lat: 18.5204, lng: 73.8567 };
  let dropPos = null;
  let currentRouteCoords = '';
  let currentBookingId = sessionStorage.getItem('currentBookingId');
  let rideType = sessionStorage.getItem('rideType') || null;
  let selectedVehicleType = null;
  let selectedFare = 0;
  let paymentMethod = sessionStorage.getItem('paymentMethod') || null;
  let mapInitialized = false;
  let myDropOffDone = false;

  function updateUserPos(lat, lng) { userPos = { lat, lng }; sessionStorage.setItem('userLat', lat); sessionStorage.setItem('userLng', lng); }
  function updateDropPos(lat, lng) { dropPos = { lat, lng }; sessionStorage.setItem('dropPos', JSON.stringify(dropPos)); }

  const syncAddressInput = async (lat, lng, inputId) => {
    const rev = await Geo.geocodeReverse(lat, lng);
    if (rev && rev.display_name) {
      const formatted = rev.display_name.split(',').slice(0, 3).join(', ');
      document.getElementById(inputId).value = formatted;
      sessionStorage.setItem(inputId + 'Text', formatted);
    }
  };

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  const getSharedFare = (baseFare) => {
    if (baseFare >= 80) return Math.round(baseFare * 0.65);
    if (baseFare <= 40) return Math.round(baseFare * 0.90);
    return Math.round(baseFare * 0.80);
  };

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

  const gpsModal = document.getElementById('gpsModal');
  if (sessionStorage.getItem('gpsPromptAnswered') === 'true') { gpsModal.classList.add('hidden'); }

  document.getElementById('denyGpsBtn')?.addEventListener('click', () => { sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); });

  document.getElementById('allowGpsBtn')?.addEventListener('click', () => {
    if (!navigator.geolocation) { alert("GPS not supported."); sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); return; }
    document.getElementById('allowGpsBtn').textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => { sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); updateUserPos(pos.coords.latitude, pos.coords.longitude); if (mapInitialized) { pickupMarker.setLatLng([userPos.lat, userPos.lng]).openPopup(); map.setView([userPos.lat, userPos.lng], 15); syncAddressInput(userPos.lat, userPos.lng, 'pickupInput'); } },
      () => { alert("Failed to get GPS. Using default location."); sessionStorage.setItem('gpsPromptAnswered', 'true'); gpsModal.classList.add('hidden'); },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  });

  function initMap() {
    if (mapInitialized) return;
    let savedLat = sessionStorage.getItem('userLat'), savedLng = sessionStorage.getItem('userLng');
    if (savedLat && savedLng) userPos = { lat: parseFloat(savedLat), lng: parseFloat(savedLng) };
    dropPos = JSON.parse(sessionStorage.getItem('dropPos') || 'null');

    map = L.map('map', { zoomControl: false }).setView([userPos.lat, userPos.lng], 15);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    pickupMarker = L.marker([userPos.lat, userPos.lng], { draggable: false }).addTo(map);
    pickupMarker.bindPopup('<b>Pickup</b>').openPopup();

    if (dropPos) { dropMarker = L.marker([dropPos.lat, dropPos.lng], { draggable: true }).addTo(map); dropMarker.bindPopup('<b>Destination</b>'); drawRoute([userPos, dropPos]); }
    if (!sessionStorage.getItem('pickupInputText')) syncAddressInput(userPos.lat, userPos.lng, 'pickupInput');

    map.on('click', async (e) => {
      if (document.getElementById('destinationPanel').classList.contains('hidden')) return;
      const { lat, lng } = e.latlng;
      updateDropPos(lat, lng);
      if (!dropMarker) { dropMarker = L.marker([lat, lng], { draggable: true }).addTo(map); dropMarker.bindPopup('<b>Destination</b>'); dropMarker.on('dragend', async () => { const pos = dropMarker.getLatLng(); updateDropPos(pos.lat, pos.lng); syncAddressInput(pos.lat, pos.lng, 'dropInput'); if (userPos && dropPos) drawRoute([userPos, dropPos]); document.getElementById('continueBtn').disabled = false; }); }
      else { dropMarker.setLatLng([lat, lng]); }
      dropMarker.openPopup();
      syncAddressInput(lat, lng, 'dropInput');
      if (userPos && dropPos) drawRoute([userPos, dropPos]);
      document.getElementById('continueBtn').disabled = false;
    });

    if (dropMarker) { dropMarker.on('dragend', async () => { const pos = dropMarker.getLatLng(); updateDropPos(pos.lat, pos.lng); syncAddressInput(pos.lat, pos.lng, 'dropInput'); if (userPos && dropPos) drawRoute([userPos, dropPos]); document.getElementById('continueBtn').disabled = false; }); }

    mapInitialized = true;
    if (sessionStorage.getItem('gpsPromptAnswered') !== 'true') return;
    if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(async pos => { updateUserPos(pos.coords.latitude, pos.coords.longitude); pickupMarker.setLatLng([userPos.lat, userPos.lng]); if (!currentBookingId) map.setView([userPos.lat, userPos.lng], 15); syncAddressInput(userPos.lat, userPos.lng, 'pickupInput'); }, () => {}, { enableHighAccuracy: false, timeout: 5000 }); }
  }

  async function drawRoute(waypoints) {
    const coordsStr = waypoints.map(w => `${w.lat},${w.lng}`).join('-');
    if (currentRouteCoords === coordsStr) return; currentRouteCoords = coordsStr;
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const routeGeometry = await Geo.getOptimizedRoute(waypoints);
    if (routeGeometry && map) { currentRouteLayer = L.geoJSON(routeGeometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.8 } }).addTo(map); map.fitBounds(currentRouteLayer.getBounds(), { padding: [50, 50] }); }
  }

  const setupAutocomplete = (inputId, dropdownId, isPickup) => {
    const input = document.getElementById(inputId); const dropdown = document.getElementById(dropdownId); let timeout;
    input.addEventListener('input', (e) => {
      sessionStorage.setItem(inputId + 'Text', e.target.value); clearTimeout(timeout); const query = e.target.value;
      if (query.length < 3) { dropdown.innerHTML = ''; dropdown.classList.add('hidden'); return; }
      timeout = setTimeout(async () => {
        const results = await Geo.searchPlaces(query); dropdown.innerHTML = '';
        if (results.length > 0) { results.forEach(place => { const div = document.createElement('div'); div.className = 'autocomplete-item'; div.textContent = place.display_name; div.onclick = () => { input.value = place.display_name; sessionStorage.setItem(inputId + 'Text', place.display_name); dropdown.classList.add('hidden'); const lat = parseFloat(place.lat), lon = parseFloat(place.lon); if (isPickup) { updateUserPos(lat, lon); if (mapInitialized) { pickupMarker.setLatLng([lat, lon]).openPopup(); map.setView([lat, lon], 14); } } else { updateDropPos(lat, lon); if (mapInitialized) { if (!dropMarker) { dropMarker = L.marker([lat, lon], { draggable: true }).addTo(map); dropMarker.bindPopup('<b>Destination</b>'); } else { dropMarker.setLatLng([lat, lon]); } dropMarker.openPopup(); } document.getElementById('continueBtn').disabled = false; } if (mapInitialized && userPos && dropPos) drawRoute([userPos, dropPos]); }; dropdown.appendChild(div); }); dropdown.classList.remove('hidden'); } else dropdown.classList.add('hidden');
      }, 500);
    });
    document.addEventListener('click', (e) => { if (e.target !== input && e.target !== dropdown) dropdown.classList.add('hidden'); });
  };

  document.getElementById('soloCard').addEventListener('click', () => selectRideType('solo'));
  document.getElementById('sharedCard').addEventListener('click', () => selectRideType('shared'));
  document.getElementById('femaleCard').addEventListener('click', () => selectRideType('female'));

  function selectRideType(type) {
    rideType = type; sessionStorage.setItem('rideType', type);
    document.getElementById('rideTypeScreen').classList.add('hidden'); document.getElementById('mapScreen').classList.remove('hidden');
    initMap(); setupAutocomplete('pickupInput', 'pickupDropdown', true); setupAutocomplete('dropInput', 'dropDropdown', false); showStep('destination');
    if (sessionStorage.getItem('pickupInputText')) document.getElementById('pickupInput').value = sessionStorage.getItem('pickupInputText');
    if (sessionStorage.getItem('dropInputText')) { document.getElementById('dropInput').value = sessionStorage.getItem('dropInputText'); document.getElementById('continueBtn').disabled = false; }
  }

  function showStep(step) {
    sessionStorage.setItem('currentStep', step);
    document.getElementById('destinationPanel').classList.add('hidden'); document.getElementById('vehiclePanel').classList.add('hidden'); document.getElementById('trackingPanel').classList.add('hidden');
    if (step === 'destination') document.getElementById('destinationPanel').classList.remove('hidden');
    else if (step === 'vehicle') { document.getElementById('vehiclePanel').classList.remove('hidden'); populateVehicles(); }
    else if (step === 'tracking') document.getElementById('trackingPanel').classList.remove('hidden');
  }

  document.getElementById('backToRideType').addEventListener('click', () => { document.getElementById('mapScreen').classList.add('hidden'); document.getElementById('rideTypeScreen').classList.remove('hidden'); });
  document.getElementById('backToDestination').addEventListener('click', () => { showStep('destination'); });
  document.getElementById('continueBtn').addEventListener('click', () => { if (!dropPos) return alert("Please select a destination first."); showStep('vehicle'); });

  function populateVehicles() {
    const container = document.getElementById('vehicleOptions'); container.innerHTML = ''; selectedVehicleType = null; selectedFare = 0; document.getElementById('confirmRideBtn').disabled = true; document.getElementById('fareSummary').classList.add('hidden');
    const distance = getDistance(userPos.lat, userPos.lng, dropPos.lat, dropPos.lng);
    const isShared = rideType === 'shared'; const isFemale = rideType === 'female';
    const labels = { solo: 'Solo Ride', shared: 'Shared Ride', female: 'Female Driver Ride' };
    document.getElementById('rideTypeLabel').textContent = labels[rideType] + ' • ' + distance.toFixed(1) + ' km';
    const vehicles = [
      { type: 'rickshaw', icon: '🛺', name: 'Auto Rickshaw', baseRate: 15, minFare: 30 },
      { type: 'mini', icon: '🚗', name: 'Mini', baseRate: 20, minFare: 50 },
      { type: 'cab', icon: '🚖', name: 'Cab / Sedan', baseRate: 25, minFare: 70 },
      { type: 'suv', icon: '🚙', name: 'SUV', baseRate: 35, minFare: 100 }
    ];
    vehicles.forEach(v => {
      let fare = Math.max(v.minFare, Math.round(distance * v.baseRate)); const originalFare = fare; let displayName = v.name; let desc = '';
      if (isShared) { fare = getSharedFare(fare); displayName = 'Shared ' + v.name; desc = 'Save ' + (originalFare - fare); }
      if (isFemale) { desc = '♀ Female driver'; }
      const card = document.createElement('div'); card.className = 'vehicle-card'; card.dataset.vehicle = v.type; card.dataset.fare = fare; card.dataset.originalFare = originalFare;
      card.innerHTML = `<div class="vehicle-icon">${v.icon}</div><div class="vehicle-info"><div class="vehicle-name">${displayName}${isShared ? '<span class="shared-badge">SHARED</span>' : ''}${isFemale ? '<span class="female-badge">♀ FEMALE</span>' : ''}</div><div class="vehicle-desc">${isShared ? 'Save ₹' + desc : desc || 'Comfortable ride'}</div></div><div style="text-align:right;"><div class="vehicle-fare">₹${fare}</div>${isShared ? '<div class="vehicle-fare-original">₹' + originalFare + '</div>' : ''}</div>`;
      card.addEventListener('click', () => { container.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); selectedVehicleType = v.type; selectedFare = fare; document.getElementById('confirmRideBtn').disabled = false; document.getElementById('fareSummary').classList.remove('hidden'); document.getElementById('fareAmount').textContent = '₹' + originalFare; if (isShared) { document.getElementById('sharedFareRow').classList.remove('hidden'); document.getElementById('sharedFareRow').style.display = 'flex'; document.getElementById('discountAmount').textContent = '-₹' + (originalFare - fare); } else { document.getElementById('sharedFareRow').classList.add('hidden'); } document.getElementById('totalAmount').textContent = '₹' + fare; });
      container.appendChild(card);
    });
  }

  document.getElementById('confirmRideBtn').addEventListener('click', () => { if (!selectedVehicleType) return; document.getElementById('paymentModal').classList.remove('hidden'); paymentMethod = null; document.getElementById('proceedPaymentBtn').disabled = true; document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected')); });

  document.querySelectorAll('.payment-option').forEach(option => { option.addEventListener('click', () => { document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected')); option.classList.add('selected'); paymentMethod = option.dataset.method; document.getElementById('proceedPaymentBtn').disabled = false; }); });

  document.getElementById('proceedPaymentBtn').addEventListener('click', async () => {
    if (!paymentMethod) return; sessionStorage.setItem('paymentMethod', paymentMethod); document.getElementById('paymentModal').classList.add('hidden');
    const isSharedRide = rideType === 'shared'; const isFemaleDriver = rideType === 'female';
    if (isSharedRide) {
      try {
        const allBookings = await loadBookings();
        const existingSharedRide = allBookings.find(b =>
          b.status === 'active' &&
          b.isShared === true &&
          (b.vehicleType || '').toLowerCase() === selectedVehicleType &&
          (!b.coPassenger || !b.coPassenger.joinedUserId) &&
          (Date.now() - (b.createdAt || 0)) < 15 * 60 * 1000
        );

        if (existingSharedRide) {
          const sharedFare = getSharedFare(existingSharedRide.fare);
          await updateBooking(existingSharedRide.id, { fare: sharedFare, coPassenger: { joinedUserId: userData.name, joinedUserPhone: userData.phone, pickupLat: userPos.lat, pickupLng: userPos.lng, dropLat: dropPos.lat, dropLng: dropPos.lng, pickupLabel: document.getElementById('pickupInput').value, dropLabel: document.getElementById('dropInput').value, paymentMethod: paymentMethod, fare: sharedFare } });
          currentBookingId = String(existingSharedRide.id); sessionStorage.setItem('currentBookingId', currentBookingId); sessionStorage.setItem('currentStep', 'tracking'); startTracking(); return;
        }
      } catch (err) { console.error('Error searching for shared rides:', err); }
    }
    const newBooking = { userName: userData.name, userPhone: userData.phone, pickupLat: userPos.lat, pickupLng: userPos.lng, pickupLabel: document.getElementById('pickupInput').value, dropLat: dropPos.lat, dropLng: dropPos.lng, dropLabel: document.getElementById('dropInput').value, vehicleType: selectedVehicleType, isShared: isSharedRide, femaleDriver: isFemaleDriver, coPassenger: null, paymentMethod: paymentMethod, status: 'active', fare: selectedFare, otp: Math.floor(1000 + Math.random() * 9000).toString(), driverName: 'Searching...', user1PickedUp: false, user2PickedUp: false, user1DroppedOff: false, user2DroppedOff: false };
    try { const savedBooking = await addBooking(newBooking); currentBookingId = String(savedBooking.id); sessionStorage.setItem('currentBookingId', currentBookingId); sessionStorage.setItem('currentStep', 'tracking'); startTracking(); } catch (e) { alert("Failed to book ride."); }
  });

  function startTracking() {
    showStep('tracking'); document.getElementById('trackingSearching').classList.remove('hidden'); document.getElementById('trackingDriverInfo').classList.add('hidden');
    if (rideType === 'shared') document.getElementById('trackingSharedInfo').classList.remove('hidden');
    const paymentIcons = { cash: '💵 Cash', upi: '📱 UPI' }; document.getElementById('paymentBadge').textContent = paymentIcons[paymentMethod] || '💵 Cash';
  }

  document.getElementById('cancelRideBtn').addEventListener('click', async () => {
    if (currentBookingId) { if (confirm('Are you sure you want to cancel this ride?')) { await updateBooking(currentBookingId, { status: 'cancelled' }); currentBookingId = null; sessionStorage.removeItem('currentBookingId'); sessionStorage.removeItem('rideType'); sessionStorage.removeItem('paymentMethod'); sessionStorage.removeItem('currentStep'); window.location.reload(); } }
  });

  function showCoPassengerBlip(lat, lng) {
    if (!mapInitialized) return; if (coPassengerBlip) map.removeLayer(coPassengerBlip);
    const blipIcon = L.divIcon({ className: 'co-passenger-blink', html: '<div class="blip-outer"><div class="blip-inner">👥</div></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
    coPassengerBlip = L.marker([lat, lng], { icon: blipIcon }).addTo(map); coPassengerBlip.bindPopup('<b>Co-Passenger Pickup</b>');
  }

  function updateVehicleMarker(driverPosData, vehicleType) {
    if (!mapInitialized || !driverPosData) return;
    const vehicleEmojis = { rickshaw: '🛺', mini: '🚗', cab: '🚖', suv: '🚙' }; const emoji = vehicleEmojis[vehicleType] || '🚗';
    if (!driverMarker) { const icon = L.divIcon({ className: 'vehicle-map-marker', html: `<div class="vehicle-map-icon">${emoji}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] }); driverMarker = L.marker([driverPosData.lat, driverPosData.lng], { icon: icon }).addTo(map); driverMarker.bindPopup('<b>Your Driver</b>'); }
    else { driverMarker.setLatLng([driverPosData.lat, driverPosData.lng]); }
  }

  setInterval(async () => {
    if (!currentBookingId) return;
    const allBookings = await loadBookings();
    const myRide = findBookingById(allBookings, currentBookingId);

    if (myRide) {
      const isMainUser = userData.name === myRide.userName;
      const isCoUser = myRide.coPassenger && userData.name === myRide.coPassenger.joinedUserId;
      let amPickedUp = false, amDroppedOff = false;
      if (isMainUser) { amPickedUp = myRide.user1PickedUp; amDroppedOff = myRide.user1DroppedOff; }
      else if (isCoUser) { amPickedUp = myRide.user2PickedUp; amDroppedOff = myRide.user2DroppedOff; }
      else if (!myRide.isShared) { amPickedUp = myRide.status === 'in_progress'; amDroppedOff = myRide.status === 'completed'; }

      if (mapInitialized && myRide.driverPos) {
        const pickups = [{ lat: myRide.pickupLat, lng: myRide.pickupLng }];
        const dropoffs = [{ lat: myRide.dropLat, lng: myRide.dropLng }];
        
        if (myRide.isShared && myRide.coPassenger && myRide.coPassenger.joinedUserId) {
            pickups.push({ lat: myRide.coPassenger.pickupLat, lng: myRide.coPassenger.pickupLng });
        }
        
        const optimizedWaypoints = optimizeRoute(myRide.driverPos, pickups, dropoffs);
        drawRoute(optimizedWaypoints);
      }

      if (myRide.isShared && myRide.coPassenger && myRide.coPassenger.joinedUserId && mapInitialized) { showCoPassengerBlip(myRide.coPassenger.pickupLat, myRide.coPassenger.pickupLng); }

      if (myRide.isShared && myRide.coPassenger && myRide.coPassenger.joinedUserId) { document.getElementById('trackingSharedInfo').classList.remove('hidden'); document.getElementById('trackingSharedInfo').textContent = '👥 Co-passenger: ' + myRide.coPassenger.joinedUserId; document.getElementById('trackingSharedStatus').classList.remove('hidden'); }

      if ((myRide.status === 'accepted' || myRide.status === 'in_progress') && myRide.driverName && myRide.driverName !== 'Searching...') {
        document.getElementById('trackingSearching').classList.add('hidden'); document.getElementById('trackingDriverInfo').classList.remove('hidden');
        document.getElementById('driverNameText').textContent = myRide.driverName || 'Driver';
        const vehicleLabels = { rickshaw: 'Auto Rickshaw', mini: 'Mini', cab: 'Cab', suv: 'SUV' };
        document.getElementById('driverVehicleText').textContent = vehicleLabels[myRide.vehicleType] || myRide.vehicleType;
        document.getElementById('otpValue').textContent = myRide.otp || '----';

        if (myRide.driverPos) {
          updateVehicleMarker(myRide.driverPos, myRide.vehicleType);
          const dist = getDistance(myRide.driverPos.lat, myRide.driverPos.lng, myRide.pickupLat, myRide.pickupLng);
          const eta = amPickedUp ? 0 : Math.max(1, Math.ceil(dist / 25 * 60));
          document.getElementById('etaValue').textContent = eta;
        } else { document.getElementById('etaValue').textContent = '--'; }

        if (amDroppedOff) { document.getElementById('trackingRideStatus').textContent = 'Trip completed! Thank you for riding with GoShare.'; document.getElementById('etaValue').textContent = '0'; myDropOffDone = true; }
        else if (amPickedUp) { document.getElementById('trackingRideStatus').textContent = 'Trip in progress'; }
        else { document.getElementById('trackingRideStatus').textContent = 'Driver is arriving'; }
      } else {
        document.getElementById('trackingSearching').classList.remove('hidden');
        document.getElementById('trackingDriverInfo').classList.add('hidden');
      }

      if (myDropOffDone || amDroppedOff || (myRide.status === 'completed' && !myRide.isShared)) { currentBookingId = null; sessionStorage.removeItem('currentBookingId'); sessionStorage.removeItem('rideType'); sessionStorage.removeItem('paymentMethod'); sessionStorage.removeItem('currentStep'); alert('Trip completed! Thank you for riding with GoShare.'); window.location.reload(); }
      if (myRide.status === 'cancelled') { currentBookingId = null; sessionStorage.removeItem('currentBookingId'); sessionStorage.removeItem('rideType'); sessionStorage.removeItem('paymentMethod'); sessionStorage.removeItem('currentStep'); alert('Ride was cancelled.'); window.location.reload(); }
    }
  }, 3000);

  if (currentBookingId) { rideType = sessionStorage.getItem('rideType') || 'solo'; paymentMethod = sessionStorage.getItem('paymentMethod') || 'cash'; document.getElementById('rideTypeScreen').classList.add('hidden'); document.getElementById('mapScreen').classList.remove('hidden'); initMap(); setupAutocomplete('pickupInput', 'pickupDropdown', true); setupAutocomplete('dropInput', 'dropDropdown', false); startTracking(); }
});