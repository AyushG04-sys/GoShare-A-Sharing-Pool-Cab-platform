// ==========================================
// LOCAL STORAGE DATABASE ENGINE (No API Keys Needed)
// ==========================================

console.log("💾 Running strictly on LocalStorage");

window.loadBookings = () => JSON.parse(localStorage.getItem('rideShareBookings') || '[]');

window.saveBookings = (data) => {
  localStorage.setItem('rideShareBookings', JSON.stringify(data));
  // This event tells other open tabs to refresh their data instantly
  window.dispatchEvent(new Event('storage')); 
};

// FIX: Restored the missing helper functions!
window.addBooking = (booking) => {
  const current = loadBookings();
  current.push(booking);
  saveBookings(current);
};

window.removeBooking = (id) => {
  let current = loadBookings();
  current = current.filter(b => b.id !== id);
  saveBookings(current);
};

// SOS Emergency Functions
window.triggerSOS = (data) => {
  const alerts = JSON.parse(localStorage.getItem('sosAlerts') || '[]');
  alerts.push(data);
  localStorage.setItem('sosAlerts', JSON.stringify(alerts));
  window.dispatchEvent(new Event('storage'));
};

window.listenForSOS = (callback) => {
  const fetchAlerts = () => callback(JSON.parse(localStorage.getItem('sosAlerts') || '[]'));
  fetchAlerts(); 
  window.addEventListener('storage', fetchAlerts); 
};

window.addEventListener('storage', () => {
   if (window.onBookingsUpdated) window.onBookingsUpdated(loadBookings());
});