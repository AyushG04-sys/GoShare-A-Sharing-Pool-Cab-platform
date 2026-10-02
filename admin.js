import { loadBookings, listenForSOS } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const renderTable = async () => {
    const bookings = await loadBookings();
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
        const nameTd = document.createElement('td');
        nameTd.style.fontWeight = '600';
        nameTd.textContent = driver;

        const tripsTd = document.createElement('td');
        tripsTd.textContent = stats.trips;

        const earnTd = document.createElement('td');
        earnTd.style.color = '#059669';
        earnTd.style.fontWeight = '700';
        earnTd.textContent = `₹${stats.earnings}`;

        const rateTd = document.createElement('td');
        rateTd.style.fontWeight = '500';
        const star = document.createElement('span');
        star.style.color = '#fbbf24';
        star.textContent = '★';
        rateTd.appendChild(star);
        rateTd.appendChild(document.createTextNode(` ${avgRating}`));

        tr.appendChild(nameTd);
        tr.appendChild(tripsTd);
        tr.appendChild(earnTd);
        tr.appendChild(rateTd);
        tbody.appendChild(tr);
      });
    }
  };

  renderTable();

  // Poll for booking updates
  setInterval(renderTable, 10000);

  // Listen for SOS Emergency Alerts
  listenForSOS((alerts) => {
    const box = document.getElementById('sosAlertBox');
    box.innerHTML = '';
    [...alerts].reverse().forEach(alert => {
       const div = document.createElement('div');
       div.style.cssText = 'background: #fef2f2; border: 2px solid #ef4444; padding: 15px; border-radius: 8px; margin-bottom: 10px;';

       const h3 = document.createElement('h3');
       h3.style.cssText = 'color: #b91c1c; margin:0 0 8px 0; display:flex; align-items:center; gap:8px;';
       const icon = document.createElement('span');
       icon.style.fontSize = '24px';
       icon.textContent = '🚨';
       h3.appendChild(icon);
       h3.appendChild(document.createTextNode(' SOS EMERGENCY INITIATED'));

       const p1 = document.createElement('p');
       p1.style.cssText = 'margin:4px 0; color:#7f1d1d;';
       p1.innerHTML = `<strong>Passenger:</strong> ${alert.userName} (${alert.userId})`;

       const p2 = document.createElement('p');
       p2.style.cssText = 'margin:4px 0; color:#7f1d1d;';
       p2.innerHTML = `<strong>Driver:</strong> ${alert.driverName} | <strong>Plate:</strong> ${alert.plate}`;

       const p3 = document.createElement('p');
       p3.style.cssText = 'margin:4px 0; color:#7f1d1d;';
       p3.innerHTML = `<strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}`;

       const link = document.createElement('a');
       link.href = `https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lng}`;
       link.target = '_blank';
       link.style.cssText = 'display:inline-block; margin-top:8px; padding:6px 12px; background:#b91c1c; color:white; border-radius:6px; text-decoration:none; font-weight:bold;';
       link.textContent = '📍 View Live Location';

       div.appendChild(h3);
       div.appendChild(p1);
       div.appendChild(p2);
       div.appendChild(p3);
       div.appendChild(link);
       box.appendChild(div);
    });
  });
});
