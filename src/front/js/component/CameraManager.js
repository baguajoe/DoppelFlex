// CameraManager.js — Camera Selection & Multi-Camera Support
// Location: src/front/js/component/CameraManager.js
//
// Detects all available video devices, lets user choose between:
//   - Single Camera Mode: one webcam shared for body + face
//   - Multi Camera Mode: assign separate cameras to body, face, and optional depth
//
// Provides MediaStream objects to parent via callbacks.
//
// Usage:
//   <CameraManager
//     mode="single"            // or "multi"
//     onStreamsReady={streams => ...}
//     onModeChange={mode => ...}
//   />
//
// The streams object:
//   { body: MediaStream, face: MediaStream, depth: MediaStream|null }

import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../../styles/CameraManager.css';

// ─────────────────────────────────────────────────────────────
// CAMERA DETECTION
// Enumerate all video input devices available on the system.
// ─────────────────────────────────────────────────────────────

/**
 * Get all available video input devices.
 * Requires camera permission to get device labels.
 *
 * @returns {Promise<Array<{deviceId, label, groupId}>>}
 */
async function detectCameras() {
  // Request permission first (needed to get device labels)
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach((t) => t.stop()); // Release immediately
  } catch (err) {
    console.warn('[CamMgr] Permission denied or no camera:', err.message);
    return [];
  }

  const allDevices = await navigator.mediaDevices.enumerateDevices();
  const cameras = allDevices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
      groupId: d.groupId,
    }));

  console.log(`[CamMgr] Found ${cameras.length} camera(s):`, cameras.map((c) => c.label));
  return cameras;
}

/**
 * Open a MediaStream for a specific camera device.
 *
 * @param {string} deviceId - The device ID from detectCameras()
 * @param {Object} constraints - { width, height, frameRate }
 * @returns {Promise<MediaStream>}
 */
async function openCamera(deviceId, constraints = {}) {
  const { width = 640, height = 480, frameRate = 30 } = constraints;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate },
    },
  });

  // Log actual resolution
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  console.log(`[CamMgr] Opened ${track.label}: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`);

  return stream;
}

/**
 * Stop all tracks on a MediaStream.
 * @param {MediaStream} stream
 */
