/**
 * Vehicle definitions and slab pricing rules.
 */
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

/**
 * Calculates base slab fare according to distance and vehicle type.
 * @param {string} vehicleType 'rickshaw' | 'mini' | 'cab' | 'suv'
 * @param {number} distanceKm
 * @returns {number}
 */
export function calculateBaseSlabFare(vehicleType, distanceKm) {
  const vehicle = VEHICLE_CONFIG[vehicleType];
  if (!vehicle) {
    throw new Error(`Unsupported vehicle type: ${vehicleType}`);
  }

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

/**
 * Calculates shared discount rate on the base fare.
 * Tier rules:
 * - baseFare >= 80 -> 35% discount (0.65x)
 * - baseFare <= 40 -> 10% discount (0.90x)
 * - otherwise      -> 20% discount (0.80x)
 * @param {number} baseFare
 * @returns {{ sharedFare: number, discountPercent: number, savings: number }}
 */
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

/**
 * Calculates complete fare breakdown for solo and shared options.
 * @param {string} vehicleType
 * @param {number} distanceKm
 * @returns {object}
 */
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

/**
 * Estimates all vehicle fares for a given route distance.
 * @param {number} distanceKm
 * @returns {Array}
 */
export function estimateAllVehicles(distanceKm) {
  return Object.keys(VEHICLE_CONFIG).map((type) => calculateFare(type, distanceKm));
}
