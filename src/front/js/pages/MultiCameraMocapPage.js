/**
 * MultiCameraMocapPage.js
 * 
 * Full UI for multi-camera motion capture with calibration workflow.
 * 
 * Flow:
 * 1. Select cameras → shows available webcams
 * 2. Calibrate → user holds T-pose, system computes camera positions
 * 3. Capture → live triangulated 3D mocap from all cameras
 */

import React, { useState, useRef, useEffect } from "react";
import useMultiCameraMocap from "../hooks/useMultiCameraMocap";

// ============================================================
// Styles
// ============================================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e0e0e0",
    padding: "24px",
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: {
    fontSize: "28px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  badge: {
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "20px",
    backdropFilter: "blur(20px)",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: "600",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  step: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white",
    fontSize: "14px",
    fontWeight: "700",
    flexShrink: 0,
  },
  stepDone: {
    background: "linear-gradient(135deg, #10b981, #059669)",
  },
  cameraGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "12px",
    marginBottom: "16px",
  },
  cameraCard: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    padding: "16px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  cameraCardActive: {
    border: "1px solid #6366f1",
    background: "rgba(99,102,241,0.08)",
  },
  cameraLabel: {
    fontSize: "14px",
    fontWeight: "500",
    marginBottom: "4px",
  },
  cameraId: {
    fontSize: "11px",
    color: "#666",
    fontFamily: "monospace",
  },
  btn: {
    padding: "12px 24px",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
    transition: "all 0.2s",
  },
  btnPrimary: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white",
  },
  btnDanger: {
    background: "rgba(239,68,68,0.15)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.3)",
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: "not-allowed",
  },
  videoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },
  videoContainer: {
    position: "relative",
    borderRadius: "12px",
    overflow: "hidden",
    background: "#111",
    aspectRatio: "16/9",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  videoOverlay: {
    position: "absolute",
    top: "8px",
    left: "8px",
    right: "8px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  videoLabel: {
    background: "rgba(0,0,0,0.7)",
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "600",
  },
  tposeIndicator: {
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: "600",
  },
  progressBar: {
    width: "100%",
    height: "8px",
    background: "rgba(255,255,255,0.08)",
    borderRadius: "4px",
    overflow: "hidden",
    marginBottom: "12px",
  },
  progressFill: {
    height: "100%",
    borderRadius: "4px",
    transition: "width 0.3s",
    background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
  },
  resultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    marginTop: "16px",
  },
  resultStat: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: "10px",
    padding: "14px",
    textAlign: "center",
  },
  resultValue: {
    fontSize: "24px",
    fontWeight: "700",
  },
  resultLabel: {
    fontSize: "12px",
    color: "#888",
    marginTop: "4px",
  },
  heightInput: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "16px",
  },
  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    padding: "8px 12px",
    color: "#e0e0e0",
    fontSize: "14px",
    width: "80px",
  },
  debugPanel: {
    fontFamily: "monospace",
    fontSize: "12px",
    background: "rgba(0,0,0,0.4)",
    borderRadius: "8px",
    padding: "12px",
    maxHeight: "300px",
    overflow: "auto",
  },
  landmarkDot: {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    marginRight: "4px",
  },
  fpsCounter: {
    position: "fixed",
    top: "80px",
    right: "20px",
    background: "rgba(0,0,0,0.7)",
    padding: "8px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: "600",
    zIndex: 100,
  },
  instructions: {
    background: "rgba(99,102,241,0.08)",
    border: "1px solid rgba(99,102,241,0.2)",
    borderRadius: "12px",
    padding: "16px",
    marginBottom: "16px",
    lineHeight: "1.6",
  },
};

// ============================================================
// Sub-components
// ============================================================

function CameraSelector({ availableCameras, activeCameras, onAdd, onRemove }) {
  const activeIds = activeCameras.map((c) => c.deviceId);

  return (
    <div style={styles.cameraGrid}>
      {availableCameras.map((cam) => {
        const isActive = activeIds.includes(cam.deviceId);
        return (
          <div
            key={cam.deviceId}
            style={{
              ...styles.cameraCard,
              ...(isActive ? styles.cameraCardActive : {}),
            }}
            onClick={() => {
              if (isActive) {
                const active = activeCameras.find(
                  (c) => c.deviceId === cam.deviceId
                );
                if (active) onRemove(active.id);
              } else {
                onAdd(cam.deviceId);
              }
            }}
          >
            <div style={styles.cameraLabel}>
              {isActive ? "✅ " : "⬜ "}
              {cam.label}
            </div>
            <div style={styles.cameraId}>
              {cam.deviceId.slice(0, 20)}...
            </div>
          </div>
        );
      })}

      {availableCameras.length === 0 && (
        <div style={{ color: "#666", padding: "20px", textAlign: "center" }}>
          No cameras detected. Make sure webcams are connected and browser has
          permission to access them.
        </div>
      )}
    </div>
  );
}

function CameraFeedGrid({ activeCameras, tposeScores, calibrationState }) {
  return (
    <div style={styles.videoGrid}>
      {activeCameras.map((cam) => (
        <CameraFeed
          key={cam.id}
          camera={cam}
          tposeScore={tposeScores[cam.id]}
          showTPose={calibrationState === "capturing"}
        />
      ))}
    </div>
  );
}

