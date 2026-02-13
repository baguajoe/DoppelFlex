// FacialCaptureSystem.js — Real-time Facial Motion Capture
// Location: src/front/js/component/FacialCaptureSystem.js
//
// Uses MediaPipe Face Mesh (478 landmarks with refined iris) in the browser.
// Extracts expression values and maps them to avatar bones + morph targets.
//
// Features:
//   - 10 expression channels (jaw, blinks, brows, smile, pucker, head rotation)
//   - Expression recording + JSON export
//   - Sensitivity controls
//   - Debug visualization with expression bars
//   - Compatible with Mixamo rigs (Y Bot, X Bot) and morph target avatars
//
// Usage:
//   <FacialCaptureSystem onFaceFrame={(data) => console.log(data)} />

import React, { useRef, useState, useEffect, useCallback } from 'react';
import '../../styles/FacialCaptureSystem.css';

// ─────────────────────────────────────────────────────────────
// FACE LANDMARK INDICES
// MediaPipe Face Mesh provides 478 landmarks (468 base + 10 iris)
// These are the key indices for expression extraction.
// ─────────────────────────────────────────────────────────────
const FACE_LANDMARKS = {
  // Jaw / Mouth
  JAW_TOP: 13,
  JAW_BOTTOM: 14,
  CHIN: 152,
  UPPER_LIP_TOP: 12,
  LOWER_LIP_BOTTOM: 15,

  // Left eye (viewer's perspective)
  LEFT_EYE_TOP: 159,
  LEFT_EYE_BOTTOM: 145,
  LEFT_EYE_INNER: 133,
  LEFT_EYE_OUTER: 33,
  LEFT_IRIS: 468,         // Refined landmark (requires refineLandmarks: true)

  // Right eye
  RIGHT_EYE_TOP: 386,
  RIGHT_EYE_BOTTOM: 374,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  RIGHT_IRIS: 473,        // Refined landmark

  // Eyebrows
  LEFT_BROW_INNER: 107,
  LEFT_BROW_MID: 105,
  LEFT_BROW_OUTER: 70,
  RIGHT_BROW_INNER: 336,
  RIGHT_BROW_MID: 334,
  RIGHT_BROW_OUTER: 300,

  // Mouth
  MOUTH_LEFT: 61,
  MOUTH_RIGHT: 291,
  UPPER_LIP_CENTER: 0,
  LOWER_LIP_CENTER: 17,

  // Nose
  NOSE_TIP: 1,
  NOSE_BRIDGE: 6,

  // Face oval (head rotation reference)
  FOREHEAD: 10,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,

  // Cheek puff reference points
  LEFT_CHEEK_PUFF: 36,
  RIGHT_CHEEK_PUFF: 266,
};

// ─────────────────────────────────────────────────────────────
// SENSITIVITY PRESETS
// ─────────────────────────────────────────────────────────────
const SENSITIVITY_PRESETS = {
  low: {
    label: 'Low',
    description: 'Requires exaggerated expressions',
    jawScale: 0.6,
    blinkScale: 0.6,
    browScale: 0.6,
    smileScale: 0.6,
    headScale: 0.3,
  },
  medium: {
    label: 'Medium',
    description: 'Natural expressions',
    jawScale: 1.0,
    blinkScale: 1.0,
    browScale: 1.0,
    smileScale: 1.0,
    headScale: 0.5,
  },
  high: {
    label: 'High',
    description: 'Picks up subtle movements',
    jawScale: 1.5,
    blinkScale: 1.4,
    browScale: 1.3,
    smileScale: 1.3,
    headScale: 0.7,
  },
};

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─────────────────────────────────────────────────────────────
// EXPRESSION EXTRACTION
// Core function that turns 478 landmarks into usable values.
// ─────────────────────────────────────────────────────────────

/**
 * Extract normalized expression values from MediaPipe Face Mesh landmarks.
 *
 * @param {Array} landmarks - 478 {x, y, z, visibility?} objects from FaceMesh
 * @param {Object} sensitivity - Sensitivity multipliers (from SENSITIVITY_PRESETS)
 * @returns {Object|null} Expression values, each normalized 0–1 (head rotation in radians)
 */
