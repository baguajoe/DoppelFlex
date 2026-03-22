// src/front/js/hooks/useAutoRig2D.js
// Auto-detect skeleton joints on a character illustration using MediaPipe Pose
// Falls back to manual joint placement if detection fails

import { useState, useCallback, useRef } from "react";

// MediaPipe Pose landmark indices mapped to our joint IDs
const LANDMARK_TO_JOINT = {
  0: "head_top",    // nose → approximate head top
  // We'll compute head_top from nose + offset
  152: "chin",       // chin landmark in face mesh (approximated)
  // Simplified: use nose(0) for head, offset up for head_top, offset down for chin
  11: "left_shoulder",
  12: "right_shoulder",
  13: "left_elbow",
  14: "right_elbow",
  15: "left_wrist",
  16: "right_wrist",
  23: "left_hip",
  24: "right_hip",
  25: "left_knee",
  26: "right_knee",
  27: "left_ankle",
  28: "right_ankle",
};

const useAutoRig2D = () => {
  const [status, setStatus] = useState("idle"); // idle | loading | detecting | success | failed
  const [detectedJoints, setDetectedJoints] = useState(null);
  const [confidence, setConfidence] = useState(0);
  const poseRef = useRef(null);

  // Initialize MediaPipe Pose (lazy load)
  const initPose = useCallback(async () => {
    if (poseRef.current) return poseRef.current;

    setStatus("loading");

    // Dynamic import to avoid loading at startup
    const { Pose } = await import("@mediapipe/pose");

    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 2, // Highest accuracy for static images
      smoothLandmarks: false, // No smoothing needed for single image
      enableSegmentation: false,
      minDetectionConfidence: 0.3, // Lower threshold for illustrated characters
      minTrackingConfidence: 0.3,
    });

    poseRef.current = pose;
    return pose;
  }, []);

  // Detect joints on an image element
  const detectJoints = useCallback(
    async (imageElement, canvasWidth, canvasHeight) => {
      try {
        setStatus("detecting");
        setDetectedJoints(null);

        const pose = await initPose();

        // Create a promise that resolves when we get results
        const results = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Detection timeout")), 15000);

          pose.onResults((res) => {
            clearTimeout(timeout);
            resolve(res);
          });

          // Draw image to a temp canvas for MediaPipe (needs video-like input)
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = imageElement.naturalWidth || imageElement.width;
          tempCanvas.height = imageElement.naturalHeight || imageElement.height;
          const tempCtx = tempCanvas.getContext("2d");
          tempCtx.drawImage(imageElement, 0, 0);

          pose.send({ image: tempCanvas }).catch(reject);
        });

        if (!results.poseLandmarks || results.poseLandmarks.length < 33) {
          setStatus("failed");
          return null;
        }

        const landmarks = results.poseLandmarks;

        // Calculate average visibility as confidence score
        const avgVisibility =
          landmarks.reduce((sum, lm) => sum + (lm.visibility || 0), 0) / landmarks.length;
        setConfidence(avgVisibility);

        // If too low confidence, mark as failed but still return what we got
        if (avgVisibility < 0.15) {
          setStatus("failed");
          return null;
        }

        // Map landmarks to our joint format (in canvas coordinates)
        const joints = {};

        // Nose landmark → derive head_top and chin
        const nose = landmarks[0];
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];

        // Head height estimate from ear-to-nose distance
        const headHeight = Math.abs(nose.y - ((leftEar.y + rightEar.y) / 2)) * 2.5;

        joints.head_top = {
          x: nose.x * canvasWidth,
          y: (nose.y - headHeight) * canvasHeight,
          auto: true,
          confidence: nose.visibility,
        };

        joints.chin = {
          x: nose.x * canvasWidth,
          y: (nose.y + headHeight * 0.4) * canvasHeight,
          auto: true,
          confidence: nose.visibility,
        };

        // Neck (midpoint between shoulders, slightly above)
        const ls = landmarks[11];
        const rs = landmarks[12];
        joints.neck = {
          x: ((ls.x + rs.x) / 2) * canvasWidth,
          y: ((ls.y + rs.y) / 2 - 0.01) * canvasHeight,
          auto: true,
          confidence: (ls.visibility + rs.visibility) / 2,
        };

        // Direct mappings
        const directMap = {
          left_shoulder: 11,
          right_shoulder: 12,
          left_elbow: 13,
          right_elbow: 14,
          left_wrist: 15,
          right_wrist: 16,
          left_hip: 23,
          right_hip: 24,
          left_knee: 25,
          right_knee: 26,
          left_ankle: 27,
          right_ankle: 28,
        };

        Object.entries(directMap).forEach(([jointId, lmIndex]) => {
          const lm = landmarks[lmIndex];
          joints[jointId] = {
            x: lm.x * canvasWidth,
            y: lm.y * canvasHeight,
            auto: true,
            confidence: lm.visibility || 0,
          };
        });

        setDetectedJoints(joints);
        setStatus("success");
        return joints;
      } catch (err) {
        console.error("Auto-rig detection failed:", err);
        setStatus("failed");
        return null;
      }
    },
    [initPose]
  );

  // Reset
  const reset = useCallback(() => {
    setStatus("idle");
    setDetectedJoints(null);
    setConfidence(0);
  }, []);

  return {
    detectJoints,
    detectedJoints,
    status,
    confidence,
    reset,
  };
};

export default useAutoRig2D;