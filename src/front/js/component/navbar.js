// src/front/js/component/navbar.js
// Restyled: Dark theme, DoppelFlex branding, streamlined nav, auth-aware login/logout

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('token'));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    setIsLoggedIn(false);
    navigate('/login');
  };

  const navLinks = [
    { to: '/upload', label: '📸 Upload' },
    { to: '/motion', label: '🎥 Capture' },
    { to: '/dance-sync', label: '💃 Dance' },
    { to: '/stripe-pricing', label: '💳 Plans' },
  ];

  return (
    <nav style={{
      background: '#0a0a12',
      borderBottom: '1px solid #1a1a2e',
      padding: '0 20px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '56px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        {/* Brand */}
        <Link to="/" style={{
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontSize: '20px' }}>🤖</span>
          <span style={{
            fontSize: '18px',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #a78bfa, #6366f1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            DoppelFlex
          </span>
        </Link>

        {/* Desktop Nav */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
          className="df-nav-desktop"
        >
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              style={{
                color: '#aaa',
                textDecoration: 'none',
                fontSize: '13px',
                padding: '6px 12px',
                borderRadius: '6px',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => { e.target.style.background = '#1a1a2e'; e.target.style.color = '#e0e0e0'; }}
              onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#aaa'; }}
            >
              {link.label}
            </Link>
          ))}

          <div style={{ width: '1px', height: '24px', background: '#2a2a3e', margin: '0 8px' }} />

          {isLoggedIn ? (
            <>
              <Link
                to="/profile"
                style={{
                  color: '#aaa',
                  textDecoration: 'none',
                  fontSize: '13px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => { e.target.style.background = '#1a1a2e'; e.target.style.color = '#e0e0e0'; }}
                onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#aaa'; }}
              >
                👤 Profile
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a3e',
                  color: '#aaa',
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => { e.target.style.borderColor = '#ef4444'; e.target.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.target.style.borderColor = '#2a2a3e'; e.target.style.color = '#aaa'; }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                style={{
                  color: '#aaa',
                  textDecoration: 'none',
                  fontSize: '13px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                }}
                onMouseEnter={(e) => { e.target.style.background = '#1a1a2e'; e.target.style.color = '#e0e0e0'; }}
                onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#aaa'; }}
              >
                Login
              </Link>
              <Link
                to="/signup"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '6px 16px',
                  borderRadius: '6px',
                }}
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="df-nav-mobile-toggle"
          style={{
            display: 'none',
            background: 'transparent',
            border: '1px solid #2a2a3e',
            color: '#aaa',
            fontSize: '18px',
            padding: '4px 10px',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <div
          className="df-nav-mobile-menu"
          style={{
            borderTop: '1px solid #1a1a2e',
            padding: '12px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              style={{
                color: '#aaa',
                textDecoration: 'none',
                fontSize: '14px',
                padding: '10px 16px',
                borderRadius: '6px',
              }}
            >
              {link.label}
            </Link>
          ))}
          {isLoggedIn ? (
            <>
              <Link to="/profile" onClick={() => setMobileOpen(false)}
                style={{ color: '#aaa', textDecoration: 'none', padding: '10px 16px', fontSize: '14px' }}>
                👤 Profile
              </Link>
              <button onClick={() => { handleLogout(); setMobileOpen(false); }}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', textAlign: 'left', padding: '10px 16px', fontSize: '14px', cursor: 'pointer' }}>
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMobileOpen(false)}
                style={{ color: '#aaa', textDecoration: 'none', padding: '10px 16px', fontSize: '14px' }}>
                Login
              </Link>
              <Link to="/signup" onClick={() => setMobileOpen(false)}
                style={{ color: '#a78bfa', textDecoration: 'none', padding: '10px 16px', fontSize: '14px', fontWeight: 700 }}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}

      {/* Responsive CSS injected inline */}
      <style>{`
        @media (max-width: 768px) {
          .df-nav-desktop { display: none !important; }
          .df-nav-mobile-toggle { display: block !important; }
        }
        @media (min-width: 769px) {
          .df-nav-mobile-menu { display: none !important; }
        }
      `}</style>
    </nav>
  );
};

export default Navbar;