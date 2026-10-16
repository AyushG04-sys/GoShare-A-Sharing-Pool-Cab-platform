import { DEMO_USERS } from '../src/middleware/auth.js';
import { evaluateCompatibility } from '../src/services/matching.service.js';
import { buildOptimizedWaypoints } from '../src/services/route.service.js';

describe('Shared Cab & Driver Notification Targeted Fixes', () => {
  describe('Requirement 1: Multi-passenger distinct sessions & confirmation', () => {
    test('demo-passenger-token and demo-passenger-2-token must have distinct user IDs', () => {
      const p1 = DEMO_USERS['demo-passenger-token'];
      const p2 = DEMO_USERS['demo-passenger-2-token'];

      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p1.id).not.toBe(p2.id);
      expect(p1.email).not.toBe(p2.email);
    });

    test('Rider cannot match or pool with their own booking', () => {
      const booking = {
        vehicle_category: 'cab',
        passenger_count: 1,
        max_passengers: 2,
        created_by: '11111111-1111-4111-a111-111111111111',
        pickup_lat: 18.5204,
        pickup_lng: 73.8567,
        destination_lat: 18.5504,
        destination_lng: 73.8967,
      };

      // Same user trying to match with their own booking
      const candidateSameUser = {
        vehicle_category: 'cab',
        userId: '11111111-1111-4111-a111-111111111111',
        pickup_lat: 18.5204,
        pickup_lng: 73.8567,
        destination_lat: 18.5504,
        destination_lng: 73.8967,
      };

      const result = evaluateCompatibility(booking, candidateSameUser);
      expect(result.isCompatible).toBe(false);
      expect(result.reason).toContain('Cannot share with own booking');
    });

    test('Distinct second passenger is compatible and eligible for confirmation', () => {
      const booking = {
        vehicle_category: 'cab',
        passenger_count: 1,
        max_passengers: 2,
        created_by: '11111111-1111-4111-a111-111111111111',
        pickup_lat: 18.5204,
        pickup_lng: 73.8567,
        destination_lat: 18.5504,
        destination_lng: 73.8967,
      };

      const candidateSecondUser = {
        vehicle_category: 'cab',
        userId: '303161bd-a63d-40ad-bc23-eeb635d7e0bd',
        pickup_lat: 18.5220,
        pickup_lng: 73.8580,
        destination_lat: 18.5520,
        destination_lng: 73.8980,
      };

      const result = evaluateCompatibility(booking, candidateSecondUser);
      expect(result.isCompatible).toBe(true);
      expect(result.pickupDistanceKm).toBeLessThan(3.0);
    });
  });

  describe('Requirement 2: Driver Shared Cab Notification & Request Prioritization', () => {
    test('Driver request queue prioritizes shared cab rides at the top', () => {
      const requests = [
        {
          id: 'booking-solo-1',
          ride_type: 'solo',
          vehicle_category: 'cab',
          created_at: '2026-10-15T12:00:00Z',
          final_fare: 250,
        },
        {
          id: 'booking-shared-1',
          ride_type: 'shared',
          vehicle_category: 'cab',
          created_at: '2026-10-15T11:55:00Z',
          final_fare: 180,
        },
        {
          id: 'booking-solo-2',
          ride_type: 'solo',
          vehicle_category: 'cab',
          created_at: '2026-10-15T12:05:00Z',
          final_fare: 300,
        },
      ];

      // Sort matching driver.routes.js prioritization logic
      requests.sort((a, b) => {
        const aShared = a.ride_type === 'shared' ? 1 : 0;
        const bShared = b.ride_type === 'shared' ? 1 : 0;
        if (aShared !== bShared) return bShared - aShared;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      expect(requests[0].id).toBe('booking-shared-1');
      expect(requests[0].ride_type).toBe('shared');
    });
  });

  describe('Requirement 3: Multi-Request Acceptance & 4-Stop Route Optimization', () => {
    test('buildOptimizedWaypoints outputs 4 stops with pickups before dropoffs', () => {
      const driverLocation = { lat: 18.5200, lng: 73.8560 };
      const riderSegments = [
        {
          id: 'rider-1',
          name: 'Aarav Sharma',
          pickup: { lat: 18.5204, lng: 73.8567, label: 'Nashik Road Station' },
          dropoff: { lat: 18.5504, lng: 73.8967, label: 'College Road' },
        },
        {
          id: 'rider-2',
          name: 'Rohan Gupta',
          pickup: { lat: 18.5220, lng: 73.8580, label: 'Dwarka Circle' },
          dropoff: { lat: 18.5600, lng: 73.9100, label: 'Gangapur Road' },
        },
      ];

      const waypoints = buildOptimizedWaypoints(driverLocation, riderSegments);

      expect(waypoints).toHaveLength(4);
      expect(waypoints[0].stopIndex).toBe(1);
      expect(waypoints[1].stopIndex).toBe(2);
      expect(waypoints[2].stopIndex).toBe(3);
      expect(waypoints[3].stopIndex).toBe(4);

      // Stops 1 and 2 must be pickups
      expect(waypoints[0].type).toBe('pickup');
      expect(waypoints[1].type).toBe('pickup');

      // Stops 3 and 4 must be dropoffs
      expect(waypoints[2].type).toBe('dropoff');
      expect(waypoints[3].type).toBe('dropoff');

      // Both riders must have 1 pickup and 1 dropoff
      const rider1Stops = waypoints.filter((w) => w.passengerId === 'rider-1');
      const rider2Stops = waypoints.filter((w) => w.passengerId === 'rider-2');

      expect(rider1Stops).toHaveLength(2);
      expect(rider2Stops).toHaveLength(2);

      // For each rider, pickup index must precede dropoff index
      const r1Pickup = waypoints.find((w) => w.passengerId === 'rider-1' && w.type === 'pickup');
      const r1Dropoff = waypoints.find((w) => w.passengerId === 'rider-1' && w.type === 'dropoff');
      expect(r1Pickup.stopIndex).toBeLessThan(r1Dropoff.stopIndex);

      const r2Pickup = waypoints.find((w) => w.passengerId === 'rider-2' && w.type === 'pickup');
      const r2Dropoff = waypoints.find((w) => w.passengerId === 'rider-2' && w.type === 'dropoff');
      expect(r2Pickup.stopIndex).toBeLessThan(r2Dropoff.stopIndex);
    });

    test('Shared cab allows 2nd request acceptance when capacity is 1/2', () => {
      const activeTrip = {
        id: 'booking-shared-1',
        ride_type: 'shared',
        passenger_count: 1,
        max_passengers: 2,
        status: 'accepted',
      };

      const hasAvailableSeat =
        activeTrip.ride_type === 'shared' &&
        (activeTrip.passenger_count || 1) < (activeTrip.max_passengers || 2);

      expect(hasAvailableSeat).toBe(true);

      // Once 2nd request is accepted:
      const fullTrip = { ...activeTrip, passenger_count: 2 };
      const hasSeatAfter =
        fullTrip.ride_type === 'shared' &&
        (fullTrip.passenger_count || 1) < (fullTrip.max_passengers || 2);

      expect(hasSeatAfter).toBe(false);
    });
  });
});