function CameraFeed({ camera, tposeScore, showTPose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && camera.videoEl) {
      // Mirror the source video's stream to this display element
      videoRef.current.srcObject = camera.stream;
    }
  }, [camera]);

  const tposeColor =
    tposeScore > 0.7
      ? "#10b981"
      : tposeScore > 0.4
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div style={styles.videoContainer}>
      <video
        ref={videoRef}
        style={{ ...styles.video, transform: "scaleX(-1)" }}
        autoPlay
        playsInline
        muted
      />
      <div style={styles.videoOverlay}>
        <div style={styles.videoLabel}>{camera.label}</div>
        {showTPose && tposeScore !== undefined && (
          <div
            style={{
              ...styles.tposeIndicator,
              background: `${tposeColor}22`,
              color: tposeColor,
              border: `1px solid ${tposeColor}44`,
            }}
          >
            T-Pose: {Math.round(tposeScore * 100)}%
          </div>
        )}
      </div>
    </div>
  );
}

function CalibrationResultPanel({ result }) {
  if (!result) return null;

  const qualityColors = {
    great: "#10b981",
    good: "#6366f1",
    acceptable: "#f59e0b",
    poor: "#ef4444",
  };

  return (
    <div style={styles.resultGrid}>
      <div style={styles.resultStat}>
        <div
          style={{
            ...styles.resultValue,
            color: qualityColors[result.quality] || "#e0e0e0",
          }}
        >
          {result.quality.toUpperCase()}
        </div>
        <div style={styles.resultLabel}>Calibration Quality</div>
      </div>
      <div style={styles.resultStat}>
        <div style={styles.resultValue}>
          {result.reprojectionError.toFixed(1)}px
        </div>
        <div style={styles.resultLabel}>Reprojection Error</div>
      </div>
      <div style={styles.resultStat}>
        <div style={styles.resultValue}>{result.cameras.length}</div>
        <div style={styles.resultLabel}>Cameras Calibrated</div>
      </div>
      <div style={styles.resultStat}>
        <div style={styles.resultValue}>
          {result.cameras.reduce((s, c) => s + c.numCorrespondences, 0)}
        </div>
        <div style={styles.resultLabel}>Total Correspondences</div>
      </div>
    </div>
  );
}

