// src/front/js/pages/ErrorPage.js
// Restyled: Dark theme 404 with animation hint and quick navigation

import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const ErrorPage = () => (
  <div className="df-page" style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    textAlign: 'center',
  }}>
    <div style={{ fontSize: '72px', marginBottom: '8px' }}>🤖</div>
    <h1 style={{
      fontSize: '3rem',
      fontWeight: 900,
      background: 'linear-gradient(135deg, #a78bfa, #6366f1)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      marginBottom: '8px',
    }}>
      404
    </h1>
    <p style={{ color: '#aaa', fontSize: '16px', marginBottom: '4px' }}>
      This page doesn't exist — your avatar wandered off.
    </p>
    <p style={{ color: '#666', fontSize: '13px', marginBottom: '28px' }}>
      The URL might be wrong, or this feature hasn't been built yet.
    </p>

    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link to="/" className="df-btn df-btn--primary" style={{ textDecoration: 'none' }}>
        🏠 Home
      </Link>
      <Link to="/upload" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
        📸 Upload
      </Link>
      <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
        🎥 Motion Capture
      </Link>
      <Link to="/profile" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
        👤 Profile
      </Link>
    </div>
  </div>
);

export default ErrorPage;