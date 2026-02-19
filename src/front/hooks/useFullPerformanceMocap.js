// src/front/js/hooks/useFullPerformanceMocap.js
//
// Unified hook for full performance capture.
// Runs MediaPipe Pose (33 body landmarks), FaceMesh (478 face landmarks),
// and Hands (21 landmarks × 2 hands) simultaneously on a SINGLE shared
// video stream. Merges all outputs into one unified data object per frame.
//
// Usage:
//   const {
//     bodyData, faceData, handData,
//     isTracking, fps, activeModules,
//     start, stop,
//   } = useFullPerformanceMocap(videoRef, {
//     enableBody: true, enableFace: true, enableHands: true,
//   });

import { useRef, useState, useCallback, useEffect } from "react";
import { Pose } from "@mediapipe/pose";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Hands } from "@mediapipe/hands";

// ============================================================
// Smoothing Helper
// ============================================================

const smoothValue = (prev, next, factor = 0.4) => {
  if (prev === null || prev === undefined) return next;
  return prev + (next - prev) * factor;
};

const smoothLandmarks = (prev, next, factor = 0.4) => {
  if (!prev || !next) return next;
  return next.map((lm, i) => ({
    x: prev[i] ? smoothValue(prev[i].x, lm.x, factor) : lm.x,
    y: prev[i] ? smoothValue(prev[i].y, lm.y, factor) : lm.y,
    z: prev[i] ? smoothValue(prev[i].z, lm.z, factor) : lm.z,
    visibility: lm.visibility,
  }));
};

// ============================================================
// Face Expression Extraction
// ============================================================

const extractFaceExpressions = (landmarks) => {
  if (!landmarks || landmarks.length < 468) return null;

  // Key landmark indices for expressions
  const leftEyeTop = landmarks[159];
  const leftEyeBottom = landmarks[145];
  const rightEyeTop = landmarks[386];
  const rightEyeBottom = landmarks[374];
  const mouthTop = landmarks[13];
  const mouthBottom = landmarks[14];
  const mouthLeft = landmarks[61];
  const mouthRight = landmarks[291];
  const leftBrowInner = landmarks[107];
  const leftBrowOuter = landmarks[70];
  const rightBrowInner = landmarks[336];
  const rightBrowOuter = landmarks[300];
  const noseTip = landmarks[1];
  const chin = landmarks[152];
  const forehead = landmarks[10];

  // Face height for normalization
  const faceHeight = Math.abs(forehead.y - chin.y) || 0.001;

  // Eye openness (0 = closed, 1 = fully open)
  const leftEyeOpen = Math.abs(leftEyeTop.y - leftEyeBottom.y) / faceHeight;
  const rightEyeOpen = Math.abs(rightEyeTop.y - rightEyeBottom.y) / faceHeight;

  // Mouth
  const mouthOpenY = Math.abs(mouthTop.y - mouthBottom.y) / faceHeight;
  const mouthWidth = Math.abs(mouthLeft.x - mouthRight.x) / faceHeight;

  // Eyebrows (higher = raised)
  const leftBrowHeight = (leftEyeTop.y - leftBrowInner.y) / faceHeight;
  const rightBrowHeight = (rightEyeTop.y - rightBrowInner.y) / faceHeight;

  // Head rotation estimates from nose position relative to face center
  const faceCenterX = (landmarks[234].x + landmarks[454].x) / 2;
  const faceCenterY = (forehead.y + chin.y) / 2;
  const headYaw = (noseTip.x - faceCenterX) * 3;
  const headPitch = (noseTip.y - faceCenterY) * 3;

  // Head tilt from eye positions
  const headRoll = Math.atan2(
    rightEyeTop.y - leftEyeTop.y,
    rightEyeTop.x - leftEyeTop.x
  );

  return {
    leftEyeOpen: Math.min(leftEyeOpen * 8, 1),
    rightEyeOpen: Math.min(rightEyeOpen * 8, 1),
    mouthOpen: Math.min(mouthOpenY * 5, 1),
    mouthWidth: Math.min(mouthWidth * 3, 1),
    mouthSmile: mouthWidth > 0.25 ? Math.min((mouthWidth - 0.25) * 4, 1) : 0,
    leftBrowHeight: Math.min(leftBrowHeight * 6, 1),
    rightBrowHeight: Math.min(rightBrowHeight * 6, 1),
    headYaw,
    headPitch,
    headRoll,
    rawLandmarks: landmarks,
  };
};

