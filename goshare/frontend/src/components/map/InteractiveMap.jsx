import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { DEFAULT_CENTER } from '../../services/map.service.js';
import { Navigation, Crosshair } from 'lucide-react';

export default function InteractiveMap({
  userLocation,
  pickup,
  destination,
  driverLocation,
  coPassengerLocation,
  waypoints = [],
  routePolyline = [],
  onMapClick,
  onRequestLocation,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({
    userGPS: null,
    pickup: null,
    destination: null,
    driver: null,
    coPassenger: null,
    waypointMarkers: [],
    polyline: null,
  });

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = userLocation?.lat || pickup?.lat || DEFAULT_CENTER.lat;
      const initialLng = userLocation?.lng || pickup?.lng || DEFAULT_CENTER.lng;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: false,
      });

      // Add zoom control at top right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // OpenStreetMap Tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      map.on('click', (e) => {
        if (onMapClick) {
          onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      });

      mapInstanceRef.current = map;
    }

    // Auto-invalidate map size on viewport or container resize (crucial for mobile orientation changes)
    let resizeObserver = null;
    if (window.ResizeObserver && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Center map on userLocation if updated and no destination selected yet
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !userLocation?.lat || !userLocation?.lng) return;

    if (!destination?.lat) {
      map.flyTo([userLocation.lat, userLocation.lng], 14, {
        animate: true,
        duration: 1.2,
      });
    }
  }, [userLocation?.lat, userLocation?.lng]);

  // Sync Markers and Polylines
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const boundsPoints = [];

    // 1. Live GPS Location Marker (Pulsing blue accuracy disc)
    if (userLocation?.lat && userLocation?.lng) {
      const gpsIcon = L.divIcon({
        className: 'user-gps-marker',
        html: `
          <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background: rgba(59, 130, 246, 0.35); animation: mapPulse 2s infinite ease-out;"></div>
            <div style="width: 12px; height: 12px; background: #2563eb; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 0 6px rgba(37, 99, 235, 0.8);"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      if (markersRef.current.userGPS) {
        markersRef.current.userGPS.setLatLng([userLocation.lat, userLocation.lng]);
      } else {
        markersRef.current.userGPS = L.marker([userLocation.lat, userLocation.lng], { icon: gpsIcon })
          .addTo(map)
          .bindPopup(`<b>Your GPS Location</b><br/>${userLocation.city || ''}`);
      }
    } else if (markersRef.current.userGPS) {
      markersRef.current.userGPS.remove();
      markersRef.current.userGPS = null;
    }

    // 2. Pickup Marker (Emerald dot with pulsing halo)
    if (pickup?.lat && pickup?.lng) {
      boundsPoints.push([pickup.lat, pickup.lng]);
      const pickupIcon = L.divIcon({
        className: 'user-pickup-marker',
        html: `
          <div style="width: 22px; height: 22px; background: #10b981; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.4), 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 900;">
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      if (markersRef.current.pickup) {
        markersRef.current.pickup.setLatLng([pickup.lat, pickup.lng]);
      } else {
        markersRef.current.pickup = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon })
          .addTo(map)
          .bindPopup(`<b>Pickup:</b> ${pickup.label || 'Origin'}`);
      }
    } else if (markersRef.current.pickup) {
      markersRef.current.pickup.remove();
      markersRef.current.pickup = null;
    }

    // 3. Destination Marker (Red pin)
    if (destination?.lat && destination?.lng) {
      boundsPoints.push([destination.lat, destination.lng]);
      const destIcon = L.divIcon({
        className: 'user-dest-marker',
        html: `
          <div style="width: 22px; height: 22px; background: #ef4444; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.4), 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 900;">
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      if (markersRef.current.destination) {
        markersRef.current.destination.setLatLng([destination.lat, destination.lng]);
      } else {
        markersRef.current.destination = L.marker([destination.lat, destination.lng], {
          icon: destIcon,
        })
          .addTo(map)
          .bindPopup(`<b>Destination:</b> ${destination.label || 'Dropoff'}`);
      }
    } else if (markersRef.current.destination) {
      markersRef.current.destination.remove();
      markersRef.current.destination = null;
    }

    // 4. Driver Location Marker (Vehicle circular icon)
    if (driverLocation?.lat && driverLocation?.lng) {
      boundsPoints.push([driverLocation.lat, driverLocation.lng]);
      const driverIcon = L.divIcon({
        className: 'driver-car-marker',
        html: `
          <div style="width: 38px; height: 38px; background: #2563eb; border: 3px solid white; border-radius: 50%; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.6); display: flex; align-items: center; justify-content: center; font-size: 20px;">
            🚖
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      if (markersRef.current.driver) {
        markersRef.current.driver.setLatLng([driverLocation.lat, driverLocation.lng]);
      } else {
        markersRef.current.driver = L.marker([driverLocation.lat, driverLocation.lng], {
          icon: driverIcon,
        })
          .addTo(map)
          .bindPopup('<b>Driver</b> (Live)');
      }
    } else if (markersRef.current.driver) {
      markersRef.current.driver.remove();
      markersRef.current.driver = null;
    }

    // 5. Co-Passenger Blip
    if (coPassengerLocation?.lat && coPassengerLocation?.lng) {
      boundsPoints.push([coPassengerLocation.lat, coPassengerLocation.lng]);
      const coIcon = L.divIcon({
        className: 'co-passenger-blip',
        html: `
          <div style="width: 28px; height: 28px; background: #8b5cf6; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(139, 92, 246, 0.8); display: flex; align-items: center; justify-content: center; font-size: 14px;">
            👥
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (markersRef.current.coPassenger) {
        markersRef.current.coPassenger.setLatLng([
          coPassengerLocation.lat,
          coPassengerLocation.lng,
        ]);
      } else {
        markersRef.current.coPassenger = L.marker(
          [coPassengerLocation.lat, coPassengerLocation.lng],
          { icon: coIcon }
        )
          .addTo(map)
          .bindPopup(`<b>Co-Passenger:</b> ${coPassengerLocation.label || 'Pool Rider'}`);
      }
    } else if (markersRef.current.coPassenger) {
      markersRef.current.coPassenger.remove();
      markersRef.current.coPassenger = null;
    }

    // 5b. Multi-stop Waypoints (for shared pool rides)
    if (markersRef.current.waypointMarkers) {
      markersRef.current.waypointMarkers.forEach((m) => m.remove());
      markersRef.current.waypointMarkers = [];
    } else {
      markersRef.current.waypointMarkers = [];
    }

    if (waypoints && waypoints.length > 0) {
      waypoints.forEach((wp, idx) => {
        if (!wp.lat || !wp.lng) return;
        boundsPoints.push([wp.lat, wp.lng]);
        const stopNum = wp.stop_order || wp.stop_index || idx + 1;
        const isPickup = wp.waypoint_type === 'pickup';
        const color = isPickup ? '#10b981' : '#ef4444';
        const bgRgba = isPickup ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)';

        const wpIcon = L.divIcon({
          className: `wp-stop-marker-${stopNum}`,
          html: `
            <div style="width: 28px; height: 28px; background: ${color}; border: 2.5px solid white; border-radius: 50%; box-shadow: 0 0 0 3px ${bgRgba}, 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: 900;">
              ${stopNum}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const m = L.marker([wp.lat, wp.lng], { icon: wpIcon })
          .addTo(map)
          .bindPopup(`<b>Stop ${stopNum}: ${isPickup ? 'PICKUP' : 'DROPOFF'}</b><br/>${wp.label || ''}`);
        markersRef.current.waypointMarkers.push(m);
      });
    }

    // 6. Polyline Route
    if (routePolyline && routePolyline.length > 1) {
      if (markersRef.current.polyline) {
        markersRef.current.polyline.setLatLngs(routePolyline);
      } else {
        markersRef.current.polyline = L.polyline(routePolyline, {
          color: '#3b82f6',
          weight: 5,
          opacity: 0.9,
          smoothFactor: 1,
        }).addTo(map);
      }
    } else if (markersRef.current.polyline) {
      markersRef.current.polyline.remove();
      markersRef.current.polyline = null;
    }

    // Fit Bounds
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [50, 50], maxZoom: 16 });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 14);
    }
  }, [userLocation, pickup, destination, driverLocation, coPassengerLocation, waypoints, routePolyline]);

  const handleCenterOnUser = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLocation?.lat && userLocation?.lng) {
      map.flyTo([userLocation.lat, userLocation.lng], 15, { animate: true, duration: 1 });
    } else if (onRequestLocation) {
      onRequestLocation();
    }
  };

  return (
    <div className="app-map-pane" style={{ position: 'relative' }}>
      <div ref={mapContainerRef} className="map-element" />

      {/* Floating Re-center to User Location Button (Positioned at top-left so it doesn't overlap Leaflet zoom controls) */}
      <button
        onClick={handleCenterOnUser}
        title="Re-center to my current location"
        className="map-recenter-btn"
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 1000,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-full)',
          padding: '0.45rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: 'var(--accent)',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-md)',
          backdropFilter: 'blur(8px)',
          maxWidth: 'calc(100% - 100px)',
        }}
      >
        <Crosshair size={15} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {userLocation?.city ? `${userLocation.city}` : 'My Location'}
        </span>
      </button>

      {/* Floating Hint Banner */}
      <div className="map-floating-hint">
        📍 Tap anywhere on the map to set location
      </div>

      {/* Floating Legend */}
      <div className="map-floating-legend">
        <div className="legend-row">
          <span className="legend-indicator" style={{ background: '#10b981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)' }}></span>
          <span>Pickup Origin</span>
        </div>
        <div className="legend-row">
          <span className="legend-indicator" style={{ background: '#ef4444', boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)' }}></span>
          <span>Dropoff Destination</span>
        </div>
        <div className="legend-row">
          <span className="legend-indicator" style={{ background: '#2563eb' }}></span>
          <span>Driver Position</span>
        </div>
        <div className="legend-row">
          <span style={{ width: 14, height: 3, background: '#3b82f6', borderRadius: 2 }}></span>
          <span>Route Polyline</span>
        </div>
      </div>

      <style>{`
        @keyframes mapPulse {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
