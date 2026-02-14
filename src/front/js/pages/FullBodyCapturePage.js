// FullBodyCapturePage.js — Body + Face Motion Capture Combined
// Location: src/front/js/pages/FullBodyCapturePage.js
//
// Runs body pose (MediaPipe Pose) and facial expressions (MediaPipe FaceMesh)
// simultaneously, both feeding into the same avatar.
//
// Features:
//   - Single / Multi camera mode toggle via CameraManager
//   - Side-by-side body and face capture panels
//   - Live expression summary strip
//   - Avatar model selector + custom GLB upload
//   - Body tracking status + face tracking status
//   - Links to related pages (replay, dance sync, sessions)
//
// Usage in layout.js:
//   import FullBodyCapturePage from './pages/FullBodyCapturePage';
//   <Route path="/full-capture" element={<FullBodyCapturePage />} />

import React, { useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import CameraManager from '../component/CameraManager';
import MotionCaptureSystem from '../component/MotionCaptureSystem';
import FacialCaptureSystem, { applyFaceToAvatar } from '../component/FacialCaptureSystem';
import '../../styles/FullBodyCapturePage.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';
const DEFAULT_MODEL = `${BACKEND}/static/models/Y_Bot.glb`;

const AVAILABLE_MODELS = [
  { name: 'Y Bot', url: `${BACKEND}/static/models/Y_Bot.glb` },
  { name: 'X Bot', url: `${BACKEND}/static/models/xbot_avatar_compressed.glb` },
];

const FullBodyCapturePage = () => {
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_MODEL);
  const [faceExpressions, setFaceExpressions] = useState(null);
  const [bodyActive, setBodyActive] = useState(false);
  const [faceActive, setFaceActive] = useState(false);
  const [cameraMode, setCameraMode] = useState('single');
  const [streams, setStreams] = useState({ body: null, face: null, depth: null });
  const avatarSceneRef = useRef(null);

  // ── Handle streams from CameraManager ──
  const handleStreamsReady = useCallback((newStreams) => {
    setStreams(newStreams);
    console.log('[FullCap] Streams ready:', {
      body: !!newStreams.body,
      face: !!newStreams.face,
      depth: !!newStreams.depth,
    });
  }, []);

  // ── Handle camera mode change ──
  const handleModeChange = useCallback((newMode) => {
    setCameraMode(newMode);
    setBodyActive(false);
    setFaceActive(false);
    setFaceExpressions(null);
  }, []);

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
  const handlePoseFrame = useCallback(() => {
    setBodyActive(true);
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
          <span className={`fullcap__toolbar-badge ${cameraMode === 'multi' ? 'fullcap__toolbar-badge--active' : 'fullcap__toolbar-badge--inactive'}`}>
            📷 {cameraMode === 'multi' ? 'Multi-Cam' : 'Single-Cam'}
          </span>
        </div>
      </div>

      {/* Camera Manager — Single / Multi Toggle + Device Selection */}
      <div className="fullcap__section">
        <div className="fullcap__section-header">
          <h3 className="fullcap__section-title">📷 Camera Setup</h3>
          <span className="fullcap__section-status">
            {cameraMode === 'single' ? 'One camera for body + face' : 'Separate cameras for body and face'}
          </span>
        </div>
        <div className="fullcap__section-body">
          <CameraManager
            initialMode="single"
            onStreamsReady={handleStreamsReady}
            onModeChange={handleModeChange}
            showPreviews={true}
            allowDepthCamera={false}
          />
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
              externalStream={streams.body}
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
              externalStream={streams.face}
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
          <li><strong>Choose camera mode</strong> — Single uses one webcam for both. Multi assigns separate cameras.</li>
          <li><strong>Select camera(s)</strong> — Pick which device for body and/or face tracking.</li>
          <li><strong>Start Camera(s)</strong> — Opens the selected camera streams.</li>
          <li><strong>Start body + face capture</strong> — Click Start in each panel to begin tracking.</li>
          <li>Stand back ~6 feet for body tracking, face the camera for facial tracking.</li>
          <li>In multi-camera mode, use a wide-angle cam for body and a close-up cam for face.</li>
          <li>Hit <strong>Record</strong> on either panel to save motion/expression data as JSON.</li>
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