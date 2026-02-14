// src/front/js/pages/MotionCapturePage.js
// Updated to use LiveMoCapAvatar component
// Fixed: dark theme styling, REACT_APP_BACKEND_URL consistency

import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import LiveMoCapAvatar from '../component/LiveMoCapAvatar';
import '../../styles/Wardrobe.css';

const MotionCapturePage = () => {
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const defaultAvatar = `${backendUrl}/static/models/xbot_avatar.glb`;

  const [avatarUrl, setAvatarUrl] = useState(defaultAvatar);
  const [showVideo, setShowVideo] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [lastFrameData, setLastFrameData] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // Available avatar models
  const avatarModels = [
    { name: 'X Bot', url: `${backendUrl}/static/models/xbot_avatar.glb` },
    { name: 'Y Bot', url: `${backendUrl}/static/models/Y_Bot.glb` },
  ];

  // Handle each frame (optional — for sending to backend)
  const handleFrame = useCallback((frameData) => {
    setLastFrameData(frameData);
  }, []);

  // Save session to backend
  const handleSaveSession = async (frames) => {
    if (!frames || frames.length === 0) {
      setSaveStatus('No frames to save');
      return;
    }

    setSaveStatus('saving');

    try {
      const userId = localStorage.getItem('user_id') || '1';

      const response = await fetch(`${backendUrl}/api/save-motion-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          session_name: `MoCap Session ${new Date().toLocaleString()}`,
          frames: frames,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSaveStatus(`✅ Saved! Session ID: ${data.id}`);
      } else {
        setSaveStatus(`❌ Error: ${data.error || 'Failed to save'}`);
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('❌ Network error');
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎥 Live Motion Capture</h2>
        <p className="df-page__subtitle">
          Capture your movements in real-time and see them applied to a 3D avatar.
        </p>
      </div>

      {/* ── Settings Row ── */}
      <div className="df-card" style={{ marginBottom: '16px' }}>
        <div className="df-card__header">
          <h3 className="df-card__title">⚙️ Settings</h3>
        </div>
        <div className="df-card__body">
          <div className="df-form-row">
            <div className="df-form-group">
              <label className="df-label">Avatar Model</label>
              <select
                className="df-select"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
              >
                {avatarModels.map((model) => (
                  <option key={model.url} value={model.url}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="df-form-group">
              <label className="df-label">Custom Avatar (GLB/GLTF)</label>
              <label className="df-file-label">
                📂 Upload Model
                <input
                  type="file"
                  accept=".glb,.gltf"
                  className="df-file-input"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setAvatarUrl(url);
                    }
                  }}
                />
              </label>
            </div>

            <div className="df-form-group" style={{ justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#ccc' }}>
                <input
                  type="checkbox"
                  checked={showVideo}
                  onChange={(e) => setShowVideo(e.target.checked)}
                  style={{ accentColor: '#8b5cf6' }}
                />
                Show webcam preview
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main MoCap Component ── */}
      <div className="df-card" style={{ marginBottom: '16px' }}>
        <div className="df-card__header">
          <h3 className="df-card__title">📡 Live Capture</h3>
          <span className="df-card__badge df-card__badge--green">Real-time</span>
        </div>
        <div className="df-card__body" style={{ minHeight: '520px' }}>
          <LiveMoCapAvatar
            avatarUrl={avatarUrl}
            showVideo={showVideo}
            videoWidth={640}
            onFrame={handleFrame}
          />
        </div>
      </div>

      {/* ── Save Status ── */}
      {saveStatus && (
        <div
          className={`df-status ${saveStatus.includes('✅') ? 'df-status--success' : saveStatus.includes('❌') ? 'df-status--error' : 'df-status--info'}`}
          style={{ marginBottom: '16px' }}
        >
          {saveStatus === 'saving' ? (
            <><div className="df-spinner" /> Saving session...</>
          ) : (
            saveStatus
          )}
        </div>
      )}

      <div className="df-grid-2">
        {/* ── How to Use ── */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">📖 How to Use</h3>
          </div>
          <div className="df-card__body">
            <ol style={{ margin: 0, paddingLeft: '20px', color: '#bbb', fontSize: '13px', lineHeight: '2' }}>
              <li><strong style={{ color: '#e0e0e0' }}>Start Camera</strong> — Click the green button to enable your webcam</li>
              <li><strong style={{ color: '#e0e0e0' }}>Position Yourself</strong> — Stand back so your full body is visible</li>
              <li><strong style={{ color: '#e0e0e0' }}>Move!</strong> — Your avatar will mirror your movements in real-time</li>
              <li><strong style={{ color: '#e0e0e0' }}>Record</strong> — Click "Record" to capture your motion session</li>
              <li><strong style={{ color: '#e0e0e0' }}>Download</strong> — Save your recording as JSON for later playback</li>
            </ol>
          </div>
        </div>

        {/* ── Tips ── */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">💡 Tips for Best Results</h3>
          </div>
          <div className="df-card__body">
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#bbb', fontSize: '13px', lineHeight: '2' }}>
              <li>Use good lighting — avoid backlight (windows behind you)</li>
              <li>Wear contrasting clothes (avoid patterns similar to background)</li>
              <li>Keep your full body in frame for best tracking</li>
              <li>Maintain a distance of 6–10 feet from the camera</li>
              <li>A plain background improves detection accuracy</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Debug Panel (collapsible) ── */}
      {lastFrameData && (
        <div className="df-card" style={{ marginTop: '16px' }}>
          <div
            className="df-card__header"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowDebug(!showDebug)}
          >
            <h3 className="df-card__title">🔧 Debug Information</h3>
            <span className="df-card__badge df-card__badge--purple">
              {showDebug ? '▲ Hide' : '▼ Show'}
            </span>
          </div>
          {showDebug && (
            <div className="df-card__body">
              <label className="df-label">Last Frame — Key Landmarks</label>
              <pre style={{
                background: '#111118',
                border: '1px solid #2a2a3e',
                borderRadius: '8px',
                padding: '12px',
                color: '#4ade80',
                fontSize: '11px',
                maxHeight: '200px',
                overflow: 'auto',
                fontFamily: 'JetBrains Mono, monospace',
              }}>
                {JSON.stringify({
                  nose: lastFrameData.landmarks?.[0],
                  leftShoulder: lastFrameData.landmarks?.[11],
                  rightShoulder: lastFrameData.landmarks?.[12],
                  leftHip: lastFrameData.landmarks?.[23],
                  rightHip: lastFrameData.landmarks?.[24],
                }, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Quick Links ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
        <Link to="/motion-sessions" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          📂 View Saved Sessions
        </Link>
        <Link to="/replay-session" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          ▶️ Replay Sessions
        </Link>
        <Link to="/dance-sync" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          🎵 Dance Sync Mode
        </Link>
        <Link to="/motion-from-video" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          🎬 MoCap from Video
        </Link>
        <Link to="/face-capture" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          😊 Face Capture
        </Link>
        <Link to="/full-capture" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          🧍 Full Body + Face
        </Link>
      </div>
    </div>
  );
};

export default MotionCapturePage;