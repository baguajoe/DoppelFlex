// src/front/js/pages/HomePage.js
// Restyled: Dark theme landing page with hero, feature cards, quick-start CTAs

import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const FEATURES = [
  { icon: '📸', title: 'Selfie to Avatar', desc: 'Upload a photo and generate a 3D avatar with face mesh and depth estimation.', link: '/upload' },
  { icon: '🎨', title: 'Customize', desc: 'Adjust skin tone, outfit colors, accessories, and body proportions.', link: '/customize' },
  { icon: '🦴', title: 'Auto-Rig', desc: 'One-click rigging with Unity, Unreal, or Maya bone presets.', link: '/rig' },
  { icon: '🎥', title: 'Live Motion Capture', desc: 'Real-time webcam mocap powered by MediaPipe — no hardware needed.', link: '/motion' },
  { icon: '💃', title: 'Dance Sync', desc: 'Upload a song, detect beats, and sync avatar dance moves to the rhythm.', link: '/dance-sync' },
  { icon: '👕', title: 'Clothing Match', desc: 'AI-powered style detection matches 3D outfits to your look.', link: '/clothing-match' },
  { icon: '📹', title: 'Video MoCap', desc: 'Extract pose data from any video file — no live camera required.', link: '/motion-from-video' },
  { icon: '📦', title: 'Export', desc: 'Download rigged avatars as FBX, GLB, or OBJ for any game engine.', link: '/export-avatar' },
];

const HomePage = () => {
  const isLoggedIn = !!localStorage.getItem('token');

  return (
    <div className="df-page">
      {/* Hero */}
      <div style={{
        textAlign: 'center',
        padding: '48px 20px 40px',
        background: 'linear-gradient(135deg, #0d0d14 0%, #1a1a2e 50%, #16213e 100%)',
        borderRadius: '16px',
        border: '1px solid #2a2a3e',
        marginBottom: '24px',
      }}>
        <h1 style={{
          fontSize: '2.4rem',
          fontWeight: 800,
          background: 'linear-gradient(135deg, #a78bfa, #6366f1, #818cf8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '12px',
        }}>
          DoppelFlex
        </h1>
        <p style={{ color: '#aaa', fontSize: '16px', maxWidth: '540px', margin: '0 auto 24px' }}>
          Browser-based motion capture for creators. Turn a selfie into a rigged 3D avatar,
          capture movement from your webcam, and sync dance moves to any beat.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/upload" className="df-btn df-btn--primary" style={{ textDecoration: 'none', padding: '12px 28px', fontSize: '15px' }}>
            🚀 Get Started
          </Link>
          <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none', padding: '12px 28px', fontSize: '15px' }}>
            🎥 Try Motion Capture
          </Link>
          {!isLoggedIn && (
            <Link to="/login" className="df-btn df-btn--ghost" style={{ textDecoration: 'none', padding: '12px 28px', fontSize: '15px' }}>
              🔑 Login
            </Link>
          )}
        </div>
      </div>

      {/* Features Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        {FEATURES.map((f, i) => (
          <Link
            key={i}
            to={f.link}
            style={{ textDecoration: 'none' }}
          >
            <div className="df-card" style={{
              height: '100%',
              cursor: 'pointer',
              transition: 'border-color 0.2s, transform 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#a78bfa'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a3e'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div className="df-card__body" style={{ padding: '20px' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{f.icon}</div>
                <h3 style={{ color: '#e0e0e0', fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>{f.title}</h3>
                <p style={{ color: '#888', fontSize: '12px', lineHeight: 1.5, margin: 0 }}>{f.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Stats / Info */}
      <div className="df-card">
        <div className="df-card__body" style={{ textAlign: 'center', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '40px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#a78bfa' }}>30 FPS</div>
              <div style={{ fontSize: '12px', color: '#777' }}>Real-time capture</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#6366f1' }}>33</div>
              <div style={{ fontSize: '12px', color: '#777' }}>Body landmarks</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#818cf8' }}>3</div>
              <div style={{ fontSize: '12px', color: '#777' }}>Export formats</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#a78bfa' }}>$0</div>
              <div style={{ fontSize: '12px', color: '#777' }}>Free to start</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;