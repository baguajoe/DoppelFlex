// src/front/js/pages/AvatarWithPosePage.js
// Dark theme, reads avatar + pose data from localStorage, shows 3D viewer with pose overlay

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AvatarViewer from '../component/AvatarViewer';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const AvatarWithPosePage = () => {
  const [avatarUrl, setAvatarUrl] = useState('');
  const [poseData, setPoseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPoseOverlay, setShowPoseOverlay] = useState(true);

  useEffect(() => {
    // Read avatar URL from localStorage
    const storedAvatar = localStorage.getItem('avatar_url') || '';
    setAvatarUrl(storedAvatar);

    // Read last pose session from localStorage (set by MotionCapturePage or ReplaySession)
    const storedPose = localStorage.getItem('last_pose_data');
    if (storedPose) {
      try {
        setPoseData(JSON.parse(storedPose));
      } catch (e) {
        console.warn('Could not parse stored pose data');
      }
    }

    setLoading(false);
  }, []);

  // Resolve full URL
  const resolvedUrl = avatarUrl.startsWith('http') || avatarUrl.startsWith('blob:')
    ? avatarUrl
    : avatarUrl ? `${BACKEND}${avatarUrl}` : '';

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🧍 Avatar with Pose</h2>
        <p className="df-page__subtitle">
          View your avatar with captured pose data applied.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: 3D Viewer */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">🎮 3D Viewer</h3>
            <span className={`df-card__badge ${poseData ? 'df-card__badge--green' : 'df-card__badge--purple'}`}>
              {poseData ? '🟢 Pose Loaded' : 'No Pose'}
            </span>
          </div>
          <div className="df-card__body" style={{ padding: 0, overflow: 'hidden', borderRadius: '0 0 12px 12px' }}>
            {!resolvedUrl ? (
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
                <p style={{ fontSize: '13px', maxWidth: '300px', textAlign: 'center' }}>
                  <Link to="/upload" style={{ color: '#a78bfa' }}>Upload a selfie</Link> or{' '}
                  <Link to="/motion" style={{ color: '#a78bfa' }}>capture motion</Link> first.
                </p>
              </div>
            ) : (
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

        {/* Right: Pose Info + Controls */}
        <div>
          {/* Pose Data Summary */}
          <div className="df-card" style={{ marginBottom: '12px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">📊 Pose Data</h3>
            </div>
            <div className="df-card__body">
              {poseData ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ background: '#111118', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Frames</div>
                      <div style={{ fontSize: '18px', color: '#4ade80', fontWeight: 700 }}>
                        {Array.isArray(poseData) ? poseData.length : 1}
                      </div>
                    </div>
                    <div style={{ background: '#111118', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Landmarks</div>
                      <div style={{ fontSize: '18px', color: '#a78bfa', fontWeight: 700 }}>
                        {Array.isArray(poseData) && poseData[0]?.landmarks ? poseData[0].landmarks.length : '33'}
                      </div>
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#ccc' }}>
                    <input
                      type="checkbox"
                      checked={showPoseOverlay}
                      onChange={(e) => setShowPoseOverlay(e.target.checked)}
                      style={{ accentColor: '#8b5cf6' }}
                    />
                    Show pose overlay on avatar
                  </label>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '13px' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px', opacity: 0.4 }}>📊</div>
                  <p>No pose data available.</p>
                  <p>Run a <Link to="/motion" style={{ color: '#a78bfa' }}>motion capture session</Link> to generate pose data.</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔗 Actions</h3>
            </div>
            <div className="df-card__body" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Link to="/motion" className="df-btn df-btn--primary" style={{ textDecoration: 'none', textAlign: 'center' }}>
                🎥 New Motion Capture
              </Link>
              <Link to="/motion-sessions" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                📂 View Sessions
              </Link>
              <Link to="/avatar-view" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                🧍 Avatar Viewer
              </Link>
              <Link to="/export-avatar" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                📦 Export
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarWithPosePage;