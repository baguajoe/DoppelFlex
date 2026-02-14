// src/front/js/pages/Live2DAvatarPage.js
// 2D Avatar Motion Capture - Body + Hand tracking driving a 2D puppet
// Supports: built-in puppet, custom character part uploads, recording & export

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Pose } from "@mediapipe/pose";
import { Camera } from "@mediapipe/camera_utils";
import { smoothPose } from "../../utils/smoothPose";
import useHandMocap from "../../hooks/useHandMocap";
import Puppet2DRenderer, { DEFAULT_STYLE } from "../component/Puppet2DRenderer";
import { drawHand, drawFingerBars } from "../component/Hand2DRenderer";

const Live2DAvatarPage = () => {
  const videoRef = useRef(null);
  const handCanvasRef = useRef(null);
  const [poseLandmarks, setPoseLandmarks] = useState(null);
  const [prevPose, setPrevPose] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [showWebcam, setShowWebcam] = useState(true);
  const [showHandOverlay, setShowHandOverlay] = useState(true);

  // Hand mocap hook
  const {
    handData,
    isTracking: handTracking,
    startTracking: startHands,
    stopTracking: stopHands,
  } = useHandMocap();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState([]);
  const recordStartTime = useRef(null);

  // Custom character parts
  const [customParts, setCustomParts] = useState(null);
  const [puppetStyle, setPuppetStyle] = useState(DEFAULT_STYLE);

  // Style customization
  const [skinColor, setSkinColor] = useState(DEFAULT_STYLE.skinColor);
  const [bodyColor, setBodyColor] = useState(DEFAULT_STYLE.bodyColor);
  const [hairColor, setHairColor] = useState(DEFAULT_STYLE.hairColor);

  // Pose tracking refs
  const poseRef = useRef(null);
  const cameraRef = useRef(null);

  // Update puppet style when colors change
  useEffect(() => {
    setPuppetStyle((prev) => ({
      ...prev,
      skinColor,
      bodyColor,
      limbColor: bodyColor,
      hairColor,
    }));
  }, [skinColor, bodyColor, hairColor]);

  // Draw hand overlay on dedicated canvas
  useEffect(() => {
    if (!showHandOverlay || !handCanvasRef.current) return;
    const canvas = handCanvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (handData.left) {
      drawHand(ctx, handData.left, 0, 20, 280, false);
      drawFingerBars(ctx, handData.left, 10, 320, "Left");
    }
    if (handData.right) {
      drawHand(ctx, handData.right, 300, 20, 280, true);
      drawFingerBars(ctx, handData.right, 310, 320, "Right");
    }

    if (!handData.left && !handData.right) {
      ctx.fillStyle = "#666";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Show your hands to the camera",
        canvas.width / 2,
        canvas.height / 2
      );
    }
  }, [handData, showHandOverlay]);

  // Initialize body pose tracking
  const startBodyTracking = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      if (results.poseLandmarks) {
        const smoothed = smoothPose(prevPose, results.poseLandmarks, 0.4);
        setPrevPose(smoothed);
        setPoseLandmarks(smoothed);

        // Record frame if recording
        if (isRecording && recordStartTime.current) {
          const timestamp = (Date.now() - recordStartTime.current) / 1000;
          setRecordedFrames((prev) => [
            ...prev,
            {
              time: timestamp,
              pose: smoothed,
              leftHand: handData.left,
              rightHand: handData.right,
            },
          ]);
        }
      }
    });

    poseRef.current = pose;

    const camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video });
      },
      width: 640,
      height: 480,
    });

    camera.start();
    cameraRef.current = camera;
  }, [prevPose, isRecording, handData]);

  // Start everything
  const handleStart = () => {
    const video = videoRef.current;
    if (!video) return;
    startBodyTracking();
    startHands(video);
    setIsActive(true);
  };

  // Stop everything
  const handleStop = () => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    stopHands();
    setIsActive(false);
  };

  // Recording controls
  const startRecording = () => {
    setRecordedFrames([]);
    recordStartTime.current = Date.now();
    setIsRecording(true);
  };

  const stopRecording = () => {
    setIsRecording(false);
    recordStartTime.current = null;
  };

  // Serialize hand data for export
  const serializeHand = (hand) => {
    if (!hand) return null;
    return {
      wristX: parseFloat((hand.wristX || 0).toFixed(5)),
      wristY: parseFloat((hand.wristY || 0).toFixed(5)),
      wristZ: parseFloat((hand.wristZ || 0).toFixed(5)),
      wristPitch: parseFloat((hand.wristPitch || 0).toFixed(4)),
      wristYaw: parseFloat((hand.wristYaw || 0).toFixed(4)),
      wristRoll: parseFloat((hand.wristRoll || 0).toFixed(4)),
      thumbCurl: parseFloat((hand.thumbCurl || 0).toFixed(3)),
      indexCurl: parseFloat((hand.indexCurl || 0).toFixed(3)),
      middleCurl: parseFloat((hand.middleCurl || 0).toFixed(3)),
      ringCurl: parseFloat((hand.ringCurl || 0).toFixed(3)),
      pinkyCurl: parseFloat((hand.pinkyCurl || 0).toFixed(3)),
      indexPinch: parseFloat((hand.indexPinch || 0).toFixed(3)),
      fingerSpread: parseFloat((hand.fingerSpread || 0).toFixed(3)),
      gesture: hand.gesture || "unknown",
      landmarks: hand.rawLandmarks
        ? hand.rawLandmarks.map((lm) => ({
            x: parseFloat(lm.x.toFixed(5)),
            y: parseFloat(lm.y.toFixed(5)),
            z: parseFloat(lm.z.toFixed(5)),
          }))
        : null,
    };
  };

  // Export full mocap JSON with hand data
  const exportAsJSON = () => {
    if (recordedFrames.length === 0) return;

    const exportData = {
      format: "doppelflex_2d_mocap",
      version: "1.0",
      fps: 30,
      frameCount: recordedFrames.length,
      duration: recordedFrames[recordedFrames.length - 1].time,
      tracking: { body: true, hands: true, face: false },
      frames: recordedFrames.map((frame) => ({
        time: frame.time,
        pose: frame.pose
          ? frame.pose.map((lm) => ({
              x: parseFloat(lm.x.toFixed(5)),
              y: parseFloat(lm.y.toFixed(5)),
              z: parseFloat(lm.z.toFixed(5)),
              visibility: parseFloat((lm.visibility || 0).toFixed(3)),
            }))
          : null,
        leftHand: serializeHand(frame.leftHand),
        rightHand: serializeHand(frame.rightHand),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mocap_2d_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as sprite/game engine data
  const exportAsSpriteData = () => {
    if (recordedFrames.length === 0) return;

    const targetFPS = 12;
    const duration = recordedFrames[recordedFrames.length - 1].time;
    const sampledFrames = [];

    for (let t = 0; t < duration; t += 1 / targetFPS) {
      const closest = recordedFrames.reduce((prev, curr) =>
        Math.abs(curr.time - t) < Math.abs(prev.time - t) ? curr : prev
      );
      sampledFrames.push(closest);
    }

    const exportData = {
      format: "doppelflex_sprite_data",
      version: "1.0",
      fps: targetFPS,
      frameCount: sampledFrames.length,
      skeleton: {
        bones: [
          { name: "root", parent: null },
          { name: "hip_center", parent: "root", landmarks: [23, 24] },
          {
            name: "shoulder_center",
            parent: "hip_center",
            landmarks: [11, 12],
          },
          { name: "head", parent: "shoulder_center", landmark: 0 },
          {
            name: "left_upper_arm",
            parent: "shoulder_center",
            landmarks: [11, 13],
          },
          {
            name: "left_lower_arm",
            parent: "left_upper_arm",
            landmarks: [13, 15],
          },
          { name: "left_hand", parent: "left_lower_arm", landmark: 15 },
          {
            name: "right_upper_arm",
            parent: "shoulder_center",
            landmarks: [12, 14],
          },
          {
            name: "right_lower_arm",
            parent: "right_upper_arm",
            landmarks: [14, 16],
          },
          { name: "right_hand", parent: "right_lower_arm", landmark: 16 },
          {
            name: "left_upper_leg",
            parent: "hip_center",
            landmarks: [23, 25],
          },
          {
            name: "left_lower_leg",
            parent: "left_upper_leg",
            landmarks: [25, 27],
          },
          {
            name: "right_upper_leg",
            parent: "hip_center",
            landmarks: [24, 26],
          },
          {
            name: "right_lower_leg",
            parent: "right_upper_leg",
            landmarks: [26, 28],
          },
        ],
      },
      frames: sampledFrames.map((frame, i) => {
        const pose = frame.pose;
        if (!pose) return { index: i, bones: {} };

        const boneAngle = (fromIdx, toIdx) => {
          return Math.atan2(
            pose[toIdx].y - pose[fromIdx].y,
            pose[toIdx].x - pose[fromIdx].x
          );
        };

        return {
          index: i,
          bones: {
            left_upper_arm: { angle: boneAngle(11, 13) },
            left_lower_arm: { angle: boneAngle(13, 15) },
            right_upper_arm: { angle: boneAngle(12, 14) },
            right_lower_arm: { angle: boneAngle(14, 16) },
            left_upper_leg: { angle: boneAngle(23, 25) },
            left_lower_leg: { angle: boneAngle(25, 27) },
            right_upper_leg: { angle: boneAngle(24, 26) },
            right_lower_leg: { angle: boneAngle(26, 28) },
            torso: { angle: boneAngle(23, 11) },
          },
          hands: {
            left: frame.leftHand
              ? {
                  gesture: frame.leftHand.gesture,
                  thumbCurl: frame.leftHand.thumbCurl,
                  indexCurl: frame.leftHand.indexCurl,
                  middleCurl: frame.leftHand.middleCurl,
                  ringCurl: frame.leftHand.ringCurl,
                  pinkyCurl: frame.leftHand.pinkyCurl,
                  fingerSpread: frame.leftHand.fingerSpread,
                }
              : null,
            right: frame.rightHand
              ? {
                  gesture: frame.rightHand.gesture,
                  thumbCurl: frame.rightHand.thumbCurl,
                  indexCurl: frame.rightHand.indexCurl,
                  middleCurl: frame.rightHand.middleCurl,
                  ringCurl: frame.rightHand.ringCurl,
                  pinkyCurl: frame.rightHand.pinkyCurl,
                  fingerSpread: frame.rightHand.fingerSpread,
                }
              : null,
          },
          position: { x: pose[0].x, y: pose[0].y },
        };
      }),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sprite_data_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle custom character part upload
  const handlePartUpload = (partName, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setCustomParts((prev) => ({ ...prev, [partName]: img, loaded: true }));
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="container mt-4">
      <h2>🎭 2D Avatar Motion Capture</h2>
      <p>
        Full body + hand motion capture driving a 2D puppet character. Record
        animations for games or film.
      </p>

      {/* ========== CONTROLS ========== */}
      <div className="d-flex gap-2 flex-wrap mb-3">
        {!isActive ? (
          <button className="btn btn-primary" onClick={handleStart}>
            ▶️ Start Capture
          </button>
        ) : (
          <button className="btn btn-danger" onClick={handleStop}>
            ⏹ Stop Capture
          </button>
        )}

        <button
          className="btn btn-outline-secondary"
          onClick={() => setShowWebcam(!showWebcam)}
        >
          {showWebcam ? "👁 Hide Webcam" : "👁 Show Webcam"}
        </button>

        <button
          className="btn btn-outline-secondary"
          onClick={() => setShowHandOverlay(!showHandOverlay)}
        >
          {showHandOverlay ? "✋ Hide Hands" : "✋ Show Hands"}
        </button>

        {isActive && !isRecording && (
          <button className="btn btn-warning" onClick={startRecording}>
            ⏺ Start Recording
          </button>
        )}

        {isRecording && (
          <button className="btn btn-danger" onClick={stopRecording}>
            ⏹ Stop Recording ({recordedFrames.length} frames)
          </button>
        )}
      </div>

      {/* ========== EXPORT BUTTONS ========== */}
      {recordedFrames.length > 0 && !isRecording && (
        <div className="d-flex gap-2 flex-wrap mb-3">
          <button className="btn btn-success" onClick={exportAsJSON}>
            📥 Export Full Mocap (JSON)
          </button>
          <button className="btn btn-info" onClick={exportAsSpriteData}>
            🎮 Export Sprite Data (Game Engine)
          </button>
          <span className="text-muted align-self-center">
            {recordedFrames.length} frames (
            {(recordedFrames[recordedFrames.length - 1]?.time || 0).toFixed(1)}
            s)
          </span>
        </div>
      )}

      {/* ========== MAIN DISPLAY ========== */}
      <div className="row">
        {/* Webcam Feed */}
        <div className={showWebcam ? "col-md-6" : "d-none"}>
          <h5>📷 Webcam Feed</h5>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: "100%",
              maxWidth: "640px",
              borderRadius: "8px",
              border: "1px solid #444",
            }}
          />
          <div className="mt-2">
            <small>
              Body: {poseLandmarks ? "✅" : "⏳"}
              {" | "}L Hand:{" "}
              {handData.left ? `✅ ${handData.left.gesture}` : "⏳"}
              {" | "}R Hand:{" "}
              {handData.right ? `✅ ${handData.right.gesture}` : "⏳"}
              {isRecording && " | 🔴 REC"}
            </small>
          </div>
        </div>

        {/* 2D Puppet Avatar */}
        <div className={showWebcam ? "col-md-6" : "col-12"}>
          <h5>🎭 2D Avatar</h5>
          <Puppet2DRenderer
            poseLandmarks={poseLandmarks}
            faceData={null}
            handData={handData}
            style={puppetStyle}
            customParts={customParts}
            width={640}
            height={480}
          />
        </div>
      </div>

      {/* ========== HAND TRACKING OVERLAY ========== */}
      {showHandOverlay && isActive && (
        <div className="mt-3">
          <h5>🤲 Hand Tracking Detail</h5>
          <canvas
            ref={handCanvasRef}
            width={600}
            height={420}
            style={{
              border: "1px solid #333",
              borderRadius: "8px",
              background: "#1a1a2e",
              width: "100%",
              maxWidth: "600px",
            }}
          />
        </div>
      )}

      {/* ========== CUSTOMIZATION PANEL ========== */}
      <div className="mt-4">
        <h5>🎨 Customize Puppet</h5>

        {/* Color Pickers */}
        <div className="row g-3">
          <div className="col-auto">
            <label className="form-label">Skin</label>
            <input
              type="color"
              className="form-control form-control-color"
              value={skinColor}
              onChange={(e) => setSkinColor(e.target.value)}
            />
          </div>
          <div className="col-auto">
            <label className="form-label">Outfit</label>
            <input
              type="color"
              className="form-control form-control-color"
              value={bodyColor}
              onChange={(e) => setBodyColor(e.target.value)}
            />
          </div>
          <div className="col-auto">
            <label className="form-label">Hair</label>
            <input
              type="color"
              className="form-control form-control-color"
              value={hairColor}
              onChange={(e) => setHairColor(e.target.value)}
            />
          </div>
        </div>

        {/* Custom Part Uploads */}
        <div className="mt-3">
          <h6>📁 Upload Custom Character Parts (Optional)</h6>
          <p className="text-muted small">
            Upload PNG images for each body part to replace the default puppet.
            Transparent background recommended.
          </p>
          <div className="row g-2">
            {[
              "head",
              "torso",
              "upperArm",
              "lowerArm",
              "upperLeg",
              "lowerLeg",
            ].map((part) => (
              <div className="col-auto" key={part}>
                <label className="form-label small">{part}</label>
                <input
                  type="file"
                  accept="image/png"
                  className="form-control form-control-sm"
                  onChange={(e) => handlePartUpload(part, e)}
                  style={{ maxWidth: "180px" }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========== HAND DEBUG DATA ========== */}
      {(handData.left || handData.right) && (
        <details className="mt-4">
          <summary>🔍 Hand Tracking Debug</summary>
          <div className="row mt-2">
            {handData.left && (
              <div className="col-md-6">
                <h6>Left Hand</h6>
                <pre
                  className="bg-dark text-light p-3"
                  style={{ borderRadius: "8px", fontSize: "11px" }}
                >
                  {JSON.stringify(
                    {
                      gesture: handData.left.gesture,
                      thumb: handData.left.thumbCurl?.toFixed(2),
                      index: handData.left.indexCurl?.toFixed(2),
                      middle: handData.left.middleCurl?.toFixed(2),
                      ring: handData.left.ringCurl?.toFixed(2),
                      pinky: handData.left.pinkyCurl?.toFixed(2),
                      pinch: handData.left.indexPinch?.toFixed(2),
                      spread: handData.left.fingerSpread?.toFixed(2),
                      wristPitch: handData.left.wristPitch?.toFixed(3),
                      wristYaw: handData.left.wristYaw?.toFixed(3),
                      wristRoll: handData.left.wristRoll?.toFixed(3),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
            {handData.right && (
              <div className="col-md-6">
                <h6>Right Hand</h6>
                <pre
                  className="bg-dark text-light p-3"
                  style={{ borderRadius: "8px", fontSize: "11px" }}
                >
                  {JSON.stringify(
                    {
                      gesture: handData.right.gesture,
                      thumb: handData.right.thumbCurl?.toFixed(2),
                      index: handData.right.indexCurl?.toFixed(2),
                      middle: handData.right.middleCurl?.toFixed(2),
                      ring: handData.right.ringCurl?.toFixed(2),
                      pinky: handData.right.pinkyCurl?.toFixed(2),
                      pinch: handData.right.indexPinch?.toFixed(2),
                      spread: handData.right.fingerSpread?.toFixed(2),
                      wristPitch: handData.right.wristPitch?.toFixed(3),
                      wristYaw: handData.right.wristYaw?.toFixed(3),
                      wristRoll: handData.right.wristRoll?.toFixed(3),
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
};

export default Live2DAvatarPage;