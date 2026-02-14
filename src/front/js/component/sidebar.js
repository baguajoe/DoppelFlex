// src/front/js/component/sidebar.js
// Restyled: Dark theme, categorized sections, active link highlighting

import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const SECTIONS = [
  {
    label: 'Avatar',
    items: [
      { to: '/upload', icon: '📸', label: 'Upload' },
      { to: '/customize', icon: '🎨', label: 'Customize' },
      { to: '/avatar-view', icon: '🧍', label: 'View Avatar' },
      { to: '/rig', icon: '🦴', label: 'Rig' },
      { to: '/export-avatar', icon: '📦', label: 'Export' },
    ],
  },
  {
    label: 'Motion Capture',
    items: [
      { to: '/motion', icon: '🎥', label: 'Body Capture' },
      { to: '/face-capture', icon: '🎭', label: 'Face Capture' },
      { to: '/full-capture', icon: '🧑', label: 'Full Body + Face' },
      { to: '/motion-from-video', icon: '📹', label: 'From Video' },
      { to: '/motion-sessions', icon: '🎞️', label: 'Sessions' },
    ],
  },
  {
    label: 'Music & Dance',
    items: [
      { to: '/dance-sync', icon: '💃', label: 'Dance Sync' },
      { to: '/beat-editor', icon: '🎵', label: 'Beat Editor' },
      { to: '/beatmap-editor', icon: '🗺️', label: 'BeatMap Editor' },
    ],
  },
  {
    label: 'Wardrobe',
    items: [
      { to: '/clothing-match', icon: '🧠', label: 'Style Match' },
      { to: '/my-outfits', icon: '👕', label: 'My Outfits' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/profile', icon: '👤', label: 'Profile' },
      { to: '/account-settings', icon: '⚙️', label: 'Settings' },
      { to: '/stripe-pricing', icon: '💳', label: 'Plans' },
    ],
  },
];

const Sidebar = () => {
  const location = useLocation();

  return (
    <div
      className="df-sidebar"
      style={{
        width: '220px',
        minHeight: 'calc(100vh - 56px)',
        background: '#0a0a12',
        borderRight: '1px solid #1a1a2e',
        padding: '12px 0',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {/* Home link */}
      <Link
        to="/"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          margin: '0 8px 8px',
          borderRadius: '8px',
          textDecoration: 'none',
          fontSize: '13px',
          fontWeight: 700,
          color: location.pathname === '/' ? '#e0e0e0' : '#888',
          background: location.pathname === '/' ? '#1a1a2e' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <span>🏠</span> Home
      </Link>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <div key={section.label} style={{ marginBottom: '6px' }}>
          {/* Section Label */}
          <div style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#555',
            padding: '10px 16px 4px',
          }}>
            {section.label}
          </div>

          {/* Links */}
          {section.items.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 16px',
                  margin: '1px 8px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  color: isActive ? '#e0e0e0' : '#888',
                  background: isActive ? '#1a1a2e' : 'transparent',
                  borderLeft: isActive ? '2px solid #a78bfa' : '2px solid transparent',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#111118';
                    e.currentTarget.style.color = '#bbb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#888';
                  }
                }}
              >
                <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      {/* Responsive: hide sidebar on small screens */}
      <style>{`
        @media (max-width: 768px) {
          .df-sidebar { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default Sidebar;