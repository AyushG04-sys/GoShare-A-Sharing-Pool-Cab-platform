import {
  calculateBaseSlabFare,
  calculateSharedDiscount,
  calculateFare,
  SOLO_MULTIPLIER,
} from '../src/services/fare.service.js';

describe('Fare Calculation Engine', () => {
  describe('Base Slab Rates', () => {
    test('Rickshaw Tier 1 (<= 3 km) should equal ₹20', () => {
      expect(calculateBaseSlabFare('rickshaw', 2)).toBe(20);
      expect(calculateBaseSlabFare('rickshaw', 3)).toBe(20);
    });

    test('Rickshaw Tier 2 (3-7 km) should equal ₹40', () => {
      expect(calculateBaseSlabFare('rickshaw', 5)).toBe(40);
      expect(calculateBaseSlabFare('rickshaw', 7)).toBe(40);
    });

    test('Rickshaw Tier 3 (> 7 km) should add ₹8 per km after 7 km', () => {
      // 10 km = 40 + (3 * 8) = 64
      expect(calculateBaseSlabFare('rickshaw', 10)).toBe(64);
    });

    test('Cab Tier 1, 2, and 3 calculations', () => {
      // Tier 1: ₹60
      expect(calculateBaseSlabFare('cab', 2.5)).toBe(60);
      // Tier 2: ₹120
      expect(calculateBaseSlabFare('cab', 6.0)).toBe(120);
      // Tier 3: 120 + (10 - 7) * 15 = 120 + 45 = 165
      expect(calculateBaseSlabFare('cab', 10.0)).toBe(165);
    });
  });

  describe('Solo Fare Multiplier', () => {
    test('Solo fare should apply 1.5x multiplier to base fare', () => {
      const fare = calculateFare('rickshaw', 2); // base = 20
      expect(fare.baseFare).toBe(20);
      expect(fare.soloFare).toBe(Math.round(20 * SOLO_MULTIPLIER)); // 30
    });
  });

  describe('Shared Discount Tiers', () => {
    test('High base fare (>= ₹80) receives 35% discount', () => {
      const { sharedFare, discountPercent } = calculateSharedDiscount(100);
      expect(discountPercent).toBe(35);
      expect(sharedFare).toBe(65);
    });

    test('Low base fare (<= ₹40) receives 10% discount', () => {
      const { sharedFare, discountPercent } = calculateSharedDiscount(40);
      expect(discountPercent).toBe(10);
      expect(sharedFare).toBe(36);
    });

    test('Medium base fare (between 40 and 80) receives 20% discount', () => {
      const { sharedFare, discountPercent } = calculateSharedDiscount(60);
      expect(discountPercent).toBe(20);
      expect(sharedFare).toBe(48);
    });
  });
});
