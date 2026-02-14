// src/front/js/pages/AvatarViewPage.js
// FIX: Reads avatarUrl from localStorage or URL query param instead of expecting a prop
// Added: dark theme, upload GLB option, empty state, orbit controls hint

import React, { useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AvatarViewer from '../component/AvatarViewer';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const AvatarViewPage = () => {
  const [searchParams] = useSearchParams();

  // Try multiple sources for avatarUrl:
  // 1. URL query param: /avatar-view?url=/static/exports/face_mesh_abc.glb
  // 2. localStorage (set by UploadPage or CustomizePage on avatar creation)
  // 3. null → show empty state
  const paramUrl = searchParams.get('url');
  const storedUrl = localStorage.getItem('avatar_url');
  const initialUrl = paramUrl || storedUrl || '';

  const [avatarUrl, setAvatarUrl] = useState(initialUrl);
  const [loadError, setLoadError] = useState(false);
  const fileRef = useRef(null);

  // Handle custom GLB upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
    setLoadError(false);
  };

  // Resolve full URL (handle relative paths from backend)
  const resolvedUrl = avatarUrl.startsWith('http') || avatarUrl.startsWith('blob:')
    ? avatarUrl
    : `${BACKEND}${avatarUrl}`;

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🧍 Avatar Viewer</h2>
        <p className="df-page__subtitle">
          View, inspect, and rotate your 3D avatar model.
        </p>
      </div>

      {/* Controls */}
      <div className="df-card" style={{ marginBottom: '16px' }}>
        <div className="df-card__header">
          <h3 className="df-card__title">Model Source</h3>
        </div>
        <div className="df-card__body">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Upload custom GLB */}
            <button
              className="df-btn df-btn--ghost"
              onClick={() => fileRef.current?.click()}
            >
              📂 Upload GLB
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".glb,.gltf"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            {/* Quick presets */}
            <button
              className="df-btn df-btn--ghost"
              onClick={() => { setAvatarUrl(`${BACKEND}/static/models/xbot_avatar.glb`); setLoadError(false); }}
            >
              🤖 X Bot
            </button>
            <button
              className="df-btn df-btn--ghost"
              onClick={() => { setAvatarUrl(`${BACKEND}/static/models/ybot_avatar.glb`); setLoadError(false); }}
            >
              🧑 Y Bot
            </button>

            {avatarUrl && (
              <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>
                {avatarUrl.length > 60 ? '…' + avatarUrl.slice(-50) : avatarUrl}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3D Viewer */}
      <div className="df-card">
        <div className="df-card__body" style={{ padding: 0, overflow: 'hidden', borderRadius: '12px' }}>
          {!avatarUrl ? (
            /* Empty state */
            <div style={{
              height: '450px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0d0d14',
              color: '#666',
              gap: '12px',
            }}>
              <div style={{ fontSize: '56px' }}>🧍</div>
              <h3 style={{ color: '#aaa', margin: 0 }}>No Avatar Loaded</h3>
              <p style={{ fontSize: '13px', maxWidth: '360px', textAlign: 'center' }}>
                Upload a GLB file, select a preset above, or create one on the{' '}
                <Link to="/upload" style={{ color: '#a78bfa' }}>Upload page</Link>.
              </p>
            </div>
          ) : loadError ? (
            /* Load error */
            <div style={{
              height: '450px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0d0d14',
              color: '#888',
              gap: '8px',
            }}>
              <span style={{ fontSize: '40px' }}>⚠️</span>
              <span>Failed to load model</span>
              <code style={{ fontSize: '11px', color: '#a78bfa' }}>{avatarUrl}</code>
            </div>
          ) : (
            /* 3D Canvas */
            <div style={{ height: '450px', background: '#0d0d14', position: 'relative' }}>
              <AvatarViewer modelUrl={resolvedUrl} />
              <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                background: 'rgba(0,0,0,0.6)',
                color: '#aaa',
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '6px',
                backdropFilter: 'blur(4px)',
              }}>
                🎮 Drag to rotate · Scroll to zoom
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
        <Link to="/upload" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          📸 Upload Selfie
        </Link>
        <Link to="/customize" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          🎨 Customize
        </Link>
        <Link to="/rig" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          🦴 Rig Avatar
        </Link>
        <Link to="/export-avatar" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          📦 Export
        </Link>
        <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          🎥 Motion Capture
        </Link>
      </div>
    </div>
  );
};

export default AvatarViewPage;