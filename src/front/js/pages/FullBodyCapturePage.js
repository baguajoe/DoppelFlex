// FullBodyCapturePage.js — Body + Face Motion Capture Combined
// Location: src/front/js/pages/FullBodyCapturePage.js
//
// Runs body pose (MediaPipe Pose) and facial expressions (MediaPipe FaceMesh)
// simultaneously, both feeding into the same avatar.
//
// Features:
//   - Side-by-side body and face capture panels
//   - Live expression summary strip
//   - Avatar model selector
//   - Body tracking status + face tracking status
//   - Links to related pages (replay, dance sync, sessions)
//
// Usage in layout.js:
//   import FullBodyCapturePage from './pages/FullBodyCapturePage';
//   <Route path="/full-capture" element={<FullBodyCapturePage />} />

import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MotionCaptureSystem from '../component/MotionCaptureSystem';
import FacialCaptureSystem, { applyFaceToAvatar } from '../component/FacialCaptureSystem';
import '../../styles/FullBodyCapturePage.css';

const DEFAULT_MODEL = '/static/models/Y_Bot.glb';

const AVAILABLE_MODELS = [
  { name: 'Y Bot', url: '/static/models/Y_Bot.glb' },
  { name: 'X Bot', url: '/static/models/xbot_avatar_compressed.glb' },
];

