import {
  calculateHaversineDistance,
  calculateBearing,
  estimateDurationMinutes,
  AVG_SPEED_KMH,
} from '../src/utils/geo.js';

describe('Geographic Utilities', () => {
  test('Haversine distance between Pune Station and Swargate is approx 4-5 km', () => {
    // Pune Station: 18.5289, 73.8744
    // Swargate: 18.5018, 73.8586
    const dist = calculateHaversineDistance(18.5289, 73.8744, 18.5018, 73.8586);
    expect(dist).toBeGreaterThan(3.0);
    expect(dist).toBeLessThan(5.0);
  });

  test('Distance between identical coordinates is 0', () => {
    const dist = calculateHaversineDistance(18.5204, 73.8567, 18.5204, 73.8567);
    expect(dist).toBe(0);
  });

  test('Bearing calculation returns valid angle between 0 and 360', () => {
    const bearing = calculateBearing(18.5204, 73.8567, 18.5304, 73.8667);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThanOrEqual(360);
  });

  test('Duration estimate calculates correct travel minutes at 25 km/h', () => {
    // 25 km at 25 km/h = 1 hour = 60 minutes
    const mins = estimateDurationMinutes(25, 25);
    expect(mins).toBe(60);

    // 5 km at 25 km/h = 0.2 hours = 12 minutes
    const shortMins = estimateDurationMinutes(5, 25);
    expect(shortMins).toBe(12);
  });
});