// ============================================================
// Hand Data Extraction
// ============================================================

const FINGERS = {
  thumb: { mcp: 2, pip: 3, tip: 4, base: 1 },
  index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
  middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
  ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
  pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 },
};

const dist3D = (a, b) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

const angleBetween = (a, b, c) => {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dotVal = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2 + ab.z ** 2);
  const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2 + cb.z ** 2);
  if (magAB === 0 || magCB === 0) return 0;
  return Math.acos(Math.min(Math.max(dotVal / (magAB * magCB), -1), 1));
};

const getFingerCurl = (landmarks, fingerName) => {
  const finger = FINGERS[fingerName];
  const wrist = landmarks[0];

  if (fingerName === "thumb") {
    const angle = angleBetween(landmarks[finger.base], landmarks[finger.mcp], landmarks[finger.tip]);
    return 1 - angle / Math.PI;
  }

  const angle = angleBetween(landmarks[finger.mcp], landmarks[finger.pip], landmarks[finger.tip]);
  return 1 - angle / Math.PI;
};

const detectGesture = (curls) => {
  const { thumbCurl, indexCurl, middleCurl, ringCurl, pinkyCurl } = curls;
  const allCurled = indexCurl > 0.6 && middleCurl > 0.6 && ringCurl > 0.6 && pinkyCurl > 0.6;
  const allOpen = indexCurl < 0.4 && middleCurl < 0.4 && ringCurl < 0.4 && pinkyCurl < 0.4;

  if (allCurled && thumbCurl > 0.5) return "fist";
  if (allOpen && thumbCurl < 0.4) return "open";
  if (indexCurl < 0.3 && middleCurl > 0.6 && ringCurl > 0.6 && pinkyCurl > 0.6) return "point";
  if (indexCurl < 0.3 && middleCurl < 0.3 && ringCurl > 0.6 && pinkyCurl > 0.6) return "peace";
  if (thumbCurl < 0.3 && allCurled) return "thumbs_up";
  if (indexCurl < 0.3 && pinkyCurl < 0.3 && middleCurl > 0.6 && ringCurl > 0.6) return "rock";
  return "neutral";
};

const extractHandData = (landmarks) => {
  const curls = {
    thumbCurl: getFingerCurl(landmarks, "thumb"),
    indexCurl: getFingerCurl(landmarks, "index"),
    middleCurl: getFingerCurl(landmarks, "middle"),
    ringCurl: getFingerCurl(landmarks, "ring"),
    pinkyCurl: getFingerCurl(landmarks, "pinky"),
  };

  const gesture = detectGesture(curls);

  // Pinch detection (thumb tip to index tip distance)
  const indexPinch = 1 - Math.min(dist3D(landmarks[4], landmarks[8]) * 8, 1);

  // Finger spread (average distance between adjacent fingertips)
  const tipDists = [
    dist3D(landmarks[8], landmarks[12]),
    dist3D(landmarks[12], landmarks[16]),
    dist3D(landmarks[16], landmarks[20]),
  ];
  const fingerSpread = tipDists.reduce((a, b) => a + b, 0) / tipDists.length;

  return {
    ...curls,
    gesture,
    indexPinch,
    fingerSpread: Math.min(fingerSpread * 5, 1),
    rawLandmarks: landmarks,
  };
};

// ============================================================
// Main Hook
// ============================================================