function stopStream(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

// ─────────────────────────────────────────────────────────────
// CAMERA ROLE DEFINITIONS
// ─────────────────────────────────────────────────────────────

const CAMERA_ROLES = {
  body: {
    label: 'Body',
    icon: '🏃',
    description: 'Full body tracking — position camera to see your entire body',
    constraints: { width: 1280, height: 720, frameRate: 30 },
  },
  face: {
    label: 'Face',
    icon: '🎭',
    description: 'Facial expressions — position close to face, good lighting',
    constraints: { width: 640, height: 480, frameRate: 30 },
  },
  depth: {
    label: 'Depth',
    icon: '📐',
    description: 'Optional depth camera for improved 3D accuracy',
    constraints: { width: 640, height: 480, frameRate: 30 },
  },
};

// ─────────────────────────────────────────────────────────────
// CAMERA MANAGER COMPONENT
// ─────────────────────────────────────────────────────────────

const CameraManager = ({
  initialMode = 'single',
  onStreamsReady = null,    // ({ body, face, depth }) => {}
  onModeChange = null,      // (mode) => {}
  showPreviews = true,      // Show live video previews
  allowDepthCamera = false, // Show depth camera option
}) => {
  // ── State ──
  const [mode, setMode] = useState(initialMode);             // 'single' | 'multi'
  const [cameras, setCameras] = useState([]);                 // Available devices
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Device assignments: which camera is assigned to which role
  const [assignments, setAssignments] = useState({
    body: '',    // deviceId
    face: '',
    depth: '',
  });

  // Active streams
  const [activeStreams, setActiveStreams] = useState({
    body: null,
    face: null,
    depth: null,
  });

  // Track which streams are active for status display
  const [streamStatus, setStreamStatus] = useState({
    body: false,
    face: false,
    depth: false,
  });

  // Video preview refs
  const bodyVideoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const depthVideoRef = useRef(null);

  const videoRefs = { body: bodyVideoRef, face: faceVideoRef, depth: depthVideoRef };

  // ── Detect cameras on mount ──
  useEffect(() => {
    loadCameras();

    // Listen for device changes (camera plugged in / unplugged)
    const handleDeviceChange = () => {
      console.log('[CamMgr] Device change detected, refreshing...');
      loadCameras();
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopAllStreams();
    };
  }, []);

  // ── Load available cameras ──
  const loadCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cams = await detectCameras();
      setCameras(cams);

      // Auto-assign first camera if none assigned
      if (cams.length > 0 && !assignments.body) {
        setAssignments((prev) => ({
          ...prev,
          body: cams[0].deviceId,
          face: cams.length > 1 ? cams[1].deviceId : cams[0].deviceId,
        }));
      }
    } catch (err) {
      setError(`Failed to detect cameras: ${err.message}`);
    }
    setLoading(false);
  }, []);

  // ── Handle mode switch ──
  const handleModeChange = useCallback((newMode) => {
    stopAllStreams();
    setMode(newMode);
    if (onModeChange) onModeChange(newMode);

    // In single mode, face uses same device as body
    if (newMode === 'single') {
      setAssignments((prev) => ({
        ...prev,
        face: prev.body,
        depth: '',
      }));
    }
  }, [onModeChange]);

  // ── Handle device assignment change ──
  const handleAssignmentChange = useCallback((role, deviceId) => {
    setAssignments((prev) => {
      const next = { ...prev, [role]: deviceId };

      // In single mode, body and face share the same camera
      if (mode === 'single' && role === 'body') {
        next.face = deviceId;
      }

      return next;
    });
  }, [mode]);

  // ── Start all assigned streams ──
  const startStreams = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const newStreams = { body: null, face: null, depth: null };
      const newStatus = { body: false, face: false, depth: false };
      const openedDevices = {}; // Track already-opened devices to share streams

      const roles = mode === 'single'
        ? ['body']
        : ['body', 'face', ...(allowDepthCamera && assignments.depth ? ['depth'] : [])];

      for (const role of roles) {
        const deviceId = assignments[role];
        if (!deviceId) continue;

        // If this device is already opened (single mode or same device assigned twice),
        // reuse the stream instead of opening a second one
        if (openedDevices[deviceId]) {
          newStreams[role] = openedDevices[deviceId];
        } else {
          const stream = await openCamera(deviceId, CAMERA_ROLES[role].constraints);
          newStreams[role] = stream;
          openedDevices[deviceId] = stream;
        }

        newStatus[role] = true;
      }

      // In single mode, face shares the body stream
      if (mode === 'single' && newStreams.body) {
        newStreams.face = newStreams.body;
        newStatus.face = true;
      }

      setActiveStreams(newStreams);
      setStreamStatus(newStatus);

      // Attach streams to video preview elements
      for (const role of Object.keys(newStreams)) {
        const ref = videoRefs[role];
        if (ref.current && newStreams[role]) {
          ref.current.srcObject = newStreams[role];
        }
      }

      // Notify parent
      if (onStreamsReady) onStreamsReady(newStreams);

    } catch (err) {
      console.error('[CamMgr] Failed to start streams:', err);
      setError(`Camera error: ${err.message}`);
    }

    setLoading(false);
  }, [assignments, mode, allowDepthCamera, onStreamsReady]);

  // ── Stop all streams ──
  const stopAllStreams = useCallback(() => {
    // Collect unique streams (body and face may share one)
    const uniqueStreams = new Set(Object.values(activeStreams).filter(Boolean));
    uniqueStreams.forEach(stopStream);

    setActiveStreams({ body: null, face: null, depth: null });
    setStreamStatus({ body: false, face: false, depth: false });

    // Clear video elements
    Object.values(videoRefs).forEach((ref) => {
      if (ref.current) ref.current.srcObject = null;
    });
  }, [activeStreams]);

  // ── Get resolution info for a stream ──
  const getStreamInfo = (stream) => {
    if (!stream) return null;
    const track = stream.getVideoTracks()[0];
    if (!track) return null;
    const s = track.getSettings();
    return `${s.width}x${s.height} @ ${Math.round(s.frameRate || 30)}fps`;
  };

  // ── Which roles to show ──
  const visibleRoles = mode === 'single'
    ? ['body']
    : ['body', 'face', ...(allowDepthCamera ? ['depth'] : [])];

  const anyActive = Object.values(streamStatus).some(Boolean);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="cam-mgr">
      {/* Header */}
      <div>
        <h3 className="cam-mgr__title">📷 Camera Setup</h3>
        <p className="cam-mgr__subtitle">
          {cameras.length} camera{cameras.length !== 1 ? 's' : ''} detected
          {cameras.length > 1 && ' — multi-camera available'}
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="cam-mgr__mode-toggle">
        <button
          className={`cam-mgr__mode-btn ${mode === 'single' ? 'cam-mgr__mode-btn--active' : ''}`}
          onClick={() => handleModeChange('single')}
          disabled={anyActive}
        >
          📷 Single Camera
        </button>
        <button
          className={`cam-mgr__mode-btn ${mode === 'multi' ? 'cam-mgr__mode-btn--active' : ''}`}
          onClick={() => handleModeChange('multi')}
          disabled={anyActive || cameras.length < 2}
          title={cameras.length < 2 ? 'Need 2+ cameras for multi mode' : ''}
        >
          📷📷 Multi Camera
        </button>
      </div>

      {/* Info Banner */}
      {mode === 'single' && (
        <div className="cam-mgr__info">
          <span className="cam-mgr__info-icon">💡</span>
          <span>
            Single mode uses one webcam for both body and face tracking.
            Good for most setups. Switch to multi-camera if you have a second
            webcam for better facial detail or wider body coverage.
          </span>
        </div>
      )}

      {mode === 'multi' && (
        <div className="cam-mgr__info">
          <span className="cam-mgr__info-icon">💡</span>
          <span>
            Multi-camera mode assigns separate cameras to body and face tracking.
            Use a wide-angle or farther camera for body, and a close-up camera for face.
            This gives better tracking quality for both.
          </span>
        </div>
      )}

      {/* Device Assignments */}
      <div className="cam-mgr__devices">
        {visibleRoles.map((role) => (
          <div
            key={role}
            className={`cam-mgr__device-row ${assignments[role] ? 'cam-mgr__device-row--assigned' : ''}`}
          >
            <span className="cam-mgr__device-role">
              {CAMERA_ROLES[role].icon} {CAMERA_ROLES[role].label}
            </span>

            <select
              value={assignments[role] || ''}
              onChange={(e) => handleAssignmentChange(role, e.target.value)}
              className="cam-mgr__device-select"
              disabled={anyActive}
            >
              <option value="">— Select camera —</option>
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label}
                </option>
              ))}
            </select>

            <span
              className={`cam-mgr__device-status ${streamStatus[role] ? 'cam-mgr__device-status--active' : 'cam-mgr__device-status--inactive'}`}
            />

            {activeStreams[role] && (
              <span className="cam-mgr__res-badge">
                {getStreamInfo(activeStreams[role])}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="cam-mgr__actions">
        {!anyActive ? (
          <button
            onClick={startStreams}
            className="cam-mgr__btn cam-mgr__btn--primary"
            disabled={loading || !assignments.body}
          >
            {loading ? '⏳ Starting...' : '▶ Start Camera(s)'}
          </button>
        ) : (
          <button
            onClick={stopAllStreams}
            className="cam-mgr__btn cam-mgr__btn--danger"
          >
            ■ Stop All Cameras
          </button>
        )}

        <button
          onClick={loadCameras}
          className="cam-mgr__btn cam-mgr__btn--ghost"
          disabled={loading}
        >
          🔄 Refresh Devices
        </button>
      </div>

      {/* Video Previews */}
      {showPreviews && anyActive && (
        <div className={`cam-mgr__previews ${mode === 'multi' ? 'cam-mgr__previews--multi' : 'cam-mgr__previews--single'}`}>
          {visibleRoles.map((role) => (
            <div key={role} className="cam-mgr__preview-card">
              <span className="cam-mgr__preview-label">
                {CAMERA_ROLES[role].icon} {CAMERA_ROLES[role].label}
              </span>
              {streamStatus[role] ? (
                <video
                  ref={videoRefs[role]}
                  autoPlay
                  playsInline
                  muted
                  className="cam-mgr__preview-video"
                />
              ) : (
                <div className="cam-mgr__preview-placeholder">
                  No camera assigned
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && <div className="cam-mgr__error">{error}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────
export default CameraManager;
export { detectCameras, openCamera, stopStream, CAMERA_ROLES };