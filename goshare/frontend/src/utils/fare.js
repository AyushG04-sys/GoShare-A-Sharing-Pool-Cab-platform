export const VEHICLE_CONFIG = {
  rickshaw: {
    label: 'Auto Rickshaw',
    capacity: 3,
    icon: '🛺',
    slabs: {
      tier1MaxKm: 3,
      tier1Base: 20,
      tier2MaxKm: 7,
      tier2Base: 40,
      extraPerKm: 8,
    },
  },
  mini: {
    label: 'Mini',
    capacity: 4,
    icon: '🚗',
    slabs: {
      tier1MaxKm: 3,
      tier1Base: 40,
      tier2MaxKm: 7,
      tier2Base: 80,
      extraPerKm: 12,
    },
  },
  cab: {
    label: 'Cab / Sedan',
    capacity: 4,
    icon: '🚖',
    slabs: {
      tier1MaxKm: 3,
      tier1Base: 60,
      tier2MaxKm: 7,
      tier2Base: 120,
      extraPerKm: 15,
    },
  },
  suv: {
    label: 'SUV',
    capacity: 6,
    icon: '🚙',
    slabs: {
      tier1MaxKm: 3,
      tier1Base: 80,
      tier2MaxKm: 7,
      tier2Base: 150,
      extraPerKm: 20,
    },
  },
};

export const SOLO_MULTIPLIER = 1.5;

export function calculateBaseSlabFare(vehicleType, distanceKm) {
  const vehicle = VEHICLE_CONFIG[vehicleType] || VEHICLE_CONFIG.cab;
  const km = Math.max(0.1, distanceKm);
  const { tier1MaxKm, tier1Base, tier2MaxKm, tier2Base, extraPerKm } = vehicle.slabs;

  if (km <= tier1MaxKm) {
    return tier1Base;
  } else if (km <= tier2MaxKm) {
    return tier2Base;
  } else {
    return tier2Base + Math.round((km - tier2MaxKm) * extraPerKm);
  }
}

export function calculateSharedDiscount(baseFare) {
  let discountPercent = 20;
  if (baseFare >= 80) {
    discountPercent = 35;
  } else if (baseFare <= 40) {
    discountPercent = 10;
  }

  const multiplier = (100 - discountPercent) / 100;
  const sharedFare = Math.round(baseFare * multiplier);
  const savings = Math.max(0, baseFare - sharedFare);

  return {
    sharedFare,
    discountPercent,
    savings,
  };
}

export function calculateFare(vehicleType, distanceKm) {
  const km = Math.round(distanceKm * 100) / 100;
  const baseFare = calculateBaseSlabFare(vehicleType, km);
  const soloFare = Math.round(baseFare * SOLO_MULTIPLIER);
  const { sharedFare, discountPercent, savings } = calculateSharedDiscount(baseFare);

  return {
    vehicleType,
    vehicleLabel: VEHICLE_CONFIG[vehicleType]?.label || vehicleType,
    capacity: VEHICLE_CONFIG[vehicleType]?.capacity || 4,
    distanceKm: km,
    baseFare,
    soloFare,
    soloMultiplier: SOLO_MULTIPLIER,
    sharedFare,
    sharedDiscountPercent: discountPercent,
    sharedSavingsVsBase: savings,
    sharedSavingsVsSolo: soloFare - sharedFare,
    currency: 'INR',
  };
}
