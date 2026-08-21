document.addEventListener('DOMContentLoaded', () => {
  const renderTable = () => {
    const bookings = loadBookings();
    const driverStats = {};

    bookings.forEach(b => {
      if (b.status === 'completed' && b.driverName && b.driverName !== 'Searching...') {
        if (!driverStats[b.driverName]) {
          driverStats[b.driverName] = { trips: 0, earnings: 0, ratingSum: 0, ratedCount: 0 };
        }
        driverStats[b.driverName].trips += 1;
        driverStats[b.driverName].earnings += b.fare;
        
        if (b.rating) {
           driverStats[b.driverName].ratingSum += b.rating;
           driverStats[b.driverName].ratedCount += 1;
        }
      }
    });

    const tbody = document.getElementById('adminTableBody');
    const drivers = Object.keys(driverStats);

    if (drivers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#64748b;">No completed rides found in database.</td></tr>';
    } else {
      tbody.innerHTML = '';
      drivers.forEach(driver => {
        const stats = driverStats[driver];
        const avgRating = stats.ratedCount > 0 ? (stats.ratingSum / stats.ratedCount).toFixed(1) : 'No Ratings';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 600;">${driver}</td>
          <td>${stats.trips}</td>
          <td style="color: #059669; font-weight: 700;">₹${stats.earnings}</td>
          <td style="font-weight: 500;"><span style="color:#fbbf24;">★</span> ${avgRating}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  };

  // Initial render and listen for changes
  renderTable();
  window.onBookingsUpdated = renderTable;

  // NEW: Listen for SOS Emergency Alerts
  listenForSOS((alerts) => {
    const box = document.getElementById('sosAlertBox');
    box.innerHTML = '';
    alerts.reverse().forEach(alert => {
       box.innerHTML += `
       <div style="background: #fef2f2; border: 2px solid #ef4444; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
          <h3 style="color: #b91c1c; margin:0 0 8px 0; display:flex; align-items:center; gap:8px;">
            <span style="font-size:24px;">🚨</span> SOS EMERGENCY INITIATED
          </h3>
          <p style="margin:4px 0; color:#7f1d1d;"><strong>Passenger:</strong> ${alert.userName} (${alert.userId})</p>
          <p style="margin:4px 0; color:#7f1d1d;"><strong>Driver:</strong> ${alert.driverName} | <strong>Plate:</strong> ${alert.plate}</p>
          <p style="margin:4px 0; color:#7f1d1d;"><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
          <a href="https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lng}" target="_blank" style="display:inline-block; margin-top:8px; padding:6px 12px; background:#b91c1c; color:white; border-radius:6px; text-decoration:none; font-weight:bold;">📍 View Live Location</a>
       </div>`;
    });
  });
});