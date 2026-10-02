export const Geo = {
    searchPlaces: async (query) => {
        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error("Search Error:", error);
            return [];
        }
    },

    geocodeReverse: async (lat, lng) => {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error("Reverse Geocode Error:", error);
            return null;
        }
    },

    // UPGRADED: Now accepts an array of unlimited {lat, lng} waypoints
    getOptimizedRoute: async (waypoints) => {
        try {
            const coordsStr = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
            const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.routes && data.routes.length > 0) {
                return data.routes[0].geometry;
            }
            return null;
        } catch (error) {
            console.error("Routing Error:", error);
            return null;
        }
    }
};