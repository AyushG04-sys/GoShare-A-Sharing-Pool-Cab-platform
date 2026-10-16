import React, { useState, useEffect } from 'react';
import { Sparkles, Shield, Zap, ArrowRight, Car } from 'lucide-react';

export default function IntroAnimation({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Progress counter animation from 0 to 100% over 2.4s
    const startTime = Date.now();
    const duration = 2400;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(timer);
        // Start smooth fade out
        setIsFadingOut(true);
        setTimeout(() => {
          onComplete();
        }, 500);
      }
    }, 25);

    return () => clearInterval(timer);
  }, [onComplete]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  const letters = ['G', 'o', 'S', 'h', 'a', 'r', 'e'];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#0b1120',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        opacity: isFadingOut ? 0 : 1,
        transform: isFadingOut ? 'scale(1.04)' : 'scale(1)',
        transition: 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Background radial gradient halos */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.22) 0%, rgba(37, 99, 235, 0.12) 45%, transparent 70%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
          animation: 'pulseGlow 3s infinite ease-in-out',
        }}
      />

      {/* Top Skip Button */}
      <button
        onClick={handleSkip}
        className="btn btn-ghost btn-sm"
        style={{
          position: 'absolute',
          top: 24,
          right: 28,
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        Skip Intro <ArrowRight size={14} />
      </button>

      {/* Main Animated Branding Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          zIndex: 2,
          maxWidth: 520,
        }}
      >
        {/* Animated Brand Badge */}
        <div
          style={{
            width: 72,
            height: 72,
            background: 'linear-gradient(135deg, #0b1120, #1e293b)',
            border: '2px solid var(--accent)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.75rem',
            boxShadow: '0 0 35px var(--accent-glow), inset 0 0 15px rgba(16, 185, 129, 0.2)',
            animation: 'badgeFloat 2.5s ease-in-out infinite alternate',
          }}
        >
          <span
            style={{
              fontSize: '2.5rem',
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '-0.03em',
            }}
          >
            G
          </span>
        </div>

        {/* Staggered Animated Title Letters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'clamp(2.5rem, 6vw, 3.8rem)',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            marginBottom: '0.75rem',
          }}
        >
          {letters.map((char, index) => (
            <span
              key={index}
              style={{
                display: 'inline-block',
                color: index >= 2 ? '#10b981' : '#f8fafc',
                animation: `letterDrop 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.08}s both`,
                textShadow: index >= 2 ? '0 0 25px rgba(16, 185, 129, 0.5)' : 'none',
              }}
            >
              {char}
            </span>
          ))}
          <span
            style={{
              color: 'var(--accent)',
              animation: 'letterDrop 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both',
            }}
          >
            .
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            fontWeight: 500,
            marginBottom: '2rem',
            letterSpacing: '0.02em',
            animation: 'fadeInUp 0.8s ease 0.4s both',
          }}
        >
          Smart Urban Pooling & Proximity Matching Platform
        </p>

        {/* Feature Pills */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '0.6rem',
            marginBottom: '2.5rem',
            animation: 'fadeInUp 0.8s ease 0.6s both',
          }}
        >
          <div
            className="badge badge-success"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
          >
            <Zap size={13} /> Up to 35% Fare Split
          </div>
          <div
            className="badge badge-primary"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
          >
            <Shield size={13} /> 4-Digit OTP Security
          </div>
          <div
            className="badge badge-success"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}
          >
            <Car size={13} /> Live Geodesic Routing
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div
          style={{
            width: 220,
            height: 5,
            background: 'var(--surface-card)',
            borderRadius: 99,
            overflow: 'hidden',
            position: 'relative',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #2563eb, #10b981)',
              borderRadius: 99,
              boxShadow: '0 0 10px var(--accent-glow)',
              transition: 'width 0.05s linear',
            }}
          />
        </div>

        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginTop: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
          }}
        >
          INITIALIZING PLATFORM... {progress}%
        </div>
      </div>

      {/* Embedded Animation Keyframes */}
      <style>{`
        @keyframes letterDrop {
          0% {
            opacity: 0;
            transform: translateY(-24px) scale(0.7);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes fadeInUp {
          0% {
            opacity: 0;
            transform: translateY(16px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes badgeFloat {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-8px);
          }
        }
      `}</style>
    </div>
  );
}
