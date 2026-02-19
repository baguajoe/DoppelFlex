// src/front/js/pages/FullPerformanceCapturePage.js
//
// Unified full performance capture: body (33 landmarks) + face (478 landmarks)
// + hands (21×2 landmarks) running simultaneously on one webcam.
//
// Features:
// - Toggle individual modules on/off
// - Real-time status indicators per module
// - Debug panels showing live data
// - Recording with export (JSON)
// - FPS monitoring
// - Performance warnings

import React, { useRef, useState, useCallback, useEffect } from "react";
import useFullPerformanceMocap from "../hooks/useFullPerformanceMocap";

// ============================================================
// Styles
// ============================================================

const S = {
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
    marginBottom: "20px",
    flexWrap: "wrap",
    gap: "12px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #6366f1, #ec4899)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  statsRow: {
    display: "flex",
    gap: "16px",
    alignItems: "center",
  },
  stat: {
    background: "rgba(255,255,255,0.05)",
    padding: "6px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: "600",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 340px",
    gap: "20px",
  },
  videoWrap: {
    position: "relative",
    borderRadius: "16px",
    overflow: "hidden",
    background: "#111",
    aspectRatio: "16/9",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: "scaleX(-1)",
  },
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "none",
  },
  moduleBadge: {
    position: "absolute",
    bottom: "12px",
    left: "12px",
    display: "flex",
    gap: "8px",
  },
  badge: {
    padding: "4px 10px",
    borderRadius: "8px",
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "18px",
    backdropFilter: "blur(20px)",
  },
  cardTitle: {
    fontSize: "14px",
    fontWeight: "700",
    marginBottom: "12px",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    color: "#888",
  },
  toggleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
  },
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "14px",
    fontWeight: "500",
  },
  toggleDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },
  toggle: {
    position: "relative",
    width: "40px",
    height: "22px",
    borderRadius: "11px",
    cursor: "pointer",
    transition: "background 0.2s",
    border: "none",
    padding: 0,
  },
  toggleKnob: {
    position: "absolute",
    top: "2px",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "white",
    transition: "left 0.2s",
  },
  btn: {
    width: "100%",
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "14px",
    transition: "all 0.2s",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  btnStart: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white",
  },
  btnStop: {
    background: "rgba(239,68,68,0.15)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.3)",
  },
  btnRecord: {
    background: "linear-gradient(135deg, #ef4444, #dc2626)",
    color: "white",
  },
  btnRecordStop: {
    background: "rgba(239,68,68,0.3)",
    color: "#fca5a5",
    border: "1px solid rgba(239,68,68,0.4)",
  },
  btnExport: {
    background: "rgba(16,185,129,0.15)",
    color: "#10b981",
    border: "1px solid rgba(16,185,129,0.3)",
  },
  dataSection: {
    marginTop: "8px",
  },
  dataRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "3px 0",
    fontSize: "12px",
    fontFamily: "monospace",
  },
  dataLabel: {
    color: "#888",
  },
  dataValue: {
    fontWeight: "600",
  },
  expressionBar: {
    height: "4px",
    borderRadius: "2px",
    background: "rgba(255,255,255,0.08)",
    marginTop: "2px",
    overflow: "hidden",
  },
  expressionFill: {
    height: "100%",
    borderRadius: "2px",
    transition: "width 0.15s",
  },
  handSection: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },
  handCard: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: "8px",
    padding: "10px",
  },
  handTitle: {
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: "6px",
    color: "#888",
  },
  gesture: {
    fontSize: "18px",
    textAlign: "center",
    padding: "4px 0",
    fontWeight: "700",
  },
  perfWarning: {
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "12px",
    color: "#f59e0b",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  recordingIndicator: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#ef4444",
    fontWeight: "700",
    fontSize: "13px",
  },
  recordingDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    background: "#ef4444",
    animation: "pulse 1s infinite",
  },
};

// ============================================================
// Gesture emoji mapping
// ============================================================

const GESTURE_EMOJI = {
  fist: "✊",
  open: "🖐️",
  point: "☝️",
  peace: "✌️",
  thumbs_up: "👍",
  rock: "🤟",
  pinch: "🤏",
  neutral: "🫱",
};

// ============================================================
// Sub-Components
// ============================================================

