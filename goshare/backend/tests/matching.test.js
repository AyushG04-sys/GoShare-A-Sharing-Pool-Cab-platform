import {
  evaluateCompatibility,
  MAX_PICKUP_PROXIMITY_KM,
  MAX_DROPOFF_PROXIMITY_KM,
} from '../src/services/matching.service.js';

describe('Shared Ride Matching Engine', () => {
  const baseBooking = {
    vehicle_category: 'cab',
    passenger_count: 1,
    max_passengers: 2,
    created_by: 'user-aaa',
    pickup_lat: 18.5204,
    pickup_lng: 73.8567,
    destination_lat: 18.5504,
    destination_lng: 73.8967,
  };

  test('Compatible candidate within thresholds should match', () => {
    const candidate = {
      vehicle_category: 'cab',
      userId: 'user-bbb',
      pickup_lat: 18.522, // ~0.2 km away
      pickup_lng: 73.858,
      destination_lat: 18.552, // ~0.3 km away
      destination_lng: 73.898,
    };

    const result = evaluateCompatibility(baseBooking, candidate);
    expect(result.isCompatible).toBe(true);
    expect(result.pickupDistanceKm).toBeLessThan(MAX_PICKUP_PROXIMITY_KM);
    expect(result.dropoffDistanceKm).toBeLessThan(MAX_DROPOFF_PROXIMITY_KM);
  });

  test('Mismatched vehicle category should be rejected', () => {
    const candidate = {
      vehicle_category: 'rickshaw',
      userId: 'user-bbb',
      pickup_lat: 18.5204,
      pickup_lng: 73.8567,
      destination_lat: 18.5504,
      destination_lng: 73.8967,
    };

    const result = evaluateCompatibility(baseBooking, candidate);
    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('Vehicle category mismatch');
  });

  test('Full vehicle pool should be rejected', () => {
    const fullBooking = { ...baseBooking, passenger_count: 2 };
    const candidate = {
      vehicle_category: 'cab',
      userId: 'user-bbb',
      pickup_lat: 18.5204,
      pickup_lng: 73.8567,
      destination_lat: 18.5504,
      destination_lng: 73.8967,
    };

    const result = evaluateCompatibility(fullBooking, candidate);
    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('full');
  });

  test('Cannot match with own booking', () => {
    const candidate = {
      vehicle_category: 'cab',
      userId: 'user-aaa', // same user
      pickup_lat: 18.5204,
      pickup_lng: 73.8567,
      destination_lat: 18.5504,
      destination_lng: 73.8967,
    };

    const result = evaluateCompatibility(baseBooking, candidate);
    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('Cannot share with own booking');
  });

  test('Pickup beyond proximity threshold (e.g., 10 km) is rejected', () => {
    const candidate = {
      vehicle_category: 'cab',
      userId: 'user-bbb',
      pickup_lat: 18.6204, // ~11 km away
      pickup_lng: 73.8567,
      destination_lat: 18.5504,
      destination_lng: 73.8967,
    };

    const result = evaluateCompatibility(baseBooking, candidate);
    expect(result.isCompatible).toBe(false);
    expect(result.reason).toContain('Pickup too far');
  });
});
