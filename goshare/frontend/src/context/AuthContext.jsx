import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    try {
      return (
        sessionStorage.getItem('goshare_token') ||
        localStorage.getItem('goshare_token') ||
        null
      );
    } catch {
      return null;
    }
  });

  const [profile, setProfile] = useState(() => {
    try {
      const stored =
        sessionStorage.getItem('goshare_profile') ||
        localStorage.getItem('goshare_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const res = await api.getProfile();
          if (res.data?.profile) {
            setProfile(res.data.profile);
            try {
              sessionStorage.setItem('goshare_profile', JSON.stringify(res.data.profile));
              localStorage.setItem('goshare_profile', JSON.stringify(res.data.profile));
            } catch {}
          }
        } catch (err) {
          console.warn('Failed to refresh user profile:', err);
          // If token invalid, clean up
          if (err.status === 401) {
            logout();
          }
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = (newToken, newProfile) => {
    setToken(newToken);
    setProfile(newProfile);
    try {
      sessionStorage.setItem('goshare_token', newToken);
      sessionStorage.setItem('goshare_profile', JSON.stringify(newProfile));
      localStorage.setItem('goshare_token', newToken);
      localStorage.setItem('goshare_profile', JSON.stringify(newProfile));
    } catch {}
  };

  const demoLogin = async (role) => {
    setLoading(true);
    try {
      const res = await api.demoLogin(role);
      const { token: demoToken, profile: demoProfile } = res.data;
      login(demoToken, demoProfile);
      return demoProfile;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setProfile(null);
    try {
      sessionStorage.removeItem('goshare_token');
      sessionStorage.removeItem('goshare_profile');
      localStorage.removeItem('goshare_token');
      localStorage.removeItem('goshare_profile');
    } catch {}
  };

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const res = await api.getProfile();
      if (res.data?.profile) {
        setProfile(res.data.profile);
        localStorage.setItem('goshare_profile', JSON.stringify(res.data.profile));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const value = {
    token,
    profile,
    role: profile?.role || null,
    isAuthenticated: !!token,
    loading,
    login,
    demoLogin,
    logout,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
