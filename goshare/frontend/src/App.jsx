import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/common/Navbar.jsx';
import IntroAnimation from './components/common/IntroAnimation.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import PassengerDashboard from './pages/passenger/PassengerDashboard.jsx';
import RideHistoryPage from './pages/passenger/RideHistoryPage.jsx';
import DriverDashboard from './pages/driver/DriverDashboard.jsx';
import DriverEarningsPage from './pages/driver/DriverEarningsPage.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

export default function App() {
  const { isAuthenticated, role, logout } = useAuth();

  // 1. Show animated intro before the Sign Up page appears
  const [showIntro, setShowIntro] = useState(true);

  // 2. Default to 'register' (Sign Up page) for a fresh session after animation
  const [currentPage, setCurrentPage] = useState('register');

  const getEffectiveRole = () => {
    if (role) return role;
    try {
      const stored =
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('goshare_profile')) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('goshare_profile'));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.role) return parsed.role;
      }
    } catch {}
    return null;
  };

  // Keep page synced when user logs in or role changes
  useEffect(() => {
    const effectiveRole = getEffectiveRole();
    if (isAuthenticated) {
      if (effectiveRole === 'driver') setCurrentPage((prev) => (prev === 'login' || prev === 'register' ? 'driver' : prev));
      else if (effectiveRole === 'admin') setCurrentPage((prev) => (prev === 'login' || prev === 'register' ? 'admin' : prev));
      else setCurrentPage((prev) => (prev === 'login' || prev === 'register' ? 'passenger' : prev));
    } else {
      setCurrentPage((prev) => (prev === 'login' ? 'login' : 'register'));
    }
  }, [isAuthenticated, role]);

  const handleIntroComplete = () => {
    setShowIntro(false);
    // Guarantee that after the intro animation finishes, the Sign Up page appears
    // and no previous/stale user is auto-displayed
    if (isAuthenticated) {
      logout();
    }
    setCurrentPage('register');
  };

  const handleNavigate = (page) => {
    const effectiveAuthed =
      isAuthenticated ||
      !!(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('goshare_token')) ||
      !!(typeof localStorage !== 'undefined' && localStorage.getItem('goshare_token'));

    // Admin panel is strictly forbidden for regular users and drivers
    if (page === 'admin' && (!effectiveAuthed || effectiveRole !== 'admin')) {
      return;
    }
    // Prevent rider from navigating to driver console or earnings
    if ((page === 'driver' || page === 'earnings') && effectiveRole !== 'driver' && effectiveRole !== 'admin') {
      return;
    }
    // Prevent driver from navigating to passenger ride booking
    if (page === 'passenger' && effectiveRole === 'driver') {
      return;
    }
    setCurrentPage(page);
  };

  // If intro animation is playing, present it full-screen before the login page appears
  if (showIntro) {
    return <IntroAnimation onComplete={handleIntroComplete} />;
  }

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Navbar onNavigate={handleNavigate} currentPage={currentPage} />

      <main style={{ flex: 1, height: 'calc(100vh - 60px)', width: '100%', overflow: 'hidden', position: 'relative' }}>
        {currentPage === 'passenger' && <PassengerDashboard onNavigate={handleNavigate} />}
        {currentPage === 'history' && <RideHistoryPage onNavigate={handleNavigate} />}
        {currentPage === 'driver' && <DriverDashboard onNavigate={handleNavigate} />}
        {currentPage === 'earnings' && <DriverEarningsPage onNavigate={handleNavigate} />}
        {currentPage === 'admin' && <AdminDashboard onNavigate={handleNavigate} />}
        {currentPage === 'login' && <LoginPage onNavigate={handleNavigate} />}
        {currentPage === 'register' && <RegisterPage onNavigate={handleNavigate} />}
      </main>
    </div>
  );
}
