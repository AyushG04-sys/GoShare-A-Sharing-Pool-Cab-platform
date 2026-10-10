const API_BASE = 'http://localhost:3000/api';

const getAuthHeaders = () => {
    const token = sessionStorage.getItem('authToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const loginUser = async (userData) => {
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (response.ok && data.token) {
            sessionStorage.setItem('authToken', data.token);
            data.user.loggedIn = true;
            sessionStorage.setItem('rideUser', JSON.stringify(data.user));
            sessionStorage.setItem('currentUser', JSON.stringify(data.user));
            return data.user;
        } else {
            throw new Error(data.error || 'Login failed');
        }
    } catch (err) {
        throw err;
    }
};

export const loadBookings = async () => {
    try {
        const response = await fetch(`${API_BASE}/bookings`, {
            method: 'GET',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to fetch bookings');
        return await response.json();
    } catch (err) {
        console.error("Error loading bookings:", err);
        return [];
    }
};

// 👉 THIS IS WHAT WAS MISSING: The function to create a booking
export const addBooking = async (bookingData) => {
    try {
        const response = await fetch(`${API_BASE}/bookings`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(bookingData)
        });
        if (!response.ok) throw new Error('Failed to add booking');
        return await response.json();
    } catch (err) {
        console.error("Error adding booking:", err);
        throw err;
    }
};

export const updateBooking = async (id, updateData) => {
    try {
        const response = await fetch(`${API_BASE}/bookings/${id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify(updateData)
        });
        if (!response.ok) throw new Error('Failed to update booking');
        return await response.json();
    } catch (err) {
        console.error("Error updating booking:", err);
        return null;
    }
};

export const removeBooking = async (id) => {
    try {
        const response = await fetch(`${API_BASE}/bookings/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error('Failed to delete booking');
        return true;
    } catch (err) {
        console.error("Error removing booking:", err);
    }
};

export const triggerSOS = async (alertData) => {
    try {
        const response = await fetch(`${API_BASE}/sos`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(alertData)
        });
        if (!response.ok) throw new Error('Failed to trigger SOS');
        return await response.json();
    } catch (err) {
        console.error("Error triggering SOS:", err);
    }
};

export const findBookingById = (bookings, id) => {
    return bookings.find(b =>
        b.id === id ||
        b.id === Number(id) ||
        String(b.id) === String(id)
    );
};