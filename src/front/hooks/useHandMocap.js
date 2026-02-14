// src/front/js/hooks/useHandMocap.js
// Custom hook for real-time hand motion capture using MediaPipe Hands
// Tracks: 21 landmarks per hand, finger curl/extension, pinch, spread, wrist rotation

import { useRef, useState, useCallback } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

// MediaPipe hand landmark indices
const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// Finger groups for easy iteration
const FINGERS = {
  thumb:  { mcp: 2, pip: 3, tip: 4, base: 1 },
  index:  { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring:   { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky:  { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

// Calculate distance between two landmarks
const dist = (a, b) => {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
};

// Calculate angle between three points (in radians)
const angleBetween = (a, b, c) => {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2 + ab.z ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2 + cb.z ** 2);
  
  if (magAB === 0 || magCB === 0) return 0;
  return Math.acos(Math.min(Math.max(dot / (magAB * magCB), -1), 1));
};

// Calculate finger curl amount (0 = fully extended, 1 = fully curled)
const getFingerCurl = (landmarks, fingerName) => {
  const finger = FINGERS[fingerName];
  const wrist = landmarks[LANDMARKS.WRIST];

  if (fingerName === "thumb") {
    // Thumb curl: distance from thumb tip to index MCP relative to palm size
    const palmSize = dist(wrist, landmarks[LANDMARKS.MIDDLE_MCP]);
    const thumbExtension = dist(landmarks[finger.tip], landmarks[LANDMARKS.INDEX_MCP]);
    return Math.min(Math.max(1 - (thumbExtension / palmSize), 0), 1);
  }

  // For other fingers: angle at PIP joint
  const angle = angleBetween(
    landmarks[finger.mcp],
    landmarks[finger.pip],
    landmarks[finger.dip || finger.tip]
  );

  // Straight finger ≈ π (3.14), fully curled ≈ π/3 (1.05)
  const curl = 1 - ((angle - 1.0) / 2.1);
  return Math.min(Math.max(curl, 0), 1);
};

// Check if finger is extended (not curled)
const isFingerExtended = (landmarks, fingerName) => {
  return getFingerCurl(landmarks, fingerName) < 0.4;
};

// Detect pinch between thumb and a finger
const getPinchStrength = (landmarks, fingerName) => {
  const finger = FINGERS[fingerName];
  const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
  const fingerTip = landmarks[finger.tip];
  const palmSize = dist(landmarks[LANDMARKS.WRIST], landmarks[LANDMARKS.MIDDLE_MCP]);

  const pinchDist = dist(thumbTip, fingerTip);
  const normalized = pinchDist / palmSize;

  // Close = 1, far = 0
  return Math.min(Math.max(1 - (normalized / 0.6), 0), 1);
};

// Get finger spread (how far apart fingers are)
const getFingerSpread = (landmarks) => {
  const indexTip = landmarks[LANDMARKS.INDEX_TIP];
  const pinkyTip = landmarks[LANDMARKS.PINKY_TIP];
  const palmSize = dist(landmarks[LANDMARKS.WRIST], landmarks[LANDMARKS.MIDDLE_MCP]);

  const spread = dist(indexTip, pinkyTip) / palmSize;
  return Math.min(Math.max((spread - 0.3) / 0.7, 0), 1);
};

// Get wrist rotation
const getWristRotation = (landmarks) => {
  const wrist = landmarks[LANDMARKS.WRIST];
  const middleMcp = landmarks[LANDMARKS.MIDDLE_MCP];
  const indexMcp = landmarks[LANDMARKS.INDEX_MCP];
  const pinkyMcp = landmarks[LANDMARKS.PINKY_MCP];

  // Wrist pitch (up/down)
  const pitch = Math.atan2(middleMcp.y - wrist.y, middleMcp.z - wrist.z);

  // Wrist yaw (left/right)
  const yaw = Math.atan2(middleMcp.x - wrist.x, middleMcp.y - wrist.y);

  // Wrist roll (rotation) - based on index-pinky line angle
  const roll = Math.atan2(pinkyMcp.y - indexMcp.y, pinkyMcp.x - indexMcp.x);

  return { pitch, yaw, roll };
};

// Detect common gestures
const detectGesture = (landmarks) => {
  const thumbExt = isFingerExtended(landmarks, "thumb");
  const indexExt = isFingerExtended(landmarks, "index");
  const middleExt = isFingerExtended(landmarks, "middle");
  const ringExt = isFingerExtended(landmarks, "ring");
  const pinkyExt = isFingerExtended(landmarks, "pinky");

  const indexPinch = getPinchStrength(landmarks, "index");

  // Fist: all fingers curled
  if (!thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt) return "fist";

  // Open hand: all fingers extended
  if (indexExt && middleExt && ringExt && pinkyExt) return "open";

  // Point: only index extended
  if (indexExt && !middleExt && !ringExt && !pinkyExt) return "point";

  // Peace: index + middle extended
  if (indexExt && middleExt && !ringExt && !pinkyExt) return "peace";

  // Thumbs up: only thumb extended, hand roughly vertical
  if (thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt) return "thumbs_up";

  // Rock: index + pinky extended
  if (indexExt && !middleExt && !ringExt && pinkyExt) return "rock";

  // Pinch: thumb and index close together
  if (indexPinch > 0.7) return "pinch";

  // Three: index + middle + ring
  if (indexExt && middleExt && ringExt && !pinkyExt) return "three";

  return "unknown";
};

// Extract all hand data from landmarks
const extractHandData = (landmarks, handedness) => {
  if (!landmarks || landmarks.length < 21) return null;

  const wristRotation = getWristRotation(landmarks);

  return {
    // Hand identity
    handedness, // "Left" or "Right"

    // Wrist position (normalized 0-1)
    wristX: landmarks[LANDMARKS.WRIST].x,
    wristY: landmarks[LANDMARKS.WRIST].y,
    wristZ: landmarks[LANDMARKS.WRIST].z,

    // Wrist rotation
    wristPitch: wristRotation.pitch,
    wristYaw: wristRotation.yaw,
    wristRoll: wristRotation.roll,

    // Finger curl values (0 = extended, 1 = curled)
    thumbCurl: getFingerCurl(landmarks, "thumb"),
    indexCurl: getFingerCurl(landmarks, "index"),
    middleCurl: getFingerCurl(landmarks, "middle"),
    ringCurl: getFingerCurl(landmarks, "ring"),
    pinkyCurl: getFingerCurl(landmarks, "pinky"),

    // Pinch detection (0 = no pinch, 1 = full pinch)
    indexPinch: getPinchStrength(landmarks, "index"),
    middlePinch: getPinchStrength(landmarks, "middle"),
    ringPinch: getPinchStrength(landmarks, "ring"),

    // Spread (how far fingers are apart)
    fingerSpread: getFingerSpread(landmarks),

    // Gesture detection
    gesture: detectGesture(landmarks),

    // All 21 raw landmarks for advanced use
    rawLandmarks: landmarks.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
    })),
  };
};