const FullBodyCapturePage = () => {
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_MODEL);
  const [faceExpressions, setFaceExpressions] = useState(null);
  const [bodyActive, setBodyActive] = useState(false);
  const [faceActive, setFaceActive] = useState(false);
  const avatarSceneRef = useRef(null);

  // ── Handle face expression data from FacialCaptureSystem ──
  const handleFaceFrame = useCallback((expressions) => {
    setFaceExpressions(expressions);
    setFaceActive(true);

    // Apply face expressions directly to avatar scene if available
    if (avatarSceneRef.current) {
      applyFaceToAvatar(avatarSceneRef.current, expressions);
    }
  }, []);

  // ── Handle body pose data from MotionCaptureSystem ──
  const handlePoseFrame = useCallback((frame) => {
    setBodyActive(true);
    // Body data is already applied by MotionCaptureSystem → AvatarRigPlayer3D
    // This callback is for any additional processing (recording, analytics, etc.)
  }, []);

  // ── Handle custom avatar upload ──
  const handleAvatarUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
  }, []);

  return (
    <div className="fullcap">
      {/* Header */}
      <div className="fullcap__header">
        <h2 className="fullcap__title">🎭 Full Body + Face Capture</h2>
        <p className="fullcap__subtitle">
          Body tracking and facial expressions running simultaneously, both driving your avatar.
        </p>
      </div>

      {/* Toolbar */}
      <div className="fullcap__toolbar">
        <div className="fullcap__toolbar-group">
          <span className="fullcap__toolbar-label">Avatar:</span>
          <select
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="fullcap__toolbar-select"
          >
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.url} value={model.url}>{model.name}</option>
            ))}
          </select>
        </div>

        <div className="fullcap__toolbar-group">
          <span className="fullcap__toolbar-label">Custom GLB:</span>
          <input
            type="file"
            accept=".glb,.gltf"
            onChange={handleAvatarUpload}
            className="fullcap__toolbar-select"
          />
        </div>

        <div className="fullcap__toolbar-group">
          <span className={`fullcap__toolbar-badge ${bodyActive ? 'fullcap__toolbar-badge--active' : 'fullcap__toolbar-badge--inactive'}`}>
            🏃 Body {bodyActive ? 'Active' : 'Off'}
          </span>
          <span className={`fullcap__toolbar-badge ${faceActive ? 'fullcap__toolbar-badge--active' : 'fullcap__toolbar-badge--inactive'}`}>
            🎭 Face {faceActive ? 'Active' : 'Off'}
          </span>
        </div>
      </div>

      {/* Main Capture Area */}
      <div className="fullcap__main">
        {/* Body Motion Capture */}
        <div className="fullcap__section">
          <div className="fullcap__section-header">
            <h3 className="fullcap__section-title">🏃 Body Motion Capture</h3>
            <span className="fullcap__section-status">
              MediaPipe Pose · 33 landmarks
            </span>
          </div>
          <div className="fullcap__section-body">
            <MotionCaptureSystem
              avatarUrl={avatarUrl}
              showWebcam={true}
              smoothingPreset="balanced"
              onPoseFrame={handlePoseFrame}
            />
          </div>
        </div>

        {/* Facial Capture */}
        <div className="fullcap__section">
          <div className="fullcap__section-header">
            <h3 className="fullcap__section-title">🎭 Facial Expressions</h3>
            <span className="fullcap__section-status">
              MediaPipe FaceMesh · 478 landmarks
            </span>
          </div>
          <div className="fullcap__section-body">
            <FacialCaptureSystem
              onFaceFrame={handleFaceFrame}
              showPreview={true}
              showDebugBars={true}
              showSnapshot={false}
              initialSensitivity="medium"
            />
          </div>
        </div>
      </div>

      {/* Live Expression Summary */}
      {faceExpressions && (
        <div className="fullcap__expr-strip">
          <ExpressionChip label="Jaw" value={faceExpressions.jawOpen} />
          <ExpressionChip label="L Blink" value={faceExpressions.leftBlink} />
          <ExpressionChip label="R Blink" value={faceExpressions.rightBlink} />
          <ExpressionChip label="Smile" value={faceExpressions.smile} />
          <ExpressionChip label="Pucker" value={faceExpressions.pucker} />
          <ExpressionChip label="L Brow" value={faceExpressions.leftBrowRaise} />
          <ExpressionChip label="R Brow" value={faceExpressions.rightBrowRaise} />
          <ExpressionChip label="Furrow" value={faceExpressions.browFurrow} />
          <ExpressionChip label="Yaw" value={faceExpressions.headYaw + 0.5} />
          <ExpressionChip label="Pitch" value={faceExpressions.headPitch + 0.5} />
        </div>
      )}

      {/* How to Use */}
      <div className="fullcap__help">
        <h4 className="fullcap__help-title">📋 How to Use</h4>
        <ol className="fullcap__help-list">
          <li><strong>Start Camera</strong> (body panel) — enables full-body pose tracking via webcam</li>
          <li><strong>Start Face Capture</strong> (face panel) — enables facial expression tracking</li>
          <li>Stand back ~6 feet so your full body is visible for body tracking</li>
          <li>Face the camera directly with good lighting for best facial tracking</li>
          <li>Both systems run independently — use one or both simultaneously</li>
          <li>Hit <strong>Record</strong> on either panel to save motion/expression data</li>
          <li>Export recordings as JSON for replay or further processing</li>
        </ol>
      </div>

      {/* Quick Links */}
      <div className="fullcap__links">
        <Link to="/motion" className="fullcap__link">🎥 Body Only</Link>
        <Link to="/replay-session" className="fullcap__link">▶️ Replay Session</Link>
        <Link to="/motion-sessions" className="fullcap__link">📂 Saved Sessions</Link>
        <Link to="/dance-sync" className="fullcap__link">🎵 Dance Sync</Link>
        <Link to="/avatar-customization" className="fullcap__link">🎨 Customize Avatar</Link>
      </div>
    </div>
  );
};

// ── Expression Chip Sub-component ──
const ExpressionChip = ({ label, value }) => {
  const active = (value || 0) > 0.4;
  return (
    <div className={`fullcap__expr-chip ${active ? 'fullcap__expr-chip--active' : ''}`}>
      <span className="fullcap__expr-chip-label">{label}</span>
      <span className={`fullcap__expr-chip-value ${active ? 'fullcap__expr-chip-value--high' : 'fullcap__expr-chip-value--low'}`}>
        {(value || 0).toFixed(1)}
      </span>
    </div>
  );
};

export default FullBodyCapturePage;