export default function useFullPerformanceMocap(videoRef, options = {}) {
  const {
    enableBody = true,
    enableFace = true,
    enableHands = true,
  } = options;

  // Output state
  const [bodyData, setBodyData] = useState(null);
  const [faceData, setFaceData] = useState(null);
  const [handData, setHandData] = useState({ left: null, right: null });
  const [isTracking, setIsTracking] = useState(false);
  const [fps, setFps] = useState(0);
  const [activeModules, setActiveModules] = useState({
    body: false,
    face: false,
    hands: false,
  });

  // Smoothing refs
  const prevBodyRef = useRef(null);
  const prevFaceRef = useRef(null);
  const prevHandsRef = useRef({ left: null, right: null });

  // MediaPipe instance refs
  const poseRef = useRef(null);
  const faceMeshRef = useRef(null);
  const handsRef = useRef(null);

  // Frame loop refs
  const animFrameRef = useRef(null);
  const fpsRef = useRef({ frames: 0, lastTime: Date.now() });
  const isTrackingRef = useRef(false);

  // ============================================================
  // Initialize MediaPipe instances
  // ============================================================

  const initPose = useCallback(async () => {
    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      if (results.poseLandmarks) {
        const smoothed = smoothLandmarks(
          prevBodyRef.current,
          results.poseLandmarks,
          0.4
        );
        prevBodyRef.current = smoothed;
        setBodyData({
          landmarks: smoothed,
          worldLandmarks: results.poseWorldLandmarks || null,
          timestamp: Date.now(),
        });
        setActiveModules((prev) => ({ ...prev, body: true }));
      }
    });

    await pose.initialize();
    poseRef.current = pose;
  }, []);

  const initFaceMesh = useCallback(async () => {
    const faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults((results) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const raw = extractFaceExpressions(results.multiFaceLandmarks[0]);
        if (raw) {
          // Smooth face expressions
          const prev = prevFaceRef.current;
          const smoothed = prev
            ? {
                leftEyeOpen: smoothValue(prev.leftEyeOpen, raw.leftEyeOpen, 0.4),
                rightEyeOpen: smoothValue(prev.rightEyeOpen, raw.rightEyeOpen, 0.4),
                mouthOpen: smoothValue(prev.mouthOpen, raw.mouthOpen, 0.4),
                mouthWidth: smoothValue(prev.mouthWidth, raw.mouthWidth, 0.4),
                mouthSmile: smoothValue(prev.mouthSmile, raw.mouthSmile, 0.4),
                leftBrowHeight: smoothValue(prev.leftBrowHeight, raw.leftBrowHeight, 0.4),
                rightBrowHeight: smoothValue(prev.rightBrowHeight, raw.rightBrowHeight, 0.4),
                headYaw: smoothValue(prev.headYaw, raw.headYaw, 0.3),
                headPitch: smoothValue(prev.headPitch, raw.headPitch, 0.3),
                headRoll: smoothValue(prev.headRoll, raw.headRoll, 0.3),
                rawLandmarks: raw.rawLandmarks,
              }
            : raw;

          prevFaceRef.current = smoothed;
          setFaceData(smoothed);
          setActiveModules((prev) => ({ ...prev, face: true }));
        }
      }
    });

    await faceMesh.initialize();
    faceMeshRef.current = faceMesh;
  }, []);

  const initHands = useCallback(async () => {
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
          const label = results.multiHandedness[i]?.label;
          // MediaPipe mirrors, so labels are swapped
          const key = label === "Left" ? "right" : "left";

          const raw = extractHandData(landmarks);

          // Smooth hand data
          const prev = prevHandsRef.current[key];
          const smoothed = prev
            ? {
                thumbCurl: smoothValue(prev.thumbCurl, raw.thumbCurl, 0.4),
                indexCurl: smoothValue(prev.indexCurl, raw.indexCurl, 0.4),
                middleCurl: smoothValue(prev.middleCurl, raw.middleCurl, 0.4),
                ringCurl: smoothValue(prev.ringCurl, raw.ringCurl, 0.4),
                pinkyCurl: smoothValue(prev.pinkyCurl, raw.pinkyCurl, 0.4),
                indexPinch: smoothValue(prev.indexPinch, raw.indexPinch, 0.4),
                fingerSpread: smoothValue(prev.fingerSpread, raw.fingerSpread, 0.4),
                gesture: raw.gesture,
                rawLandmarks: raw.rawLandmarks,
              }
            : raw;

          newData[key] = smoothed;
        });
      }

      prevHandsRef.current = newData;
      setHandData(newData);
      setActiveModules((prev) => ({ ...prev, hands: true }));
    });

    await hands.initialize();
    handsRef.current = hands;
  }, []);

  // ============================================================
  // Frame Processing Loop
  // ============================================================

  const processFrame = useCallback(async () => {
    const video = videoRef?.current;
    if (!video || !isTrackingRef.current) return;

    if (video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const imageData = { image: video };

    // Send frame to all active MediaPipe instances in parallel
    const promises = [];

    if (enableBody && poseRef.current) {
      promises.push(
        poseRef.current.send(imageData).catch((err) => {
          console.warn("Pose processing error:", err);
        })
      );
    }

    if (enableFace && faceMeshRef.current) {
      promises.push(
        faceMeshRef.current.send(imageData).catch((err) => {
          console.warn("FaceMesh processing error:", err);
        })
      );
    }

    if (enableHands && handsRef.current) {
      promises.push(
        handsRef.current.send(imageData).catch((err) => {
          console.warn("Hands processing error:", err);
        })
      );
    }

    await Promise.all(promises);

    // FPS counter
    fpsRef.current.frames++;
    const now = Date.now();
    if (now - fpsRef.current.lastTime >= 1000) {
      setFps(fpsRef.current.frames);
      fpsRef.current.frames = 0;
      fpsRef.current.lastTime = now;
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [enableBody, enableFace, enableHands, videoRef]);

  // ============================================================
  // Start / Stop
  // ============================================================

  const start = useCallback(async () => {
    const video = videoRef?.current;
    if (!video) {
      console.error("No video element ref provided");
      return;
    }

    // Request webcam
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      video.srcObject = stream;
      await video.play();
    } catch (err) {
      console.error("Failed to access webcam:", err);
      return;
    }

    // Initialize all enabled modules
    const initPromises = [];

    if (enableBody && !poseRef.current) {
      initPromises.push(initPose());
    }
    if (enableFace && !faceMeshRef.current) {
      initPromises.push(initFaceMesh());
    }
    if (enableHands && !handsRef.current) {
      initPromises.push(initHands());
    }

    await Promise.all(initPromises);

    // Start the frame loop
    isTrackingRef.current = true;
    setIsTracking(true);
    processFrame();
  }, [videoRef, enableBody, enableFace, enableHands, initPose, initFaceMesh, initHands, processFrame]);

  const stop = useCallback(() => {
    isTrackingRef.current = false;
    setIsTracking(false);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Stop webcam
    const video = videoRef?.current;
    if (video?.srcObject) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }

    // Close MediaPipe instances
    if (poseRef.current) {
      poseRef.current.close();
      poseRef.current = null;
    }
    if (faceMeshRef.current) {
      faceMeshRef.current.close();
      faceMeshRef.current = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }

    // Reset state
    setBodyData(null);
    setFaceData(null);
    setHandData({ left: null, right: null });
    setActiveModules({ body: false, face: false, hands: false });
    setFps(0);

    prevBodyRef.current = null;
    prevFaceRef.current = null;
    prevHandsRef.current = { left: null, right: null };
  }, [videoRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isTrackingRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (poseRef.current) poseRef.current.close();
      if (faceMeshRef.current) faceMeshRef.current.close();
      if (handsRef.current) handsRef.current.close();

      const video = videoRef?.current;
      if (video?.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [videoRef]);

  // ============================================================
  // Snapshot — get all current data as one object (for recording)
  // ============================================================

  const getSnapshot = useCallback(() => {
    return {
      timestamp: Date.now(),
      body: bodyData
        ? {
            landmarks: bodyData.landmarks.map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility,
            })),
          }
        : null,
      face: faceData
        ? {
            leftEyeOpen: faceData.leftEyeOpen,
            rightEyeOpen: faceData.rightEyeOpen,
            mouthOpen: faceData.mouthOpen,
            mouthWidth: faceData.mouthWidth,
            mouthSmile: faceData.mouthSmile,
            leftBrowHeight: faceData.leftBrowHeight,
            rightBrowHeight: faceData.rightBrowHeight,
            headYaw: faceData.headYaw,
            headPitch: faceData.headPitch,
            headRoll: faceData.headRoll,
          }
        : null,
      hands: {
        left: handData.left
          ? {
              thumbCurl: handData.left.thumbCurl,
              indexCurl: handData.left.indexCurl,
              middleCurl: handData.left.middleCurl,
              ringCurl: handData.left.ringCurl,
              pinkyCurl: handData.left.pinkyCurl,
              gesture: handData.left.gesture,
              indexPinch: handData.left.indexPinch,
              fingerSpread: handData.left.fingerSpread,
            }
          : null,
        right: handData.right
          ? {
              thumbCurl: handData.right.thumbCurl,
              indexCurl: handData.right.indexCurl,
              middleCurl: handData.right.middleCurl,
              ringCurl: handData.right.ringCurl,
              pinkyCurl: handData.right.pinkyCurl,
              gesture: handData.right.gesture,
              indexPinch: handData.right.indexPinch,
              fingerSpread: handData.right.fingerSpread,
            }
          : null,
      },
    };
  }, [bodyData, faceData, handData]);

  return {
    // Data outputs
    bodyData,
    faceData,
    handData,

    // State
    isTracking,
    fps,
    activeModules,

    // Controls
    start,
    stop,

    // Recording helper
    getSnapshot,
  };
}