function LandmarkDebugPanel({ landmarks }) {
  if (!landmarks) return null;

  const keyLandmarks = {
    0: "Nose",
    11: "L Shoulder",
    12: "R Shoulder",
    15: "L Wrist",
    16: "R Wrist",
    23: "L Hip",
    24: "R Hip",
    27: "L Ankle",
    28: "R Ankle",
  };

  return (
    <div style={styles.debugPanel}>
      <div style={{ marginBottom: "8px", fontWeight: "600", color: "#8b5cf6" }}>
        Triangulated Landmarks (3D)
      </div>
      {Object.entries(keyLandmarks).map(([idx, name]) => {
        const lm = landmarks[parseInt(idx)];
        if (!lm) return null;

        const confColor =
          lm.confidence > 0.7
            ? "#10b981"
            : lm.confidence > 0.3
            ? "#f59e0b"
            : "#ef4444";

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "2px 0",
              opacity: lm.missing ? 0.3 : 1,
            }}
          >
            <span>
              <span
                style={{ ...styles.landmarkDot, background: confColor }}
              />
              {name}
            </span>
            <span>
              X:{lm.x.toFixed(3)} Y:{lm.y.toFixed(3)} Z:{lm.z.toFixed(3)}
              {lm.singleCameraFallback && " ⚠️"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function MultiCameraMocapPage() {
  const {
    availableCameras,
    activeCameras,
    addCamera,
    removeCamera,
    startCalibration,
    calibrationState,
    calibrationProgress,
    calibrationResult,
    calibrationError,
    tposeScores,
    startTracking,
    stopTracking,
    isTracking,
    triangulatedLandmarks,
    fps,
    saveCalibration,
    loadCalibration,
  } = useMultiCameraMocap();

  const [userHeight, setUserHeight] = useState(1.70);
  const [showDebug, setShowDebug] = useState(false);

  const step1Done = activeCameras.length >= 2;
  const step2Done = calibrationState === "done";

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Multi-Camera Motion Capture</h1>
        {isTracking && (
          <div style={styles.fpsCounter}>
            {fps} FPS | {activeCameras.length} cameras
          </div>
        )}
      </div>

      {/* Step 1: Camera Selection */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <span style={{ ...styles.step, ...(step1Done ? styles.stepDone : {}) }}>
            {step1Done ? "✓" : "1"}
          </span>
          Select Cameras
          {step1Done && (
            <span style={{ fontSize: "13px", color: "#10b981" }}>
              {activeCameras.length} cameras active
            </span>
          )}
        </div>

        <CameraSelector
          availableCameras={availableCameras}
          activeCameras={activeCameras}
          onAdd={addCamera}
          onRemove={removeCamera}
        />

        {activeCameras.length === 1 && (
          <div style={{ color: "#f59e0b", fontSize: "13px" }}>
            ⚠️ Select at least one more camera for multi-camera mocap
          </div>
        )}
      </div>

      {/* Camera Feeds */}
      {activeCameras.length > 0 && (
        <CameraFeedGrid
          activeCameras={activeCameras}
          tposeScores={tposeScores}
          calibrationState={calibrationState}
        />
      )}

      {/* Step 2: Calibration */}
      <div style={{ ...styles.card, opacity: step1Done ? 1 : 0.4 }}>
        <div style={styles.cardTitle}>
          <span style={{ ...styles.step, ...(step2Done ? styles.stepDone : {}) }}>
            {step2Done ? "✓" : "2"}
          </span>
          Calibrate Cameras
        </div>

        {calibrationState === "idle" && step1Done && (
          <>
            <div style={styles.instructions}>
              <strong>How to calibrate:</strong>
              <br />
              1. Stand where all cameras can see your full body
              <br />
              2. Enter your height below (helps accuracy)
              <br />
              3. Click "Start Calibration"
              <br />
              4. Hold a T-pose (arms straight out to the sides) for 4 seconds
              <br />
              5. Stay still — the system will compute camera positions automatically
            </div>

            <div style={styles.heightInput}>
              <label>Your height:</label>
              <input
                type="number"
                style={styles.input}
                value={userHeight}
                onChange={(e) => setUserHeight(parseFloat(e.target.value) || 1.70)}
                step="0.01"
                min="1.0"
                max="2.5"
              />
              <span style={{ color: "#888", fontSize: "13px" }}>
                meters ({Math.round(userHeight * 3.281 * 10) / 10} ft)
              </span>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                style={{ ...styles.btn, ...styles.btnPrimary }}
                onClick={() => startCalibration(userHeight)}
              >
                Start Calibration
              </button>

              <button
                style={{ ...styles.btn, background: "rgba(255,255,255,0.06)", color: "#aaa" }}
                onClick={() => {
                  if (loadCalibration()) {
                    alert("Previous calibration loaded!");
                  } else {
                    alert("No saved calibration found.");
                  }
                }}
              >
                Load Previous Calibration
              </button>
            </div>
          </>
        )}

        {calibrationState === "capturing" && (
          <>
            <div
              style={{
                textAlign: "center",
                fontSize: "20px",
                fontWeight: "600",
                marginBottom: "16px",
                color: "#6366f1",
              }}
            >
              🙆 Hold your T-Pose!
            </div>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${calibrationProgress}%`,
                }}
              />
            </div>
            <div style={{ textAlign: "center", color: "#888" }}>
              Capturing... {calibrationProgress}%
            </div>
          </>
        )}

        {calibrationState === "processing" && (
          <div style={{ textAlign: "center", padding: "20px", color: "#6366f1" }}>
            Computing camera positions...
          </div>
        )}

        {calibrationState === "done" && (
          <>
            <div
              style={{
                color: "#10b981",
                fontWeight: "600",
                marginBottom: "8px",
              }}
            >
              ✅ Calibration complete!
            </div>
            <CalibrationResultPanel result={calibrationResult} />

            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
              <button
                style={{ ...styles.btn, background: "rgba(255,255,255,0.06)", color: "#aaa" }}
                onClick={() => {
                  saveCalibration();
                  alert("Calibration saved!");
                }}
              >
                Save Calibration
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnDanger }}
                onClick={() => startCalibration(userHeight)}
              >
                Recalibrate
              </button>
            </div>
          </>
        )}

        {calibrationState === "error" && (
          <div>
            <div style={{ color: "#ef4444", marginBottom: "12px" }}>
              ❌ {calibrationError}
            </div>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary }}
              onClick={() => startCalibration(userHeight)}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Step 3: Capture */}
      <div style={{ ...styles.card, opacity: step2Done ? 1 : 0.4 }}>
        <div style={styles.cardTitle}>
          <span style={styles.step}>3</span>
          Capture Motion
        </div>

        {step2Done && !isTracking && (
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={startTracking}
          >
            Start Multi-Camera Tracking
          </button>
        )}

        {isTracking && (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div style={{ color: "#10b981", fontWeight: "600" }}>
                🔴 Tracking Active — {fps} FPS
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  style={{
                    ...styles.btn,
                    background: "rgba(255,255,255,0.06)",
                    color: "#aaa",
                    padding: "8px 16px",
                    fontSize: "13px",
                  }}
                  onClick={() => setShowDebug(!showDebug)}
                >
                  {showDebug ? "Hide" : "Show"} Debug
                </button>
                <button
                  style={{ ...styles.btn, ...styles.btnDanger }}
                  onClick={stopTracking}
                >
                  Stop Tracking
                </button>
              </div>
            </div>

            {showDebug && (
              <LandmarkDebugPanel landmarks={triangulatedLandmarks} />
            )}
          </>
        )}

        {!step2Done && (
          <div style={{ color: "#666", fontSize: "14px" }}>
            Complete calibration first to enable multi-camera tracking.
          </div>
        )}
      </div>
    </div>
  );
}