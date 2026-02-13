// MotionCaptureSystem.js — Unified Webcam → Avatar Pipeline
// Location: src/front/js/component/MotionCaptureSystem.js
//
// Replaces MotionCapture.js, MotionCaptureWithRecording.js, and LiveAvatarPage.js
// with one component that actually works end-to-end.
//
// Architecture:
//   Webcam → MediaPipe Pose → Smoothing Pipeline → AvatarRigPlayer3D
//   (all client-side, no backend round-trip per frame)
//
// Usage:
//   <MotionCaptureSystem avatarUrl="/static/models/Y_Bot.glb" />

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import {
  createSmoothingPipeline,
  SMOOTHING_PRESETS,
} from '../utils/smoothPose';
import AvatarRigPlayer3D from './AvatarRigPlayer3D';

// ─────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  // MediaPipe settings
  modelComplexity: 1,          // 0=lite, 1=full, 2=heavy (more accurate but slower)
  smoothLandmarks: true,       // MediaPipe's built-in smoothing (we add OneEuro on top)
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,

  // Camera
  cameraWidth: 640,
  cameraHeight: 480,

  // Performance
  targetFPS: 30,               // Cap frame rate to save CPU
  skipBackendFrames: true,     // Don't send every frame to backend
  backendSendInterval: 10,     // Send every Nth frame to backend (if needed)
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const MotionCaptureSystem = ({
  avatarUrl = '/static/models/Y_Bot.glb',
  onPoseFrame = null,           // Optional callback: (frame) => {}
  showWebcam = true,            // Show/hide webcam preview
  smoothingPreset = 'balanced', // 'dance' | 'balanced' | 'cinematic'
  config = {},
}) => {
  // Merge user config with defaults
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // ── Refs ──
  const videoRef = useRef(null);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const pipelineRef = useRef(null);
  const frameCountRef = useRef(0);
  const recordingRef = useRef([]);
  const startTimeRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);

  // ── State ──
  const [liveFrame, setLiveFrame] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(0);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [smoothingEnabled, setSmoothingEnabled] = useState(true);
  const [currentPreset, setCurrentPreset] = useState(smoothingPreset);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);

  // FPS tracking
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });

  // ── Initialize smoothing pipeline ──
  useEffect(() => {
    pipelineRef.current = createSmoothingPipeline(currentPreset);
  }, [currentPreset]);

  // ── Handle MediaPipe results ──
  const handlePoseResults = useCallback((results) => {
    if (!results.poseLandmarks) return;

    const now = performance.now() / 1000;
    let landmarks = results.poseLandmarks;

    // Apply smoothing pipeline (OneEuro + velocity clamping)
    if (smoothingEnabled && pipelineRef.current) {
      landmarks = pipelineRef.current.process(landmarks);
    }

    const frame = {
      landmarks,
      timestamp: now,
      worldLandmarks: results.poseWorldLandmarks || null,
    };

    // Update live frame for avatar (hot path — keep fast)
    setLiveFrame(frame);

    // Track FPS
    fpsCounterRef.current.frames++;
    const elapsed = now - fpsCounterRef.current.lastTime;
    if (elapsed >= 1.0) {
      setFps(Math.round(fpsCounterRef.current.frames / elapsed));
      fpsCounterRef.current = { frames: 0, lastTime: now };
    }

    // Update landmark count (for UI status)
    const visibleCount = landmarks.filter(
      (lm) => lm.visibility === undefined || lm.visibility > 0.5
    ).length;
    setLandmarkCount(visibleCount);

    // Recording: push frame to buffer (NOT React state — avoids re-renders)
    if (isRecording) {
      const recordTime = startTimeRef.current
        ? (performance.now() - startTimeRef.current) / 1000
        : 0;
      recordingRef.current.push({
        time: recordTime,
        landmarks: landmarks.map((lm) => ({ ...lm })), // deep copy
      });
    }

    // Optional external callback
    if (onPoseFrame) {
      onPoseFrame(frame);
    }

    // Occasional backend sync (not every frame!)
    frameCountRef.current++;
    if (!cfg.skipBackendFrames || frameCountRef.current % cfg.backendSendInterval === 0) {
      sendToBackend(landmarks);
    }
  }, [smoothingEnabled, isRecording, onPoseFrame, cfg]);

  // ── Send to backend (throttled, fire-and-forget) ──
  const sendToBackend = useCallback((landmarks) => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    if (!backendUrl) return;

    fetch(`${backendUrl}/process-pose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pose_data: landmarks }),
    }).catch(() => {
      // Silently fail — backend pose processing is optional
    });
  }, []);

  // ── Start capture ──
  const startCapture = useCallback(async () => {
    try {
      setError(null);

      // Reset smoothing pipeline for fresh state
      if (pipelineRef.current) pipelineRef.current.reset();

      // Initialize MediaPipe Pose
      const pose = new Pose({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      pose.setOptions({
        modelComplexity: cfg.modelComplexity,
        smoothLandmarks: cfg.smoothLandmarks,
        enableSegmentation: cfg.enableSegmentation,
        minDetectionConfidence: cfg.minDetectionConfidence,
        minTrackingConfidence: cfg.minTrackingConfidence,
      });

      pose.onResults(handlePoseResults);
      poseRef.current = pose;

      // Start camera
      if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            if (poseRef.current) {
              await poseRef.current.send({ image: videoRef.current });
            }
          },
          width: cfg.cameraWidth,
          height: cfg.cameraHeight,
        });

        await camera.start();
        cameraRef.current = camera;
        setIsCapturing(true);
      }
    } catch (err) {
      console.error('[MoCap] Start failed:', err);
      setError(`Camera failed: ${err.message}. Check permissions.`);
    }
  }, [cfg, handlePoseResults]);

  // ── Stop capture ──
  const stopCapture = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    poseRef.current = null;
    setIsCapturing(false);
    setLiveFrame(null);

    // Reset smoothing pipeline to avoid stale filter state
    if (pipelineRef.current) pipelineRef.current.reset();
  }, []);

  // ── Recording controls ──
  const startRecording = useCallback(() => {
    recordingRef.current = [];
    startTimeRef.current = performance.now();
    setIsRecording(true);
    setRecordedFrames(null);
    setDownloadUrl(null);

    // Also record webcam video
    if (videoRef.current && videoRef.current.srcObject) {
      try {
        const stream = videoRef.current.srcObject;
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        videoChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) videoChunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(videoChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch (err) {
        console.warn('[MoCap] Video recording not supported:', err);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);

    // Finalize landmark recording
    const frames = [...recordingRef.current];
    setRecordedFrames(frames);

    // Stop video recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    console.log(`[MoCap] Recorded ${frames.length} frames`);
  }, []);

  // ── Playback ──
  const togglePlayback = useCallback(() => {
    if (!recordedFrames || recordedFrames.length === 0) return;

    if (isPlaying) {
      setIsPlaying(false);
      setLiveFrame(null);
    } else {
      // Stop live capture during playback
      if (isCapturing) stopCapture();
      setIsPlaying(true);
    }
  }, [recordedFrames, isPlaying, isCapturing, stopCapture]);

  // ── Export recording as JSON ──
  const exportRecording = useCallback(() => {
    if (!recordedFrames || recordedFrames.length === 0) return;

    const data = {
      version: '1.0',
      fps: fps || 30,
      frameCount: recordedFrames.length,
      duration: recordedFrames[recordedFrames.length - 1]?.time || 0,
      frames: recordedFrames,
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mocap_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordedFrames, fps]);

  // ── Save to backend ──
  const saveToBackend = useCallback(async () => {
    if (!recordedFrames || recordedFrames.length === 0) return;

    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    if (!backendUrl) return;

    try {
      const res = await fetch(`${backendUrl}/save-mocap-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: recordedFrames,
          fps: fps || 30,
          duration: recordedFrames[recordedFrames.length - 1]?.time || 0,
        }),
      });
      const data = await res.json();
      console.log('[MoCap] Saved to backend:', data);
    } catch (err) {
      console.error('[MoCap] Save failed:', err);
    }
  }, [recordedFrames, fps]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      stopCapture();
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      {/* ── Left Panel: Webcam + Controls ── */}
      <div style={styles.leftPanel}>
        {/* Webcam Preview */}
        <div style={styles.videoContainer}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              ...styles.video,
              display: showWebcam ? 'block' : 'none',
            }}
          />
          {!isCapturing && !showWebcam && (
            <div style={styles.placeholder}>Camera off</div>
          )}

          {/* Status Overlay */}
          {isCapturing && (
            <div style={styles.statusOverlay}>
              <span style={styles.statusDot(landmarkCount > 20)} />
              <span>{fps} FPS</span>
              <span>{landmarkCount}/33 landmarks</span>
              {isRecording && (
                <span style={styles.recordingBadge}>
                  ● REC {recordingRef.current.length}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={styles.controls}>
          {/* Capture */}
          {!isCapturing ? (
            <button onClick={startCapture} style={styles.btnPrimary}>
              ▶ Start Capture
            </button>
          ) : (
            <button onClick={stopCapture} style={styles.btnDanger}>
              ■ Stop Capture
            </button>
          )}

          {/* Recording */}
          {isCapturing && !isRecording && (
            <button onClick={startRecording} style={styles.btnRecord}>
              ⏺ Record
            </button>
          )}
          {isRecording && (
            <button onClick={stopRecording} style={styles.btnDanger}>
              ⏹ Stop Recording
            </button>
          )}

          {/* Playback */}
          {recordedFrames && recordedFrames.length > 0 && (
            <div style={styles.playbackControls}>
              <button onClick={togglePlayback} style={styles.btnSecondary}>
                {isPlaying ? '⏹ Stop Playback' : '▶ Play Recording'}
              </button>
              <button onClick={exportRecording} style={styles.btnSecondary}>
                💾 Export JSON
              </button>
              <button onClick={saveToBackend} style={styles.btnSecondary}>
                ☁ Save to Cloud
              </button>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download="mocap_video.webm"
                  style={styles.btnSecondary}
                >
                  📹 Download Video
                </a>
              )}
              <span style={styles.frameCount}>
                {recordedFrames.length} frames
              </span>
            </div>
          )}
        </div>

        {/* Smoothing Controls */}
        <div style={styles.smoothingPanel}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={smoothingEnabled}
              onChange={(e) => setSmoothingEnabled(e.target.checked)}
            />
            Smoothing
          </label>
          {smoothingEnabled && (
            <select
              value={currentPreset}
              onChange={(e) => setCurrentPreset(e.target.value)}
              style={styles.select}
            >
              <option value="dance">Dance (fast)</option>
              <option value="balanced">Balanced</option>
              <option value="cinematic">Cinematic (smooth)</option>
            </select>
          )}
        </div>

        {/* Error display */}
        {error && <div style={styles.error}>{error}</div>}
      </div>

      {/* ── Right Panel: 3D Avatar ── */}
      <div style={styles.rightPanel}>
        <AvatarRigPlayer3D
          avatarUrl={avatarUrl}
          liveFrame={isPlaying ? null : liveFrame}
          recordedFrames={isPlaying ? recordedFrames : null}
          smoothingEnabled={false} // Pipeline already smoothed — don't double-smooth
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// STYLES (dark theme matching DoppelFlex UI)
// ─────────────────────────────────────────────────────────────
const styles = {
  container: {
    display: 'flex',
    gap: '16px',
    height: '100%',
    minHeight: '600px',
    padding: '16px',
    backgroundColor: '#0a0a0f',
    color: '#e0e0e0',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  leftPanel: {
    width: '360px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rightPanel: {
    flex: 1,
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid #1a1a2e',
    minHeight: '500px',
  },
  videoContainer: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#111',
    border: '1px solid #1a1a2e',
  },
  video: {
    width: '100%',
    borderRadius: '12px',
    transform: 'scaleX(-1)', // Mirror webcam
  },
  placeholder: {
    width: '100%',
    height: '270px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    fontSize: '14px',
  },
  statusOverlay: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    right: '8px',
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    fontSize: '11px',
    color: '#aaa',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  statusDot: (good) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: good ? '#4ade80' : '#f87171',
    flexShrink: 0,
  }),
  recordingBadge: {
    color: '#ef4444',
    fontWeight: 'bold',
    marginLeft: 'auto',
  },
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  btnPrimary: {
    padding: '10px 16px',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  btnDanger: {
    padding: '10px 16px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  btnRecord: {
    padding: '10px 16px',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  btnSecondary: {
    padding: '8px 12px',
    backgroundColor: '#1e1e2e',
    color: '#c0c0c0',
    border: '1px solid #333',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    textDecoration: 'none',
    display: 'inline-block',
    textAlign: 'center',
  },
  playbackControls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
  },
  frameCount: {
    fontSize: '11px',
    color: '#888',
    marginLeft: 'auto',
  },
  smoothingPanel: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#111118',
    borderRadius: '8px',
    border: '1px solid #1a1a2e',
    fontSize: '13px',
  },
  checkboxLabel: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    cursor: 'pointer',
  },
  select: {
    backgroundColor: '#1e1e2e',
    color: '#ccc',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
  },
  error: {
    padding: '8px 12px',
    backgroundColor: '#1a0000',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    color: '#f87171',
    fontSize: '13px',
  },
};

export default MotionCaptureSystem;