export function extractExpressions(landmarks, sensitivity = SENSITIVITY_PRESETS.medium) {
  if (!landmarks || landmarks.length < 468) return null;

  const lm = landmarks;

  // Helper: Euclidean distance between two landmark indices
  const dist = (a, b) => {
    const dx = lm[a].x - lm[b].x;
    const dy = lm[a].y - lm[b].y;
    const dz = (lm[a].z || 0) - (lm[b].z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  // Helper: midpoint between two landmarks
  const mid = (a, b) => ({
    x: (lm[a].x + lm[b].x) / 2,
    y: (lm[a].y + lm[b].y) / 2,
    z: ((lm[a].z || 0) + (lm[b].z || 0)) / 2,
  });

  // Reference distance (inter-eye width) for face-size normalization.
  // This makes the system work regardless of distance from camera.
  const leftEyeWidth = dist(FACE_LANDMARKS.LEFT_EYE_INNER, FACE_LANDMARKS.LEFT_EYE_OUTER);
  const rightEyeWidth = dist(FACE_LANDMARKS.RIGHT_EYE_INNER, FACE_LANDMARKS.RIGHT_EYE_OUTER);
  const refDist = (leftEyeWidth + rightEyeWidth) / 2;

  if (refDist < 0.001) return null; // Face too small / not properly detected

  // ── Jaw Open (0 = closed, 1 = wide open) ──
  // Distance between upper and lower lip center, normalized by face size.
  const mouthOpenDist = dist(FACE_LANDMARKS.JAW_TOP, FACE_LANDMARKS.JAW_BOTTOM);
  const jawOpen = clamp((mouthOpenDist / refDist / 0.8) * sensitivity.jawScale, 0, 1);

  // ── Eye Blink (0 = fully open, 1 = fully closed) ──
  // Ratio of eye height to eye width — when this ratio drops, the eye is closing.
  const leftEyeHeight = dist(FACE_LANDMARKS.LEFT_EYE_TOP, FACE_LANDMARKS.LEFT_EYE_BOTTOM);
  const rightEyeHeight = dist(FACE_LANDMARKS.RIGHT_EYE_TOP, FACE_LANDMARKS.RIGHT_EYE_BOTTOM);
  const leftEAR = leftEyeHeight / leftEyeWidth;   // Eye Aspect Ratio
  const rightEAR = rightEyeHeight / rightEyeWidth;
  // EAR typically ~0.25 when open, ~0.05 when closed
  const leftBlink = clamp((1 - (leftEAR / 0.25)) * sensitivity.blinkScale, 0, 1);
  const rightBlink = clamp((1 - (rightEAR / 0.25)) * sensitivity.blinkScale, 0, 1);

  // ── Eyebrow Raise (0 = neutral, 1 = fully raised) ──
  // Distance from brow midpoint to eye top, normalized.
  const leftBrowHeight = dist(FACE_LANDMARKS.LEFT_BROW_MID, FACE_LANDMARKS.LEFT_EYE_TOP);
  const rightBrowHeight = dist(FACE_LANDMARKS.RIGHT_BROW_MID, FACE_LANDMARKS.RIGHT_EYE_TOP);
  const leftBrowRaise = clamp(((leftBrowHeight / refDist) - 0.18) / 0.12 * sensitivity.browScale, 0, 1);
  const rightBrowRaise = clamp(((rightBrowHeight / refDist) - 0.18) / 0.12 * sensitivity.browScale, 0, 1);

  // ── Eyebrow Furrow (0 = neutral, 1 = furrowed/angry) ──
  // Inner brow points move closer together when furrowing.
  const browInnerDist = dist(FACE_LANDMARKS.LEFT_BROW_INNER, FACE_LANDMARKS.RIGHT_BROW_INNER);
  const browFurrow = clamp((1 - (browInnerDist / refDist / 0.8)) * sensitivity.browScale, 0, 1);

  // ── Smile / Mouth Width (0 = neutral, 1 = big smile) ──
  // Mouth corner distance relative to face width.
  const mouthWidth = dist(FACE_LANDMARKS.MOUTH_LEFT, FACE_LANDMARKS.MOUTH_RIGHT);
  const smile = clamp(((mouthWidth / refDist) - 1.1) / 0.5 * sensitivity.smileScale, 0, 1);

  // ── Mouth Pucker (0 = neutral, 1 = puckered) ──
  // Inverse of mouth width — small mouth width = pucker.
  const pucker = clamp((1 - (mouthWidth / refDist / 1.4)) * sensitivity.smileScale, 0, 1);

  // ── Head Rotation (pitch, yaw, roll in radians) ──
  const noseTip = lm[FACE_LANDMARKS.NOSE_TIP];
  const forehead = lm[FACE_LANDMARKS.FOREHEAD];
  const chin = lm[FACE_LANDMARKS.CHIN];
  const leftCheek = lm[FACE_LANDMARKS.LEFT_CHEEK];
  const rightCheek = lm[FACE_LANDMARKS.RIGHT_CHEEK];

  // Yaw (left-right): how far the nose is from the midpoint between cheeks
  const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
  const headYaw = (noseTip.x - faceCenterX) * 4 * sensitivity.headScale;

  // Pitch (up-down): nose Y relative to forehead-chin midpoint
  const faceCenterY = (forehead.y + chin.y) / 2;
  const headPitch = (noseTip.y - faceCenterY) * 4 * sensitivity.headScale;

  // Roll (tilt): angle of the line connecting eye centers
  const leftEyeCenter = mid(FACE_LANDMARKS.LEFT_EYE_INNER, FACE_LANDMARKS.LEFT_EYE_OUTER);
  const rightEyeCenter = mid(FACE_LANDMARKS.RIGHT_EYE_INNER, FACE_LANDMARKS.RIGHT_EYE_OUTER);
  const headRoll = Math.atan2(
    rightEyeCenter.y - leftEyeCenter.y,
    rightEyeCenter.x - leftEyeCenter.x
  ) * sensitivity.headScale;

  // ── Iris / Gaze Direction (if refined landmarks available) ──
  let gazeX = 0;
  let gazeY = 0;
  if (landmarks.length >= 478) {
    // Left iris position relative to eye bounds
    const leftIris = lm[FACE_LANDMARKS.LEFT_IRIS];
    const leftEyeLeft = lm[FACE_LANDMARKS.LEFT_EYE_OUTER];
    const leftEyeRight = lm[FACE_LANDMARKS.LEFT_EYE_INNER];
    const leftEyeUp = lm[FACE_LANDMARKS.LEFT_EYE_TOP];
    const leftEyeDown = lm[FACE_LANDMARKS.LEFT_EYE_BOTTOM];

    const irisXRatio = (leftIris.x - leftEyeLeft.x) / (leftEyeRight.x - leftEyeLeft.x + 0.001);
    const irisYRatio = (leftIris.y - leftEyeUp.y) / (leftEyeDown.y - leftEyeUp.y + 0.001);

    gazeX = clamp((irisXRatio - 0.5) * 2, -1, 1);
    gazeY = clamp((irisYRatio - 0.5) * 2, -1, 1);
  }

  return {
    jawOpen,
    leftBlink,
    rightBlink,
    leftBrowRaise,
    rightBrowRaise,
    browFurrow,
    smile,
    pucker,
    mouthWidth: mouthWidth / refDist,
    headYaw,
    headPitch,
    headRoll,
    gazeX,
    gazeY,
  };
}

// ─────────────────────────────────────────────────────────────
// AVATAR FACE MAPPER
// Maps expressions → bones (Mixamo) + morph targets (ARKit)
// ─────────────────────────────────────────────────────────────

/**
 * Apply facial expressions to a Three.js avatar.
 * Supports both bone-based (Mixamo) and morph-target (blendshape) rigs.
 *
 * @param {Object} avatar - Three.js scene/group
 * @param {Object} expressions - Output from extractExpressions()
 * @param {Object} options - { smoothing: 0.3 } for temporal blending
 */
const _prevApplied = {};

export function applyFaceToAvatar(avatar, expressions, options = {}) {
  if (!avatar || !expressions) return;

  const smooth = options.smoothing || 0.3;

  // Helper: find bone by trying multiple name formats
  const findBone = (names) => {
    for (const name of names) {
      const bone = avatar.getObjectByName(name);
      if (bone) return bone;
    }
    return null;
  };

  // Helper: smoothed value application
  const smoothVal = (key, target) => {
    const prev = _prevApplied[key] || target;
    const result = lerp(prev, target, 1 - smooth);
    _prevApplied[key] = result;
    return result;
  };

  // ── Head (split 60% head, 40% neck for natural movement) ──
  const head = findBone(['mixamorig:Head', 'mixamorigHead', 'Head']);
  if (head) {
    head.rotation.x = smoothVal('headPitchH', -expressions.headPitch * 0.6);
    head.rotation.y = smoothVal('headYawH', expressions.headYaw * 0.6);
    head.rotation.z = smoothVal('headRollH', -expressions.headRoll * 0.6);
  }

  const neck = findBone(['mixamorig:Neck', 'mixamorigNeck', 'Neck']);
  if (neck) {
    neck.rotation.x = smoothVal('headPitchN', -expressions.headPitch * 0.4);
    neck.rotation.y = smoothVal('headYawN', expressions.headYaw * 0.4);
    neck.rotation.z = smoothVal('headRollN', -expressions.headRoll * 0.3);
  }

  // ── Jaw ──
  const jaw = findBone(['mixamorig:Jaw', 'mixamorigJaw', 'Jaw']);
  if (jaw) {
    jaw.rotation.x = smoothVal('jaw', expressions.jawOpen * 0.3);
  }

  // ── Eye bones (some rigs have these) ──
  const leftEye = findBone(['mixamorig:LeftEye', 'mixamorigLeftEye', 'LeftEye']);
  if (leftEye) {
    leftEye.rotation.x = smoothVal('leftEyeY', -expressions.gazeY * 0.15);
    leftEye.rotation.y = smoothVal('leftEyeX', expressions.gazeX * 0.2);
  }

  const rightEye = findBone(['mixamorig:RightEye', 'mixamorigRightEye', 'RightEye']);
  if (rightEye) {
    rightEye.rotation.x = smoothVal('rightEyeY', -expressions.gazeY * 0.15);
    rightEye.rotation.y = smoothVal('rightEyeX', expressions.gazeX * 0.2);
  }

  // ── Morph Targets (blendshapes) ──
  // Maps to ARKit naming convention (used by Ready Player Me, Apple, etc.)
  avatar.traverse((child) => {
    if (!child.isMesh || !child.morphTargetDictionary || !child.morphTargetInfluences) return;

    const dict = child.morphTargetDictionary;
    const influences = child.morphTargetInfluences;

    const morphMap = {
      // Jaw
      jawOpen: expressions.jawOpen,
      mouthOpen: expressions.jawOpen,

      // Eyes
      eyeBlinkLeft: expressions.leftBlink,
      eyeBlinkRight: expressions.rightBlink,
      eyeSquintLeft: expressions.smile * 0.3,
      eyeSquintRight: expressions.smile * 0.3,
      eyeWideLeft: expressions.leftBrowRaise * 0.5,
      eyeWideRight: expressions.rightBrowRaise * 0.5,

      // Gaze
      eyeLookUpLeft: clamp(-expressions.gazeY, 0, 1),
      eyeLookUpRight: clamp(-expressions.gazeY, 0, 1),
      eyeLookDownLeft: clamp(expressions.gazeY, 0, 1),
      eyeLookDownRight: clamp(expressions.gazeY, 0, 1),
      eyeLookInLeft: clamp(expressions.gazeX, 0, 1),
      eyeLookOutLeft: clamp(-expressions.gazeX, 0, 1),
      eyeLookInRight: clamp(-expressions.gazeX, 0, 1),
      eyeLookOutRight: clamp(expressions.gazeX, 0, 1),

      // Brows
      browInnerUp: (expressions.leftBrowRaise + expressions.rightBrowRaise) / 2,
      browOuterUpLeft: expressions.leftBrowRaise,
      browOuterUpRight: expressions.rightBrowRaise,
      browDownLeft: expressions.browFurrow,
      browDownRight: expressions.browFurrow,

      // Mouth
      mouthSmileLeft: expressions.smile,
      mouthSmileRight: expressions.smile,
      mouthPucker: expressions.pucker,
      mouthFunnel: expressions.pucker * 0.5,
      mouthLeft: expressions.headYaw > 0.1 ? expressions.headYaw * 0.2 : 0,
      mouthRight: expressions.headYaw < -0.1 ? -expressions.headYaw * 0.2 : 0,
    };

    for (const [shapeName, value] of Object.entries(morphMap)) {
      if (dict[shapeName] !== undefined) {
        const smoothed = smoothVal(`morph_${shapeName}`, value);
        influences[dict[shapeName]] = smoothed;
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FACE CAPTURE COMPONENT
// ─────────────────────────────────────────────────────────────

const FacialCaptureSystem = ({
  onFaceFrame = null,           // Callback each frame: (expressions) => {}
  showPreview = true,           // Show webcam + mesh overlay
  showDebugBars = true,         // Show expression level bars
  showSnapshot = false,         // Show numeric expression chips
  initialSensitivity = 'medium',
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const faceMeshRef = useRef(null);
  const cameraInstanceRef = useRef(null);
  const recordingRef = useRef([]);
  const startTimeRef = useRef(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [expressions, setExpressions] = useState(null);
  const [fps, setFps] = useState(0);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [error, setError] = useState(null);
  const [sensitivity, setSensitivity] = useState(initialSensitivity);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrameCount, setRecordedFrameCount] = useState(0);
  const [showMesh, setShowMesh] = useState(true);

  const fpsRef = useRef({ frames: 0, lastTime: performance.now() / 1000 });

  // ── Start Face Capture ──
  const startCapture = useCallback(async () => {
    try {
      setError(null);

      // Request webcam access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Dynamically import MediaPipe (lazy load — saves initial bundle size)
      const { FaceMesh } = await import('@mediapipe/face_mesh');
      const { Camera } = await import('@mediapipe/camera_utils');

      const faceMesh = new FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });

      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,          // 478 landmarks (includes iris)
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      faceMesh.onResults(handleFaceMeshResults);
      faceMeshRef.current = faceMesh;

      // Start camera feed loop
      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMeshRef.current && videoRef.current) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480,
      });

      await camera.start();
      cameraInstanceRef.current = camera;
      setIsCapturing(true);
    } catch (err) {
      console.error('[FaceCap] Start failed:', err);
      setError(`Camera access failed: ${err.message}. Check browser permissions.`);
    }
  }, []);

  // ── Handle Face Mesh Results ──
  const handleFaceMeshResults = useCallback((results) => {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      setLandmarkCount(0);
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];
    setLandmarkCount(landmarks.length);

    // Extract expressions using current sensitivity
    const expr = extractExpressions(landmarks, SENSITIVITY_PRESETS[sensitivity] || SENSITIVITY_PRESETS.medium);

    if (expr) {
      setExpressions(expr);

      // Pass to parent
      if (onFaceFrame) onFaceFrame(expr);

      // Recording
      if (isRecording && startTimeRef.current) {
        const time = (performance.now() - startTimeRef.current) / 1000;
        recordingRef.current.push({ time, ...expr });
        setRecordedFrameCount(recordingRef.current.length);
      }
    }

    // Draw mesh overlay on canvas
    if (showPreview && showMesh && canvasRef.current && videoRef.current) {
      drawFacePreview(canvasRef.current, videoRef.current, landmarks);
    }

    // FPS tracking
    fpsRef.current.frames++;
    const now = performance.now() / 1000;
    const elapsed = now - fpsRef.current.lastTime;
    if (elapsed >= 1.0) {
      setFps(Math.round(fpsRef.current.frames / elapsed));
      fpsRef.current = { frames: 0, lastTime: now };
    }
  }, [sensitivity, isRecording, showPreview, showMesh, onFaceFrame]);

  // ── Stop Capture ──
  const stopCapture = useCallback(() => {
    // Stop all video tracks
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    faceMeshRef.current = null;
    cameraInstanceRef.current = null;
    setIsCapturing(false);
    setExpressions(null);
    setLandmarkCount(0);
  }, []);

  // ── Recording Controls ──
  const startRecording = useCallback(() => {
    recordingRef.current = [];
    startTimeRef.current = performance.now();
    setIsRecording(true);
    setRecordedFrameCount(0);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    const count = recordingRef.current.length;
    setRecordedFrameCount(count);
    console.log(`[FaceCap] Recorded ${count} expression frames`);
  }, []);

  const exportRecording = useCallback(() => {
    if (recordingRef.current.length === 0) return;

    const data = {
      type: 'facial_capture',
      version: '1.0',
      frameCount: recordingRef.current.length,
      duration: recordingRef.current[recordingRef.current.length - 1]?.time || 0,
      sensitivity,
      frames: recordingRef.current,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `face_capture_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sensitivity]);

  // ── Draw face mesh overlay ──
  function drawFacePreview(canvas, video, landmarks) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Draw mirrored webcam feed
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // Draw landmark dots
    ctx.fillStyle = 'rgba(74, 222, 128, 0.6)';
    for (const lm of landmarks) {
      const x = (1 - lm.x) * canvas.width;
      const y = lm.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Draw key feature outlines (eyes, mouth, brows)
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
    ctx.lineWidth = 1;

    // Left eye outline
    drawLandmarkLoop(ctx, landmarks, canvas, [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]);
    // Right eye outline
    drawLandmarkLoop(ctx, landmarks, canvas, [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]);
    // Mouth outline
    drawLandmarkLoop(ctx, landmarks, canvas, [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]);
  }

  function drawLandmarkLoop(ctx, landmarks, canvas, indices) {
    if (indices.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < indices.length; i++) {
      const lm = landmarks[indices[i]];
      if (!lm) continue;
      const x = (1 - lm.x) * canvas.width;
      const y = lm.y * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => stopCapture();
  }, [stopCapture]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="face-capture">
      {/* Preview Area */}
      <div className="face-capture__preview">
        <video ref={videoRef} muted playsInline className="face-capture__video" />

        {showPreview && isCapturing ? (
          <canvas ref={canvasRef} className="face-capture__canvas" />
        ) : !isCapturing ? (
          <div className="face-capture__placeholder">
            <span className="face-capture__placeholder-icon">🎭</span>
            <span>Click "Start Face Capture" to begin</span>
          </div>
        ) : null}

        {/* Status Bar */}
        {isCapturing && (
          <div className="face-capture__status">
            <span className={`face-capture__dot ${landmarkCount > 400 ? 'face-capture__dot--active' : 'face-capture__dot--inactive'}`} />
            <span>{fps} FPS</span>
            <span>{landmarkCount > 0 ? '😊 Face tracked' : '🔍 Searching...'}</span>
            <span className="face-capture__landmark-count">
              {landmarkCount} landmarks
            </span>
            {isRecording && (
              <span className="face-capture__recording-badge">
                ● REC {recordedFrameCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="face-capture__controls">
        {!isCapturing ? (
          <button onClick={startCapture} className="face-capture__btn face-capture__btn--start">
            🎭 Start Face Capture
          </button>
        ) : (
          <button onClick={stopCapture} className="face-capture__btn face-capture__btn--stop">
            ■ Stop Face Capture
          </button>
        )}

        {isCapturing && !isRecording && (
          <button onClick={startRecording} className="face-capture__btn face-capture__btn--secondary">
            ⏺ Record Expressions
          </button>
        )}

        {isRecording && (
          <button onClick={stopRecording} className="face-capture__btn face-capture__btn--stop">
            ⏹ Stop Recording
          </button>
        )}

        {recordedFrameCount > 0 && !isRecording && (
          <button onClick={exportRecording} className="face-capture__btn face-capture__btn--secondary">
            💾 Export ({recordedFrameCount} frames)
          </button>
        )}
      </div>

      {/* Settings */}
      <div className="face-capture__settings">
        <label className="face-capture__checkbox-label">
          <input
            type="checkbox"
            checked={showMesh}
            onChange={(e) => setShowMesh(e.target.checked)}
          />
          Show mesh overlay
        </label>

        <label className="face-capture__checkbox-label">
          Sensitivity:
          <select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value)}
            className="face-capture__select"
          >
            {Object.entries(SENSITIVITY_PRESETS).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label} — {preset.description}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Expression Debug Bars */}
      {showDebugBars && expressions && (
        <div className="face-capture__debug-panel">
          <div className="face-capture__debug-title">Expression Channels</div>
          <ExpressionBar label="Jaw Open" value={expressions.jawOpen} colorClass="face-capture__bar-fill--jaw" />
          <ExpressionBar label="L Eye Blink" value={expressions.leftBlink} colorClass="face-capture__bar-fill--eye" />
          <ExpressionBar label="R Eye Blink" value={expressions.rightBlink} colorClass="face-capture__bar-fill--eye" />
          <ExpressionBar label="L Brow Raise" value={expressions.leftBrowRaise} colorClass="face-capture__bar-fill--brow" />
          <ExpressionBar label="R Brow Raise" value={expressions.rightBrowRaise} colorClass="face-capture__bar-fill--brow" />
          <ExpressionBar label="Brow Furrow" value={expressions.browFurrow} colorClass="face-capture__bar-fill--brow" />
          <ExpressionBar label="Smile" value={expressions.smile} colorClass="face-capture__bar-fill--smile" />
          <ExpressionBar label="Pucker" value={expressions.pucker} colorClass="face-capture__bar-fill--pucker" />
          <ExpressionBar label="Head Yaw" value={expressions.headYaw + 0.5} colorClass="face-capture__bar-fill--head" />
          <ExpressionBar label="Head Pitch" value={expressions.headPitch + 0.5} colorClass="face-capture__bar-fill--head" />
          <ExpressionBar label="Head Roll" value={expressions.headRoll + 0.5} colorClass="face-capture__bar-fill--head" />
          <ExpressionBar label="Gaze X" value={expressions.gazeX + 0.5} colorClass="face-capture__bar-fill--eye" />
          <ExpressionBar label="Gaze Y" value={expressions.gazeY + 0.5} colorClass="face-capture__bar-fill--eye" />
        </div>
      )}

      {/* Expression Snapshot Chips */}
      {showSnapshot && expressions && (
        <div className="face-capture__snapshot">
          <ExpressionChip label="Jaw" value={expressions.jawOpen} />
          <ExpressionChip label="L Blink" value={expressions.leftBlink} />
          <ExpressionChip label="R Blink" value={expressions.rightBlink} />
          <ExpressionChip label="Smile" value={expressions.smile} />
          <ExpressionChip label="Pucker" value={expressions.pucker} />
          <ExpressionChip label="L Brow" value={expressions.leftBrowRaise} />
          <ExpressionChip label="R Brow" value={expressions.rightBrowRaise} />
          <ExpressionChip label="Furrow" value={expressions.browFurrow} />
        </div>
      )}

      {/* Error */}
      {error && <div className="face-capture__error">{error}</div>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

const ExpressionBar = ({ label, value, colorClass }) => (
  <div className="face-capture__bar-row">
    <span className="face-capture__bar-label">{label}</span>
    <div className="face-capture__bar-track">
      <div
        className={`face-capture__bar-fill ${colorClass}`}
        style={{ width: `${clamp(value || 0, 0, 1) * 100}%` }}
      />
    </div>
    <span className="face-capture__bar-value">{(value || 0).toFixed(2)}</span>
  </div>
);

const ExpressionChip = ({ label, value }) => (
  <div className="face-capture__chip">
    <span className="face-capture__chip-label">{label}</span>
    <span className={`face-capture__chip-value ${value > 0.5 ? 'face-capture__chip-value--active' : 'face-capture__chip-value--inactive'}`}>
      {(value || 0).toFixed(1)}
    </span>
  </div>
);

export default FacialCaptureSystem;
export { extractExpressions, applyFaceToAvatar, FACE_LANDMARKS, SENSITIVITY_PRESETS };