function ModuleToggle({ label, color, enabled, active, onChange, disabled }) {
  return (
    <div style={S.toggleRow}>
      <div style={S.toggleLabel}>
        <div
          style={{
            ...S.toggleDot,
            background: active ? color : "rgba(255,255,255,0.15)",
            boxShadow: active ? `0 0 8px ${color}` : "none",
          }}
        />
        {label}
        {active && (
          <span style={{ fontSize: "10px", color: color, fontWeight: "600" }}>
            LIVE
          </span>
        )}
      </div>
      <button
        style={{
          ...S.toggle,
          background: enabled
            ? `${color}66`
            : "rgba(255,255,255,0.1)",
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && onChange(!enabled)}
      >
        <div
          style={{
            ...S.toggleKnob,
            left: enabled ? "20px" : "2px",
          }}
        />
      </button>
    </div>
  );
}

function ExpressionMeter({ label, value, color }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={S.dataRow}>
        <span style={S.dataLabel}>{label}</span>
        <span style={{ ...S.dataValue, color }}>
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <div style={S.expressionBar}>
        <div
          style={{
            ...S.expressionFill,
            width: `${value * 100}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function FingerCurlBar({ label, value }) {
  return (
    <div style={{ marginBottom: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
        <span style={{ color: "#888" }}>{label}</span>
        <span style={{ color: "#6366f1" }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div style={{ ...S.expressionBar, height: "3px" }}>
        <div
          style={{
            ...S.expressionFill,
            width: `${value * 100}%`,
            background: "#6366f1",
          }}
        />
      </div>
    </div>
  );
}

function BodyPanel({ bodyData }) {
  if (!bodyData) {
    return <div style={{ color: "#555", fontSize: "13px" }}>Waiting for body data...</div>;
  }

  const keyPoints = [
    { idx: 0, label: "Nose" },
    { idx: 11, label: "L Shoulder" },
    { idx: 12, label: "R Shoulder" },
    { idx: 15, label: "L Wrist" },
    { idx: 16, label: "R Wrist" },
    { idx: 23, label: "L Hip" },
    { idx: 24, label: "R Hip" },
    { idx: 27, label: "L Ankle" },
    { idx: 28, label: "R Ankle" },
  ];

  return (
    <div style={S.dataSection}>
      {keyPoints.map(({ idx, label }) => {
        const lm = bodyData.landmarks[idx];
        const vis = lm?.visibility || 0;
        return (
          <div key={idx} style={S.dataRow}>
            <span style={{ ...S.dataLabel, opacity: vis > 0.5 ? 1 : 0.4 }}>
              {label}
            </span>
            <span style={S.dataValue}>
              {lm ? `${lm.x.toFixed(2)} ${lm.y.toFixed(2)}` : "—"}
            </span>
          </div>
        );
      })}
      <div style={{ ...S.dataRow, marginTop: "6px", color: "#10b981" }}>
        <span>Landmarks</span>
        <span>33 tracked</span>
      </div>
    </div>
  );
}

function FacePanel({ faceData }) {
  if (!faceData) {
    return <div style={{ color: "#555", fontSize: "13px" }}>Waiting for face data...</div>;
  }

  return (
    <div style={S.dataSection}>
      <ExpressionMeter label="Left Eye" value={faceData.leftEyeOpen} color="#4ECDC4" />
      <ExpressionMeter label="Right Eye" value={faceData.rightEyeOpen} color="#4ECDC4" />
      <ExpressionMeter label="Mouth Open" value={faceData.mouthOpen} color="#FF6B6B" />
      <ExpressionMeter label="Smile" value={faceData.mouthSmile} color="#FFEAA7" />
      <ExpressionMeter label="L Brow" value={faceData.leftBrowHeight} color="#96CEB4" />
      <ExpressionMeter label="R Brow" value={faceData.rightBrowHeight} color="#96CEB4" />

      <div style={{ marginTop: "10px", fontSize: "11px", color: "#888" }}>
        HEAD ROTATION
      </div>
      <div style={S.dataRow}>
        <span style={S.dataLabel}>Yaw</span>
        <span style={S.dataValue}>{(faceData.headYaw * 57.3).toFixed(1)}°</span>
      </div>
      <div style={S.dataRow}>
        <span style={S.dataLabel}>Pitch</span>
        <span style={S.dataValue}>{(faceData.headPitch * 57.3).toFixed(1)}°</span>
      </div>
      <div style={S.dataRow}>
        <span style={S.dataLabel}>Roll</span>
        <span style={S.dataValue}>{(faceData.headRoll * 57.3).toFixed(1)}°</span>
      </div>
    </div>
  );
}

function HandsPanel({ handData }) {
  const renderHand = (data, label) => (
    <div style={S.handCard}>
      <div style={S.handTitle}>{label}</div>
      {data ? (
        <>
          <div style={S.gesture}>
            {GESTURE_EMOJI[data.gesture] || "🫱"}{" "}
            <span style={{ fontSize: "11px", color: "#888" }}>{data.gesture}</span>
          </div>
          <FingerCurlBar label="Thumb" value={data.thumbCurl} />
          <FingerCurlBar label="Index" value={data.indexCurl} />
          <FingerCurlBar label="Middle" value={data.middleCurl} />
          <FingerCurlBar label="Ring" value={data.ringCurl} />
          <FingerCurlBar label="Pinky" value={data.pinkyCurl} />
          <div style={{ ...S.dataRow, marginTop: "4px" }}>
            <span style={S.dataLabel}>Pinch</span>
            <span style={S.dataValue}>{(data.indexPinch * 100).toFixed(0)}%</span>
          </div>
        </>
      ) : (
        <div style={{ color: "#555", fontSize: "12px", textAlign: "center", padding: "10px 0" }}>
          Not detected
        </div>
      )}
    </div>
  );

  return (
    <div style={S.handSection}>
      {renderHand(handData.left, "Left Hand")}
      {renderHand(handData.right, "Right Hand")}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function FullPerformanceCapturePage() {
  const videoRef = useRef(null);

  // Module toggles (set before starting)
  const [enableBody, setEnableBody] = useState(true);
  const [enableFace, setEnableFace] = useState(true);
  const [enableHands, setEnableHands] = useState(true);

  // Debug panel visibility
  const [showBody, setShowBody] = useState(true);
  const [showFace, setShowFace] = useState(true);
  const [showHands, setShowHands] = useState(true);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState([]);
  const recordIntervalRef = useRef(null);
  const recordStartRef = useRef(null);

  const {
    bodyData,
    faceData,
    handData,
    isTracking,
    fps,
    activeModules,
    start,
    stop,
    getSnapshot,
  } = useFullPerformanceMocap(videoRef, { enableBody, enableFace, enableHands });

  // Recording logic
  const startRecording = useCallback(() => {
    setRecordedFrames([]);
    recordStartRef.current = Date.now();
    setIsRecording(true);

    // Capture at ~30fps
    recordIntervalRef.current = setInterval(() => {
      const snapshot = getSnapshot();
      if (snapshot) {
        snapshot.relativeTime = Date.now() - recordStartRef.current;
        setRecordedFrames((prev) => [...prev, snapshot]);
      }
    }, 33);
  }, [getSnapshot]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
  }, []);

  const exportRecording = useCallback(() => {
    if (recordedFrames.length === 0) return;

    const data = {
      version: "1.0",
      type: "full_performance",
      createdAt: new Date().toISOString(),
      duration: recordedFrames[recordedFrames.length - 1].relativeTime,
      frameCount: recordedFrames.length,
      modules: { body: enableBody, face: enableFace, hands: enableHands },
      frames: recordedFrames,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance_capture_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recordedFrames, enableBody, enableFace, enableHands]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordIntervalRef.current) {
        clearInterval(recordIntervalRef.current);
      }
    };
  }, []);

  const activeCount = [activeModules.body, activeModules.face, activeModules.hands].filter(Boolean).length;

  return (
    <div style={S.page}>
      {/* Pulse animation for recording dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <h1 style={S.title}>Full Performance Capture</h1>
        <div style={S.statsRow}>
          {isTracking && (
            <>
              <div style={{ ...S.stat, color: fps > 20 ? "#10b981" : fps > 10 ? "#f59e0b" : "#ef4444" }}>
                {fps} FPS
              </div>
              <div style={S.stat}>
                {activeCount}/3 modules
              </div>
              <div style={{ ...S.stat, color: "#6366f1" }}>
                {(enableBody ? 33 : 0) + (enableFace ? 478 : 0) + (enableHands ? 42 : 0)} landmarks
              </div>
            </>
          )}
          {isRecording && (
            <div style={S.recordingIndicator}>
              <div style={S.recordingDot} />
              REC {recordedFrames.length} frames
            </div>
          )}
        </div>
      </div>

      {/* Performance warning */}
      {isTracking && fps > 0 && fps < 15 && (
        <div style={{ ...S.perfWarning, marginBottom: "16px" }}>
          ⚠️ Low FPS detected. Try disabling a module for better performance.
        </div>
      )}

      {/* Main layout */}
      <div style={S.mainGrid}>
        {/* Left: Video */}
        <div>
          <div style={S.videoWrap}>
            <video ref={videoRef} style={S.video} playsInline muted />

            {/* Module status badges on video */}
            {isTracking && (
              <div style={S.moduleBadge}>
                {enableBody && (
                  <div
                    style={{
                      ...S.badge,
                      background: activeModules.body
                        ? "rgba(16,185,129,0.2)"
                        : "rgba(255,255,255,0.1)",
                      color: activeModules.body ? "#10b981" : "#555",
                      border: `1px solid ${activeModules.body ? "#10b98133" : "#ffffff11"}`,
                    }}
                  >
                    Body
                  </div>
                )}
                {enableFace && (
                  <div
                    style={{
                      ...S.badge,
                      background: activeModules.face
                        ? "rgba(236,72,153,0.2)"
                        : "rgba(255,255,255,0.1)",
                      color: activeModules.face ? "#ec4899" : "#555",
                      border: `1px solid ${activeModules.face ? "#ec489933" : "#ffffff11"}`,
                    }}
                  >
                    Face
                  </div>
                )}
                {enableHands && (
                  <div
                    style={{
                      ...S.badge,
                      background: activeModules.hands
                        ? "rgba(99,102,241,0.2)"
                        : "rgba(255,255,255,0.1)",
                      color: activeModules.hands ? "#6366f1" : "#555",
                      border: `1px solid ${activeModules.hands ? "#6366f133" : "#ffffff11"}`,
                    }}
                  >
                    Hands
                  </div>
                )}
              </div>
            )}

            {/* Start overlay when not tracking */}
            {!isTracking && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.6)",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎭</div>
                  <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "4px" }}>
                    Full Performance Capture
                  </div>
                  <div style={{ fontSize: "13px", color: "#888" }}>
                    Body + Face + Hands — all at once
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls below video */}
          <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
            {!isTracking ? (
              <button
                style={{ ...S.btn, ...S.btnStart }}
                onClick={start}
              >
                Start Capture
              </button>
            ) : (
              <>
                {!isRecording ? (
                  <button
                    style={{ ...S.btn, ...S.btnRecord, flex: 1 }}
                    onClick={startRecording}
                  >
                    ● Record
                  </button>
                ) : (
                  <button
                    style={{ ...S.btn, ...S.btnRecordStop, flex: 1 }}
                    onClick={stopRecording}
                  >
                    ■ Stop Recording
                  </button>
                )}
                <button
                  style={{ ...S.btn, ...S.btnStop, flex: 1 }}
                  onClick={() => {
                    if (isRecording) stopRecording();
                    stop();
                  }}
                >
                  Stop Capture
                </button>
              </>
            )}
          </div>

          {/* Export button */}
          {recordedFrames.length > 0 && !isRecording && (
            <button
              style={{ ...S.btn, ...S.btnExport, marginTop: "12px" }}
              onClick={exportRecording}
            >
              Export Recording ({recordedFrames.length} frames,{" "}
              {(recordedFrames[recordedFrames.length - 1]?.relativeTime / 1000).toFixed(1)}s)
            </button>
          )}
        </div>

        {/* Right: Sidebar panels */}
        <div style={S.sidebar}>
          {/* Module Toggles */}
          <div style={S.card}>
            <div style={S.cardTitle}>Modules</div>
            <ModuleToggle
              label="Body (33 pts)"
              color="#10b981"
              enabled={enableBody}
              active={activeModules.body}
              onChange={setEnableBody}
              disabled={isTracking}
            />
            <ModuleToggle
              label="Face (478 pts)"
              color="#ec4899"
              enabled={enableFace}
              active={activeModules.face}
              onChange={setEnableFace}
              disabled={isTracking}
            />
            <ModuleToggle
              label="Hands (42 pts)"
              color="#6366f1"
              enabled={enableHands}
              active={activeModules.hands}
              onChange={setEnableHands}
              disabled={isTracking}
            />
            {isTracking && (
              <div style={{ fontSize: "11px", color: "#555", marginTop: "8px" }}>
                Stop capture to change modules
              </div>
            )}
          </div>

          {/* Body Data */}
          {enableBody && (
            <div style={S.card}>
              <div
                style={{ ...S.cardTitle, cursor: "pointer" }}
                onClick={() => setShowBody(!showBody)}
              >
                <span style={{ color: "#10b981" }}>●</span> Body{" "}
                <span style={{ float: "right", fontSize: "10px" }}>
                  {showBody ? "▼" : "▶"}
                </span>
              </div>
              {showBody && <BodyPanel bodyData={bodyData} />}
            </div>
          )}

          {/* Face Data */}
          {enableFace && (
            <div style={S.card}>
              <div
                style={{ ...S.cardTitle, cursor: "pointer" }}
                onClick={() => setShowFace(!showFace)}
              >
                <span style={{ color: "#ec4899" }}>●</span> Face{" "}
                <span style={{ float: "right", fontSize: "10px" }}>
                  {showFace ? "▼" : "▶"}
                </span>
              </div>
              {showFace && <FacePanel faceData={faceData} />}
            </div>
          )}

          {/* Hands Data */}
          {enableHands && (
            <div style={S.card}>
              <div
                style={{ ...S.cardTitle, cursor: "pointer" }}
                onClick={() => setShowHands(!showHands)}
              >
                <span style={{ color: "#6366f1" }}>●</span> Hands{" "}
                <span style={{ float: "right", fontSize: "10px" }}>
                  {showHands ? "▼" : "▶"}
                </span>
              </div>
              {showHands && <HandsPanel handData={handData} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}