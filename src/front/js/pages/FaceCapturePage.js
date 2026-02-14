// src/front/js/pages/FaceCapturePage.js
// Wrapper page for FacialCaptureSystem component — standalone face-only capture
// Route: /face-capture

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import FacialCaptureSystem from '../component/FacialCaptureSystem';
import '../../styles/Wardrobe.css';

const FaceCapturePage = () => {
  const [latestExpr, setLatestExpr] = useState(null);
  const [recording, setRecording] = useState(false);
  const [frames, setFrames] = useState([]);

  const handleFaceFrame = (expressions) => {
    setLatestExpr(expressions);
    if (recording) {
      setFrames((prev) => [...prev, { time: Date.now(), ...expressions }]);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(frames, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `face_capture_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎭 Face Capture</h2>
        <p className="df-page__subtitle">
          Real-time facial expression tracking — jaw, blinks, brows, smile, and head rotation.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Capture */}
        <div>
          <FacialCaptureSystem
            onFaceFrame={handleFaceFrame}
            showPreview={true}
            showDebugBars={true}
          />

          {/* Recording Controls */}
          <div className="df-card" style={{ marginTop: '12px' }}>
            <div className="df-card__body" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className={`df-btn ${recording ? 'df-btn--danger' : 'df-btn--primary'}`}
                onClick={() => {
                  if (!recording) setFrames([]);
                  setRecording(!recording);
                }}
              >
                {recording ? `⏹ Stop Recording (${frames.length} frames)` : '⏺ Record Expressions'}
              </button>

              {frames.length > 0 && !recording && (
                <button className="df-btn df-btn--ghost" onClick={handleExport}>
                  📥 Export JSON ({frames.length} frames)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Info + Live Values */}
        <div>
          {/* Live Expression Summary */}
          {latestExpr && (
            <div className="df-card" style={{ marginBottom: '12px' }}>
              <div className="df-card__header">
                <h3 className="df-card__title">📊 Live Values</h3>
              </div>
              <div className="df-card__body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {Object.entries(latestExpr).map(([key, val]) => (
                    <div key={key} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      background: '#111118',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}>
                      <span style={{ color: '#888' }}>{key}</span>
                      <span style={{ color: val > 0.5 ? '#4ade80' : '#aaa', fontWeight: 600 }}>
                        {typeof val === 'number' ? val.toFixed(2) : val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="df-card" style={{ marginBottom: '12px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">💡 What's Tracked</h3>
            </div>
            <div className="df-card__body" style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.7 }}>
              <p>MediaPipe FaceMesh (478 landmarks) extracts:</p>
              <p><strong style={{ color: '#e0e0e0' }}>Jaw:</strong> Open/close mapped to avatar jaw bone</p>
              <p><strong style={{ color: '#e0e0e0' }}>Eyes:</strong> Independent left/right blink detection</p>
              <p><strong style={{ color: '#e0e0e0' }}>Brows:</strong> Left/right eyebrow raise</p>
              <p><strong style={{ color: '#e0e0e0' }}>Smile:</strong> Mouth width ratio</p>
              <p><strong style={{ color: '#e0e0e0' }}>Head:</strong> Pitch, yaw, and roll rotation</p>
            </div>
          </div>

          {/* Quick Links */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔗 Related</h3>
            </div>
            <div className="df-card__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link to="/full-capture" className="df-btn df-btn--primary" style={{ textDecoration: 'none' }}>
                  🧑 Full Body + Face
                </Link>
                <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🎥 Body Capture Only
                </Link>
                <Link to="/motion-sessions" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🎞️ Sessions
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceCapturePage;