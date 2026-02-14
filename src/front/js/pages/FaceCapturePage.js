// FaceCapturePage.js — Standalone Face Capture Page
// Location: src/front/js/pages/FaceCapturePage.js
//
// Dedicated page for facial motion capture only.
// Separate from body capture (/motion) and combined (/full-capture).
//
// Route: /face-capture

import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import FacialCaptureSystem, { applyFaceToAvatar } from '../component/FacialCaptureSystem';
import '../../styles/FaceCapturePage.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const AVAILABLE_MODELS = [
  { name: 'Y Bot', url: `${BACKEND}/static/models/Y_Bot.glb` },
  { name: 'X Bot', url: `${BACKEND}/static/models/xbot_avatar_compressed.glb` },
];

const FaceCapturePage = () => {
  const [avatarUrl, setAvatarUrl] = useState(AVAILABLE_MODELS[0].url);
  const [faceExpressions, setFaceExpressions] = useState(null);
  const [faceActive, setFaceActive] = useState(false);
  const avatarSceneRef = useRef(null);

  // ── Handle face expression data ──
  const handleFaceFrame = useCallback((expressions) => {
    setFaceExpressions(expressions);
    setFaceActive(true);

    if (avatarSceneRef.current) {
      applyFaceToAvatar(avatarSceneRef.current, expressions);
    }
  }, []);

  // ── Handle custom avatar upload ──
  const handleAvatarUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
  }, []);

  return (
    <div className="facepage">
      {/* Header */}
      <div className="facepage__header">
        <h2 className="facepage__title">🎭 Face Capture</h2>
        <p className="facepage__subtitle">
          Track facial expressions in real-time using your webcam. Drives jaw, eyes, brows, and head rotation on your avatar.
        </p>
      </div>

      {/* Toolbar */}
      <div className="facepage__toolbar">
        <div className="facepage__toolbar-group">
          <span className="facepage__toolbar-label">Avatar:</span>
          <select
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="facepage__toolbar-select"
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.url} value={model.url}>{model.name}</option>
            ))}
          </select>
        </div>

        <div className="facepage__toolbar-group">
          <span className="facepage__toolbar-label">Custom GLB:</span>
          <input
            type="file"
            accept=".glb,.gltf"
            onChange={handleAvatarUpload}
            className="facepage__toolbar-select"
          />
        </div>

        <div className="facepage__toolbar-group">
          <span className={`facepage__toolbar-badge ${faceActive ? 'facepage__toolbar-badge--active' : 'facepage__toolbar-badge--inactive'}`}>
            🎭 Face {faceActive ? 'Active' : 'Off'}
          </span>
        </div>
      </div>

      {/* Main: Face Capture */}
      <div className="facepage__section">
        <div className="facepage__section-header">
          <h3 className="facepage__section-title">🎭 Facial Expression Tracking</h3>
          <span className="facepage__section-status">
            MediaPipe FaceMesh · 478 landmarks · Iris tracking
          </span>
        </div>
        <div className="facepage__section-body">
          <FacialCaptureSystem
            onFaceFrame={handleFaceFrame}
            showPreview={true}
            showDebugBars={true}
            showSnapshot={true}
            initialSensitivity="medium"
          />
        </div>
      </div>

      {/* Live Expression Summary */}
      {faceExpressions && (
        <div className="facepage__expr-strip">
          <ExprChip label="Jaw" value={faceExpressions.jawOpen} />
          <ExprChip label="L Blink" value={faceExpressions.leftBlink} />
          <ExprChip label="R Blink" value={faceExpressions.rightBlink} />
          <ExprChip label="Smile" value={faceExpressions.smile} />
          <ExprChip label="Pucker" value={faceExpressions.pucker} />
          <ExprChip label="L Brow" value={faceExpressions.leftBrowRaise} />
          <ExprChip label="R Brow" value={faceExpressions.rightBrowRaise} />
          <ExprChip label="Furrow" value={faceExpressions.browFurrow} />
          <ExprChip label="Yaw" value={faceExpressions.headYaw + 0.5} />
          <ExprChip label="Pitch" value={faceExpressions.headPitch + 0.5} />
          <ExprChip label="Gaze X" value={faceExpressions.gazeX + 0.5} />
          <ExprChip label="Gaze Y" value={faceExpressions.gazeY + 0.5} />
        </div>
      )}

      {/* How to Use */}
      <div className="facepage__help">
        <h4 className="facepage__help-title">📋 How to Use</h4>
        <ol className="facepage__help-list">
          <li><strong>Click "Start Face Capture"</strong> to enable webcam and begin tracking.</li>
          <li>Face the camera directly with good, even lighting for best results.</li>
          <li>The 478-point mesh overlay shows tracking quality in real-time.</li>
          <li>Expression bars show jaw, blinks, brows, smile, pucker, and head rotation values.</li>
          <li>Adjust <strong>Sensitivity</strong> (Low / Medium / High) to match your expression style.</li>
          <li>Hit <strong>Record Expressions</strong> to capture data, then <strong>Export</strong> as JSON.</li>
          <li>Y Bot supports jaw + head bones. For full blendshapes (eyes, brows), use a Ready Player Me avatar.</li>
        </ol>
      </div>

      {/* Navigation */}
      <div className="facepage__links">
        <Link to="/motion" className="facepage__link">🏃 Body Capture</Link>
        <Link to="/full-capture" className="facepage__link">🎭🏃 Body + Face Combined</Link>
        <Link to="/motion-from-video" className="facepage__link">🎬 From Video</Link>
        <Link to="/motion-sessions" className="facepage__link">📂 Saved Sessions</Link>
        <Link to="/dance-sync" className="facepage__link">🎵 Dance Sync</Link>
      </div>
    </div>
  );
};

// ── Expression Chip ──
const ExprChip = ({ label, value }) => {
  const active = (value || 0) > 0.4;
  return (
    <div className={`facepage__expr-chip ${active ? 'facepage__expr-chip--active' : ''}`}>
      <span className="facepage__expr-chip-label">{label}</span>
      <span className={`facepage__expr-chip-value ${active ? 'facepage__expr-chip-value--high' : 'facepage__expr-chip-value--low'}`}>
        {(value || 0).toFixed(1)}
      </span>
    </div>
  );
};

export default FaceCapturePage;