// Smoothing helpers
const smoothValue = (prev, next, factor = 0.4) => {
  if (prev === null || prev === undefined) return next;
  return prev * (1 - factor) + next * factor;
};

const smoothHandData = (prev, next, factor = 0.4) => {
  if (!prev) return next;
  if (!next) return prev;

  return {
    ...next,
    wristX: smoothValue(prev.wristX, next.wristX, factor),
    wristY: smoothValue(prev.wristY, next.wristY, factor),
    wristZ: smoothValue(prev.wristZ, next.wristZ, factor),
    wristPitch: smoothValue(prev.wristPitch, next.wristPitch, factor),
    wristYaw: smoothValue(prev.wristYaw, next.wristYaw, factor),
    wristRoll: smoothValue(prev.wristRoll, next.wristRoll, factor),
    thumbCurl: smoothValue(prev.thumbCurl, next.thumbCurl, factor),
    indexCurl: smoothValue(prev.indexCurl, next.indexCurl, factor),
    middleCurl: smoothValue(prev.middleCurl, next.middleCurl, factor),
    ringCurl: smoothValue(prev.ringCurl, next.ringCurl, factor),
    pinkyCurl: smoothValue(prev.pinkyCurl, next.pinkyCurl, factor),
    indexPinch: smoothValue(prev.indexPinch, next.indexPinch, factor),
    middlePinch: smoothValue(prev.middlePinch, next.middlePinch, factor),
    ringPinch: smoothValue(prev.ringPinch, next.ringPinch, factor),
    fingerSpread: smoothValue(prev.fingerSpread, next.fingerSpread, factor),
    rawLandmarks: next.rawLandmarks.map((lm, i) => ({
      x: prev.rawLandmarks?.[i] ? smoothValue(prev.rawLandmarks[i].x, lm.x, factor) : lm.x,
      y: prev.rawLandmarks?.[i] ? smoothValue(prev.rawLandmarks[i].y, lm.y, factor) : lm.y,
      z: prev.rawLandmarks?.[i] ? smoothValue(prev.rawLandmarks[i].z, lm.z, factor) : lm.z,
    })),
  };
};

// Main hook
const useHandMocap = () => {
  const [handData, setHandData] = useState({ left: null, right: null });
  const [isTracking, setIsTracking] = useState(false);
  const prevDataRef = useRef({ left: null, right: null });
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  const startTracking = useCallback((videoElement) => {
    if (!videoElement) return;

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      const newData = { left: null, right: null };

      if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks, i) => {
          const handedness = results.multiHandedness[i]?.label; // "Left" or "Right"
          // MediaPipe mirrors the image, so labels are swapped
          const key = handedness === "Left" ? "right" : "left";

          const raw = extractHandData(landmarks, handedness);
          const smoothed = smoothHandData(prevDataRef.current[key], raw, 0.4);
          newData[key] = smoothed;
        });
      }

      prevDataRef.current = newData;
      setHandData(newData);
    });

    handsRef.current = hands;

    const camera = new Camera(videoElement, {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });

    camera.start();
    cameraRef.current = camera;
    setIsTracking(true);
  }, []);

  const stopTracking = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    setIsTracking(false);
    setHandData({ left: null, right: null });
  }, []);

  return { handData, isTracking, startTracking, stopTracking };
};

export default useHandMocap;
export { LANDMARKS, FINGERS, extractHandData, detectGesture };