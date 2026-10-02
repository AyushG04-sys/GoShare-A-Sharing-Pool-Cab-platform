import { APP_CONFIG } from './config.js';
import { Geo } from './geocode.js';
import { addBooking, loadBookings, triggerSOS, updateBooking } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const userData = JSON.parse(sessionStorage.getItem('rideUser') || '{}');
  if (!userData.loggedIn || userData.role !== 'user') window.location.href = 'index.html';
  if (document.getElementById('userNameDisplay')) document.getElementById('userNameDisplay').textContent = userData.name;

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    sessionStorage.clear(); 
    window.location.href = 'index.html';
  });

  let map, pickupMarker, dropMarker, coPassengerMarker, currentRouteLayer;
  
  // DEEP STATE RECOVERY: Ensures no data is lost during Live Server forced reloads
  let savedLat = sessionStorage.getItem('userLat');
  let savedLng = sessionStorage.getItem('userLng');
  let userPos = (savedLat && savedLng) ? { lat: parseFloat(savedLat), lng: parseFloat(savedLng) } : { lat: 18.5204, lng: 73.8567 }; 
  
  let dropPos = JSON.parse(sessionStorage.getItem('dropPos') || 'null'); 
  let currentRouteCoords = ''; 
  let currentBookingId = sessionStorage.getItem('currentBookingId'); 

  function updateUserPos(lat, lng) {
      userPos = { lat, lng };
      sessionStorage.setItem('userLat', lat);
      sessionStorage.setItem('userLng', lng);
  }

  function updateDropPos(lat, lng) {
      dropPos = { lat, lng };
      sessionStorage.setItem('dropPos', JSON.stringify(dropPos));
  }

  const syncAddressInput = async (lat, lng, inputId) => {
      const rev = await Geo.geocodeReverse(lat, lng);
      if (rev && rev.display_name) {
          const formatted = rev.display_name.split(',').slice(0, 3).join(', ');
          document.getElementById(inputId).value = formatted;
          sessionStorage.setItem(inputId + 'Text', formatted);
      }
  };

  // Restore Text Inputs
  if (sessionStorage.getItem('pickupInputText')) document.getElementById('pickupInput').value = sessionStorage.getItem('pickupInputText');
  if (sessionStorage.getItem('dropInputText')) document.getElementById('dropInput').value = sessionStorage.getItem('dropInputText');

  // UI State Recovery
  if (currentBookingId) {
      document.getElementById('bookingPanel').classList.add('hidden');
      document.getElementById('activeRidePanel').classList.remove('hidden');
  }

  // Initialize Map
  map = L.map('map', { zoomControl: false }).setView([userPos.lat, userPos.lng], 15);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  pickupMarker = L.marker([userPos.lat, userPos.lng], { draggable: false }).addTo(map);
  pickupMarker.bindPopup('<b>Pickup</b>').openPopup();

  if (dropPos && !currentBookingId) {
      dropMarker = L.marker([dropPos.lat, dropPos.lng], { draggable: false }).addTo(map);
      dropMarker.bindPopup('<b>Destination</b>');
      drawRoute([userPos, dropPos]);
  }

  if (!sessionStorage.getItem('pickupInputText')) syncAddressInput(userPos.lat, userPos.lng, 'pickupInput');

  // --- GPS MODAL LOGIC ---
  const gpsModal = document.getElementById('gpsModal');
  
  if (sessionStorage.getItem('gpsPromptAnswered') === 'true') {
      gpsModal.classList.add('hidden');
      if (navigator.geolocation && !currentBookingId && !dropPos) {
          navigator.geolocation.getCurrentPosition(async pos => {
              updateUserPos(pos.coords.latitude, pos.coords.longitude);
              pickupMarker.setLatLng([userPos.lat, userPos.lng]);
              map.setView([userPos.lat, userPos.lng], 15);
              syncAddressInput(userPos.lat, userPos.lng, 'pickupInput'); 
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
        updateUserPos(pos.coords.latitude, pos.coords.longitude);
        
        map.setView([userPos.lat, userPos.lng], 15);
        pickupMarker.setLatLng([userPos.lat, userPos.lng]).openPopup();
        
        syncAddressInput(userPos.lat, userPos.lng, 'pickupInput'); 
        if (dropPos) drawRoute([userPos, dropPos]);
      },
      () => { 
          alert("Failed to get GPS. Try checking browser permissions."); 
          sessionStorage.setItem('gpsPromptAnswered', 'true');
          gpsModal.classList.add('hidden');
      },
      { enableHighAccuracy: true, timeout: 15000 } 
    );
  });

  // --- AUTOCOMPLETE LOGIC ---
  const setupAutocomplete = (inputId, dropdownId, isPickup) => {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    let timeout;

    input.addEventListener('input', (e) => {
      sessionStorage.setItem(inputId + 'Text', e.target.value); // Cache as user types
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
              sessionStorage.setItem(inputId + 'Text', place.display_name);
              dropdown.classList.add('hidden');
              const lat = parseFloat(place.lat), lon = parseFloat(place.lon);
              
              if (isPickup) {
                updateUserPos(lat, lon);
                pickupMarker.setLatLng([lat, lon]).openPopup();
                map.setView([lat, lon], 14);
              } else {
                updateDropPos(lat, lon);
                if (!dropMarker) {
                    dropMarker = L.marker([lat, lon], { draggable: false }).addTo(map);
                    dropMarker.bindPopup('<b>Destination</b>');
                }
                dropMarker.setLatLng([lat, lon]).openPopup();
              }
              if(userPos && dropPos) drawRoute([userPos, dropPos]);
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

  function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }
  
  const getSharedFare = (baseFare) => {
      if (baseFare >= 80) return Math.round(baseFare * 0.65); 
      if (baseFare <= 40) return Math.round(baseFare * 0.90); 
      return Math.round(baseFare * 0.80);                     
  };

  function populateFares() {
      if (!dropPos || !userPos) return;
      const distance = getDistance(userPos.lat, userPos.lng, dropPos.lat, dropPos.lng);
      
      const baseAuto = Math.max(30, Math.round(distance * 15));
      const baseMini = Math.max(50, Math.round(distance * 20));
      const baseCab = Math.max(70, Math.round(distance * 25));
      const baseSuv = Math.max(100, Math.round(distance * 35));

      const select = document.getElementById('vehicleSelect');
      select.innerHTML = `
          <option value="rickshaw">Auto Rickshaw - ₹${baseAuto}</option>
          <option value="rickshaw">Shared Auto (Save up to 35%) - ₹${getSharedFare(baseAuto)}</option>
          <option value="mini">Mini - ₹${baseMini}</option>
          <option value="cab">Cab / Sedan - ₹${baseCab}</option>
          <option value="cab">Shared Cab (Save up to 35%) - ₹${getSharedFare(baseCab)}</option>
          <option value="suv">SUV - ₹${baseSuv}</option>
      `;

      document.getElementById('confirmRouteBtn').classList.add('hidden');
      document.getElementById('vehicleSelectionPanel').classList.remove('hidden');
      sessionStorage.setItem('vehiclePanelOpen', 'true');
  }

  // Restore Panel State if Live Server Reloaded
  if (sessionStorage.getItem('vehiclePanelOpen') === 'true' && !currentBookingId) {
      populateFares();
  }

  document.getElementById('confirmRouteBtn').addEventListener('click', (e) => {
    e.preventDefault();
    if (!dropPos || !userPos) return alert("Please search for a destination first.");
    populateFares();
  });

  document.getElementById('confirmRideBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const select = document.getElementById('vehicleSelect');
    const selectedText = select.options[select.selectedIndex].text;
    const extractedFare = parseInt(selectedText.match(/₹(\d+)/)[1]); 
    const isSharedRide = selectedText.includes('Shared');

    let coPassengerCoords = null;

    if (isSharedRide) {
        const coPickupLat = userPos.lat + (dropPos.lat - userPos.lat) * 0.3;
        const coPickupLng = userPos.lng + (dropPos.lng - userPos.lng) * 0.3;
        const coDropLat = userPos.lat + (dropPos.lat - userPos.lat) * 0.7;
        const coDropLng = userPos.lng + (dropPos.lng - userPos.lng) * 0.7;
        
        coPassengerCoords = { pickupLat: coPickupLat, pickupLng: coPickupLng, dropLat: coDropLat, dropLng: coDropLng };
    }

    const newBooking = {
      userName: userData.name, userPhone: userData.phone,
      pickupLat: userPos.lat, pickupLng: userPos.lng, pickupLabel: document.getElementById('pickupInput').value,
      dropLat: dropPos.lat, dropLng: dropPos.lng, dropLabel: document.getElementById('dropInput').value,
      vehicleType: select.value,
      isShared: isSharedRide,
      coPassenger: coPassengerCoords,
      status: 'active', fare: extractedFare,
      otp: Math.floor(1000 + Math.random() * 9000).toString(),
      driverName: 'Searching...'
    };

    try {
      const savedBooking = await addBooking(newBooking);
      currentBookingId = savedBooking.id;
      sessionStorage.setItem('currentBookingId', currentBookingId); 

      document.getElementById('bookingStatus').textContent = 'Searching for drivers...';
      document.getElementById('rideOtpDisplay').textContent = `OTP: ${savedBooking.otp}`;
      document.getElementById('activeRidePanel')?.classList.remove('hidden');
      document.getElementById('bookingPanel')?.classList.add('hidden');
      
      syncRouteWithMemory(savedBooking);
    } catch (e) { alert("Failed to book ride."); }
  });

  function syncRouteWithMemory(myRide) {
      if (!currentRouteLayer) {
          if (myRide.isShared && myRide.coPassenger) {
              const iconPick = L.divIcon({ className: 'co-passenger-marker', html: '👥', iconSize: [20, 20] });
              const iconDrop = L.divIcon({ className: 'co-passenger-marker', html: '👋', iconSize: [20, 20] });
              if(!coPassengerMarker) {
                  L.marker([myRide.coPassenger.pickupLat, myRide.coPassenger.pickupLng], { icon: iconPick }).addTo(map).bindPopup('<b>Co-Passenger Pickup</b>');
                  L.marker([myRide.coPassenger.dropLat, myRide.coPassenger.dropLng], { icon: iconDrop }).addTo(map).bindPopup('<b>Co-Passenger Drop</b>');
              }
              document.getElementById('sharedStatus').classList.remove('hidden');
              drawRoute([
                  { lat: myRide.pickupLat, lng: myRide.pickupLng },
                  { lat: myRide.coPassenger.pickupLat, lng: myRide.coPassenger.pickupLng },
                  { lat: myRide.coPassenger.dropLat, lng: myRide.coPassenger.dropLng },
                  { lat: myRide.dropLat, lng: myRide.dropLng }
              ]);
          } else {
              drawRoute([
                  { lat: myRide.pickupLat, lng: myRide.pickupLng },
                  { lat: myRide.dropLat, lng: myRide.dropLng }
              ]);
          }
      }
  }

  // Polling Loop with Text-Only DOM Updates to stop visual lagging
  setInterval(async () => {
    if (!currentBookingId) return;
    const allBookings = await loadBookings();
    const myRide = allBookings.find(b => b.id === currentBookingId);
    
    if (myRide) {
      syncRouteWithMemory(myRide); 

      const statusTextEl = document.getElementById('bookingStatus');
      const otpDisplayEl = document.getElementById('rideOtpDisplay');
      
      if (otpDisplayEl.textContent !== `OTP: ${myRide.otp}`) otpDisplayEl.textContent = `OTP: ${myRide.otp}`;

      let updatedText = 'Searching for drivers...';
      if (myRide.status === 'accepted') updatedText = `${myRide.driverName} is arriving!`;
      else if (myRide.status === 'in_progress') updatedText = `Trip in progress with ${myRide.driverName}`;
      else if (myRide.status === 'completed') updatedText = `Trip completed!`;

      if (statusTextEl.textContent !== updatedText) statusTextEl.textContent = updatedText;

      if (myRide.status === 'completed') {
        currentBookingId = null;
        sessionStorage.removeItem('currentBookingId'); 
        sessionStorage.removeItem('vehiclePanelOpen');
        setTimeout(() => { window.location.reload(); }, 3000);
      }
    }
  }, 3000);
});