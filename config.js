// =====================================================
// RIDE-SHARE APP CONFIG
// =====================================================

window.APP_CONFIG = {
  // Visuals and capacity limits
  PRICING: {
    rickshaw: { capacity: 3, label: 'Auto Rickshaw', icon: '🛺' },
    mini:     { capacity: 4, label: 'Mini',          icon: '🚗' },
    cab:      { capacity: 4, label: 'Cab',           icon: '🚖' },
    suv:      { capacity: 6, label: 'SUV',           icon: '🚙' }
  },

  SOLO_MULTIPLIER: 1.5,
  DEFAULT_CENTER: { lat: 18.5204, lng: 73.8567, label: 'Pune' },
  AVG_SPEED_KMH: 25,

  // Optimized Distance Slab Pricing
  calculateFare: function(type, km, isShared) {
    let base = 0;
    if (type === 'rickshaw') {
      if (km <= 3) base = 20; 
      else if (km <= 7) base = 40; 
      else base = 40 + ((km - 7) * 8);
    } else if (type === 'mini') {
      if (km <= 3) base = 40; 
      else if (km <= 7) base = 80; 
      else base = 80 + ((km - 7) * 12);
    } else if (type === 'cab') {
      if (km <= 3) base = 60; 
      else if (km <= 7) base = 120; 
      else base = 120 + ((km - 7) * 15);
    } else if (type === 'suv') {
      if (km <= 3) base = 80; 
      else if (km <= 7) base = 150; 
      else base = 150 + ((km - 7) * 20);
    }
    return isShared ? Math.round(base) : Math.round(base * this.SOLO_MULTIPLIER);
  }
};