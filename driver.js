import { APP_CONFIG } from './config.js';
import { Geo } from './geocode.js';
import { loadBookings, updateBooking, removeBooking } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const driverData = JSON.parse(sessionStorage.getItem('rideUser') || '{}');
  if (!driverData.loggedIn || driverData.role !== 'driver') window.location.href = 'index.html';

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    sessionStorage.clear(); 
    window.location.href = 'index.html';
  });

  const vehicleIcons = { rickshaw: '🛺', mini: '🚗', cab: '🚖', suv: '🚙' };
  
  // Normalize the driver's vehicle type (fixes the silent matching bug)
  const myVehicle = (driverData.vehicleType || 'rickshaw').toLowerCase();
  
  if (driverData.vehicleType) document.getElementById('vehicleIcon').textContent = vehicleIcons[myVehicle] || '🛺';
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

  document.getElementById('denyGpsBtn')?.addEventListener('click', () => {
      sessionStorage.setItem('gpsPromptAnswered', 'true');
      gpsModal.classList.add('hidden');
  });

  document.getElementById('allowGpsBtn')?.addEventListener('click', () => {
    if(!navigator.geolocation) {
        alert("GPS not supported.");
        sessionStorage.setItem('gpsPromptAnswered', 'true');
        gpsModal.classList.add('hidden');
        return;
    }
    document.getElementById('allowGpsBtn').textContent = 'Locating...';
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        sessionStorage.setItem('gpsPromptAnswered', 'true');
        gpsModal.classList.add('hidden');
        updateDriverPos(pos.coords.latitude, pos.coords.longitude);
        
        map.setView([driverPos.lat, driverPos.lng], 15);
        pickupMarker.setLatLng([driverPos.lat, driverPos.lng]).openPopup();

        syncAddressInput(driverPos.lat, driverPos.lng, 'pickupInput'); 
        if (driverDropPos) drawRoute([driverPos, driverDropPos]);
      },
      () => { 
          alert("Failed to get GPS."); 
          sessionStorage.setItem('gpsPromptAnswered', 'true');
          gpsModal.classList.add('hidden'); 
      },
      { enableHighAccuracy: true, timeout: 15000 } 
    );
  });

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
                }
                dropMarker.setLatLng([lat, lon]).openPopup();
              }
              if(driverPos && driverDropPos) drawRoute([driverPos, driverDropPos]);
            };
            dropdown.appendChild(div);
          });
          dropdown.classList.remove('hidden');
        } else dropdown.classList.add('hidden');
      }, 500);
    });

    document.addEventListener('click', (e) => {
      if (e.target !== input && e.target !== dropdown) dropdown.classList.add('hidden');
    });
  };

  setupAutocomplete('pickupInput', 'pickupDropdown', true);
  setupAutocomplete('dropInput', 'dropDropdown', false);

  async function drawRoute(waypoints) {
    if (!waypoints || waypoints.length < 2) return;
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

  document.getElementById('onlineToggle')?.addEventListener('change', (e) => {
    isOnline = e.target.checked;
    sessionStorage.setItem('driverOnline', isOnline); 
    document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
  });

  setInterval(async () => { refreshBookings(await loadBookings()); }, 3000);

  function refreshBookings(allBookings) {
    const activeRides = allBookings.filter(b => b.driverName === driverData.name && (b.status === 'accepted' || b.status === 'in_progress'));
    renderActiveRides(activeRides);
    
    if (!isOnline) return;
    
    // FIX: Bulletproof vehicle matching and robust ID tracking
    const requests = allBookings.filter(b => 
        b.status === 'active' && 
        b.driverName === 'Searching...' &&
        (b.vehicleType || '').toLowerCase() === myVehicle &&
        !rejectedBookings.includes(String(b.id)) && 
        !rejectedBookings.includes(Number(b.id))
    );
    
    if (requests.length > 0 && !activeBooking) {
       activeBooking = requests[0];
       showRequestModal(activeBooking);
    } else if (requests.length === 0 && activeBooking) {
       // Auto-close modal if passenger cancels their ride request
       document.getElementById('requestModal').classList.add('hidden');
       activeBooking = null;
       if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; }
       clearSharedMarkers();
    }
  }

  function clearSharedMarkers() {
      sharedMarkers.forEach(m => map.removeLayer(m));
      sharedMarkers = [];
  }

  function showRequestModal(req) {
    document.getElementById('passengerName').textContent = req.userName;
    clearSharedMarkers();
    
    const waypoints = [{ lat: driverPos.lat, lng: driverPos.lng }, { lat: req.pickupLat, lng: req.pickupLng }];
    
    if (req.isShared && req.coPassenger) {
        document.getElementById('sharedAlert').classList.remove('hidden');
        document.getElementById('passengerRoute').textContent = `${req.pickupLabel} → [Shared Co-Passenger Route]`;
        
        waypoints.push({ lat: req.coPassenger.pickupLat, lng: req.coPassenger.pickupLng });
        waypoints.push({ lat: req.coPassenger.dropLat, lng: req.coPassenger.dropLng });
        
        const iconPick = L.divIcon({ className: 'co-passenger-marker', html: '👥', iconSize: [20, 20] });
        const iconDrop = L.divIcon({ className: 'co-passenger-marker', html: '👋', iconSize: [20, 20] });
        sharedMarkers.push(L.marker([req.coPassenger.pickupLat, req.coPassenger.pickupLng], { icon: iconPick }).addTo(map).bindPopup('<b>Co-Passenger Pickup</b>'));
        sharedMarkers.push(L.marker([req.coPassenger.dropLat, req.coPassenger.dropLng], { icon: iconDrop }).addTo(map).bindPopup('<b>Co-Passenger Drop</b>'));
    } else {
        document.getElementById('sharedAlert').classList.add('hidden');
        document.getElementById('passengerRoute').textContent = `${req.pickupLabel} → ${req.dropLabel}`;
    }

    waypoints.push({ lat: req.dropLat, lng: req.dropLng });

    document.getElementById('passengerFare').textContent = req.fare;
    document.getElementById('requestModal').classList.remove('hidden');
    
    drawRoute(waypoints);
    
    document.getElementById('acceptBtn').onclick = async (e) => {
      e.preventDefault();
      document.getElementById('requestModal').classList.add('hidden');
      await updateBooking(req.id, { status: 'accepted', driverName: driverData.name, driverPos });
      activeBooking = null; 
    };
    
    document.getElementById('rejectBtn').onclick = (e) => {
      e.preventDefault();
      
      rejectedBookings.push(String(req.id));
      sessionStorage.setItem('rejectedBookings', JSON.stringify(rejectedBookings)); 

      document.getElementById('requestModal').classList.add('hidden');
      if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; }
      clearSharedMarkers();
      activeBooking = null;
    };
  }

  function renderActiveRides(rides) {
     const stateHash = JSON.stringify(rides.map(r => r.id + r.status));
     if (stateHash === lastRidesStateHash) return; 
     lastRidesStateHash = stateHash;

     const container = document.getElementById('activeRidesContainer');
     container.innerHTML = '';
     
     if (rides.length === 0) {
        if (!activeBooking) {
            clearSharedMarkers();
            if (driverDropPos) drawRoute([driverPos, driverDropPos]); 
            else if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteCoords = ''; }
        }
        return;
     }

     container.appendChild(document.createElement('h4')).textContent = 'Current Rides';
     
     rides.forEach(b => {
       const waypoints = [{ lat: driverPos.lat, lng: driverPos.lng }, { lat: b.pickupLat, lng: b.pickupLng }];
       if (b.isShared && b.coPassenger) {
           waypoints.push({ lat: b.coPassenger.pickupLat, lng: b.coPassenger.pickupLng });
           waypoints.push({ lat: b.coPassenger.dropLat, lng: b.coPassenger.dropLng });
       }
       waypoints.push({ lat: b.dropLat, lng: b.dropLng });
       drawRoute(waypoints);

       const card = document.createElement('div');
       card.style.cssText = 'background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 10px; color: white;';
       
       const dropDisplay = b.isShared ? '[Shared Co-Passenger Route]' : b.dropLabel;
       
       card.innerHTML = `
           <div><strong>${b.userName} ${b.isShared ? '(Shared - 2 Pax)' : ''}</strong><br>
           <span style="font-size:12px;color:#60a5fa;">OTP: ${b.otp}</span></div>
           <p style="font-size:13px;color:#94a3b8;margin-bottom:12px;">${b.status === 'accepted' ? 'Pickup: ' + b.pickupLabel : 'Drop: ' + dropDisplay}</p>
       `;
       
       const actionBtn = document.createElement('button');
       actionBtn.className = 'primary-btn';
       actionBtn.style.width = '100%';
       actionBtn.textContent = b.status === 'accepted' ? 'Start Trip' : 'Complete Trip';
       actionBtn.onclick = async (e) => {
         e.preventDefault();
         await updateBooking(b.id, { status: b.status === 'accepted' ? 'in_progress' : 'completed' });
         if (b.status !== 'accepted' && currentRouteLayer) {
             map.removeLayer(currentRouteLayer);
             currentRouteCoords = '';
             clearSharedMarkers();
         }
       };
       card.appendChild(actionBtn); container.appendChild(card);
     });
  }
});