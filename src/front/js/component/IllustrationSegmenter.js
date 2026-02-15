// src/front/js/component/IllustrationSegmenter.js
// Auto-rig: runs MediaPipe Pose on illustration to detect joints automatically
// Manual fallback: user clicks to place joints if auto-detect fails
// Segments illustration into body parts for slider-editable puppet

import React, { useRef, useState, useEffect, useCallback } from "react";
import useAutoRig2D from "../../hooks/useAutoRig2D";
import "../../styles/IllustrationSegmenter.css";

// Joint definitions
const JOINT_SEQUENCE = [
  { id: "head_top", label: "Top of Head", color: "#f59e0b", group: "head" },
  { id: "chin", label: "Chin", color: "#f59e0b", group: "head" },
  { id: "neck", label: "Neck / Collar", color: "#ef4444", group: "torso" },
  { id: "left_shoulder", label: "Left Shoulder", color: "#ef4444", group: "torso" },
  { id: "right_shoulder", label: "Right Shoulder", color: "#ef4444", group: "torso" },
  { id: "left_elbow", label: "Left Elbow", color: "#3b82f6", group: "left_arm" },
  { id: "left_wrist", label: "Left Wrist / Hand", color: "#3b82f6", group: "left_arm" },
  { id: "right_elbow", label: "Right Elbow", color: "#8b5cf6", group: "right_arm" },
  { id: "right_wrist", label: "Right Wrist / Hand", color: "#8b5cf6", group: "right_arm" },
  { id: "left_hip", label: "Left Hip", color: "#ef4444", group: "torso" },
  { id: "right_hip", label: "Right Hip", color: "#ef4444", group: "torso" },
  { id: "left_knee", label: "Left Knee", color: "#10b981", group: "left_leg" },
  { id: "left_ankle", label: "Left Ankle / Foot", color: "#10b981", group: "left_leg" },
  { id: "right_knee", label: "Right Knee", color: "#06b6d4", group: "right_leg" },
  { id: "right_ankle", label: "Right Ankle / Foot", color: "#06b6d4", group: "right_leg" },
];

// Body part crop definitions
const BODY_PARTS = {
  head: {
    label: "Head",
    joints: ["head_top", "chin", "left_shoulder", "right_shoulder"],
    crop: (joints, padding) => {
      const top = joints.head_top;
      const chin = joints.chin;
      const ls = joints.left_shoulder;
      const rs = joints.right_shoulder;
      const cx = (top.x + chin.x) / 2;
      const headW = Math.abs(ls.x - rs.x) * 0.6;
      const headH = Math.abs(top.y - chin.y);
      return {
        x: cx - headW / 2 - padding, y: top.y - padding,
        w: headW + padding * 2, h: headH + padding * 2,
        pivotX: 0.5, pivotY: 1.0,
      };
    },
  },
  torso: {
    label: "Torso",
    joints: ["neck", "left_shoulder", "right_shoulder", "left_hip", "right_hip"],
    crop: (joints, padding) => {
      const minX = Math.min(joints.left_shoulder.x, joints.right_shoulder.x);
      const maxX = Math.max(joints.left_shoulder.x, joints.right_shoulder.x);
      const topY = joints.neck.y;
      const botY = Math.max(joints.left_hip.y, joints.right_hip.y);
      return {
        x: minX - padding, y: topY - padding,
        w: maxX - minX + padding * 2, h: botY - topY + padding * 2,
        pivotX: 0.5, pivotY: 0.0,
      };
    },
  },
  left_upper_arm: {
    label: "L Upper Arm",
    joints: ["left_shoulder", "left_elbow"],
    crop: (j, p) => limbCrop(j.left_shoulder, j.left_elbow, p),
  },
  left_lower_arm: {
    label: "L Lower Arm",
    joints: ["left_elbow", "left_wrist"],
    crop: (j, p) => limbCrop(j.left_elbow, j.left_wrist, p),
  },
  right_upper_arm: {
    label: "R Upper Arm",
    joints: ["right_shoulder", "right_elbow"],
    crop: (j, p) => limbCrop(j.right_shoulder, j.right_elbow, p),
  },
  right_lower_arm: {
    label: "R Lower Arm",
    joints: ["right_elbow", "right_wrist"],
    crop: (j, p) => limbCrop(j.right_elbow, j.right_wrist, p),
  },
  left_upper_leg: {
    label: "L Upper Leg",
    joints: ["left_hip", "left_knee"],
    crop: (j, p) => limbCrop(j.left_hip, j.left_knee, p),
  },
  left_lower_leg: {
    label: "L Lower Leg",
    joints: ["left_knee", "left_ankle"],
    crop: (j, p) => limbCrop(j.left_knee, j.left_ankle, p),
  },
  right_upper_leg: {
    label: "R Upper Leg",
    joints: ["right_hip", "right_knee"],
    crop: (j, p) => limbCrop(j.right_hip, j.right_knee, p),
  },
  right_lower_leg: {
    label: "R Lower Leg",
    joints: ["right_knee", "right_ankle"],
    crop: (j, p) => limbCrop(j.right_knee, j.right_ankle, p),
  },
};

const limbCrop = (from, to, padding) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const width = Math.sqrt(dx * dx + dy * dy) * 0.4;
  return {
    x: Math.min(from.x, to.x) - width / 2 - padding,
    y: Math.min(from.y, to.y) - padding,
    w: Math.abs(dx) + width + padding * 2,
    h: Math.abs(dy) + padding * 2,
    angle: Math.atan2(dy, dx),
    pivotX: from.x < to.x ? 0.0 : 1.0,
    pivotY: from.y < to.y ? 0.0 : 1.0,
  };
};

const IllustrationSegmenter = ({ onSegmented }) => {
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const [image, setImage] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ w: 0, h: 0 });
  const [joints, setJoints] = useState({});
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [dragJoint, setDragJoint] = useState(null);
  const [segmentedParts, setSegmentedParts] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [mode, setMode] = useState("auto"); // "auto" | "manual" | "adjust"

  // Auto-rig hook
  const { detectJoints, detectedJoints, status: autoStatus, confidence, reset: resetAutoRig } = useAutoRig2D();

  // Load uploaded image and auto-detect
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = async () => {
      imageRef.current = img;

      const maxW = 500;
      const maxH = 600;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);

      setImageDimensions({ w: img.width * scale, h: img.height * scale });
      setCanvasScale(scale);
      setImage(URL.createObjectURL(file));
      setJoints({});
      setCurrentStep(0);
      setIsComplete(false);
      setSegmentedParts(null);
      setMode("auto");
      resetAutoRig();

      // Auto-detect joints
      const detected = await detectJoints(img, img.width * scale, img.height * scale);
      if (detected) {
        const cleanJoints = {};
        Object.entries(detected).forEach(([id, data]) => {
          cleanJoints[id] = { x: data.x, y: data.y };
        });
        setJoints(cleanJoints);
        setIsComplete(true);
        setMode("adjust");
      } else {
        setMode("manual");
      }
    };
    img.src = URL.createObjectURL(file);
  };

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw placed joints
    Object.entries(joints).forEach(([id, pos]) => {
      const def = JOINT_SEQUENCE.find((j) => j.id === id);
      if (!def) return;

      const autoData = detectedJoints?.[id];
      const isLowConfidence = autoData && autoData.confidence < 0.4;

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isLowConfidence ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isLowConfidence ? "#ef444433" : def.color + "33";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = isLowConfidence ? "#ef4444" : def.color;
      ctx.fill();

      ctx.strokeStyle = isLowConfidence ? "#fca5a5" : "white";
      ctx.lineWidth = isLowConfidence ? 2 : 1.5;
      ctx.setLineDash(isLowConfidence ? [3, 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "white";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(def.label, pos.x, pos.y - 14);
    });

    // Skeleton bones
    const drawBone = (fromId, toId, color) => {
      if (joints[fromId] && joints[toId]) {
        ctx.strokeStyle = color + "88";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(joints[fromId].x, joints[fromId].y);
        ctx.lineTo(joints[toId].x, joints[toId].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };

    drawBone("head_top", "chin", "#f59e0b");
    drawBone("chin", "neck", "#f59e0b");
    drawBone("neck", "left_shoulder", "#ef4444");
    drawBone("neck", "right_shoulder", "#ef4444");
    drawBone("left_shoulder", "left_elbow", "#3b82f6");
    drawBone("left_elbow", "left_wrist", "#3b82f6");
    drawBone("right_shoulder", "right_elbow", "#8b5cf6");
    drawBone("right_elbow", "right_wrist", "#8b5cf6");
    drawBone("left_shoulder", "left_hip", "#ef4444");
    drawBone("right_shoulder", "right_hip", "#ef4444");
    drawBone("left_hip", "right_hip", "#ef4444");
    drawBone("left_hip", "left_knee", "#10b981");
    drawBone("left_knee", "left_ankle", "#10b981");
    drawBone("right_hip", "right_knee", "#06b6d4");
    drawBone("right_knee", "right_ankle", "#06b6d4");
  }, [joints, currentStep, isComplete, mode, detectedJoints]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  // Canvas click
  const handleCanvasClick = (e) => {
    if (!image) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Drag existing joint
    for (const [id, pos] of Object.entries(joints)) {
      const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
      if (dist < 15) {
        setDragJoint(id);
        return;
      }
    }

    // Manual: place next joint
    if (mode === "manual" && !isComplete) {
      const joint = JOINT_SEQUENCE[currentStep];
      if (!joint) return;

      const newJoints = { ...joints, [joint.id]: { x, y } };
      setJoints(newJoints);

      if (currentStep + 1 >= JOINT_SEQUENCE.length) {
        setIsComplete(true);
      } else {
        setCurrentStep(currentStep + 1);
      }
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!dragJoint) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    setJoints((prev) => ({ ...prev, [dragJoint]: { x, y } }));
  };

  const handleCanvasMouseUp = () => { setDragJoint(null); };

  const switchToManual = () => {
    setMode("manual");
    setJoints({});
    setCurrentStep(0);
    setIsComplete(false);
    setSegmentedParts(null);
  };

  const handleUndo = () => {
    if (mode !== "manual") return;
    if (currentStep <= 0 && !isComplete) return;

    if (isComplete) {
      setIsComplete(false);
      const lastJoint = JOINT_SEQUENCE[JOINT_SEQUENCE.length - 1];
      const newJoints = { ...joints };
      delete newJoints[lastJoint.id];
      setJoints(newJoints);
      setCurrentStep(JOINT_SEQUENCE.length - 1);
    } else {
      const prevJoint = JOINT_SEQUENCE[currentStep - 1];
      const newJoints = { ...joints };
      delete newJoints[prevJoint.id];
      setJoints(newJoints);
      setCurrentStep(currentStep - 1);
    }
    setSegmentedParts(null);
  };

  const handleReset = () => {
    setJoints({});
    setCurrentStep(0);
    setIsComplete(false);
    setSegmentedParts(null);
    setMode("auto");
    resetAutoRig();
  };

  // Segment illustration into body parts
  const handleSegment = () => {
    const img = imageRef.current;
    if (!img || !isComplete) return;

    const padding = 8;
    const parts = {};

    Object.entries(BODY_PARTS).forEach(([partId, partDef]) => {
      const hasAllJoints = partDef.joints.every((j) => joints[j]);
      if (!hasAllJoints) return;

      const originalJoints = {};
      partDef.joints.forEach((j) => {
        originalJoints[j] = {
          x: joints[j].x / canvasScale,
          y: joints[j].y / canvasScale,
        };
      });

      const region = partDef.crop(originalJoints, padding / canvasScale);

      const sx = Math.max(0, Math.floor(region.x));
      const sy = Math.max(0, Math.floor(region.y));
      const sw = Math.min(img.width - sx, Math.ceil(region.w));
      const sh = Math.min(img.height - sy, Math.ceil(region.h));
      if (sw <= 0 || sh <= 0) return;

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cropCtx = cropCanvas.getContext("2d");
      cropCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      const partImg = new Image();
      partImg.src = cropCanvas.toDataURL("image/png");

      parts[partId] = {
        image: partImg,
        region: { x: sx, y: sy, w: sw, h: sh },
        pivot: { x: region.pivotX, y: region.pivotY },
        angle: region.angle || 0,
      };
    });

    setSegmentedParts(parts);

    if (onSegmented) {
      const partImages = Object.values(parts).map((p) => p.image);
      let loaded = 0;
      const checkDone = () => {
        loaded++;
        if (loaded >= partImages.length) {
          onSegmented({
            head: parts.head?.image || null,
            torso: parts.torso?.image || null,
            upperArm: parts.left_upper_arm?.image || parts.right_upper_arm?.image || null,
            lowerArm: parts.left_lower_arm?.image || parts.right_lower_arm?.image || null,
            upperLeg: parts.left_upper_leg?.image || parts.right_upper_leg?.image || null,
            lowerLeg: parts.left_lower_leg?.image || parts.right_lower_leg?.image || null,
            allParts: parts,
            loaded: true,
          });
        }
      };
      partImages.forEach((img) => {
        if (img.complete) checkDone();
        else img.onload = checkDone;
      });
    }
  };

  return (
    <div className="illus-segmenter">
      {/* Upload */}
      {!image && (
        <label className="illus-upload-area">
          <div className="illus-upload-icon">🎨</div>
          <div className="illus-upload-text">Upload Character Illustration</div>
          <div className="illus-upload-hint">
            Auto-rigging detects the skeleton automatically.
            <br />PNG or JPG — clear human proportions work best.
          </div>
          <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
        </label>
      )}

      {image && (
        <>
          {/* Status bar */}
          <div className="illus-status-bar">
            {(autoStatus === "loading" || autoStatus === "detecting") && (
              <div className="illus-status illus-status--loading">
                <div className="illus-spinner" />
                {autoStatus === "loading" ? "Loading pose detector..." : "Auto-detecting skeleton..."}
              </div>
            )}
            {autoStatus === "success" && mode === "adjust" && (
              <div className="illus-status illus-status--success">
                ✅ Auto-rigged ({(confidence * 100).toFixed(0)}% confidence)
                — <strong>drag joints</strong> to adjust, then Segment.
                <button className="illus-mode-switch" onClick={switchToManual}>
                  Switch to Manual
                </button>
              </div>
            )}
            {(autoStatus === "failed" && mode === "manual") && (
              <div className="illus-status illus-status--manual">
                ⚠️ Auto-detect failed — manual mode active.
              </div>
            )}
            {(autoStatus !== "failed" && mode === "manual") && (
              <div className="illus-status illus-status--manual">
                ✏️ Manual mode — click to place each joint.
              </div>
            )}
          </div>

          {/* Manual step instructions */}
          {mode === "manual" && !isComplete && currentStep < JOINT_SEQUENCE.length && (
            <div className="illus-instructions">
              <span className="illus-step-badge">{currentStep + 1}/{JOINT_SEQUENCE.length}</span>
              Click on{" "}
              <strong style={{ color: JOINT_SEQUENCE[currentStep]?.color }}>
                {JOINT_SEQUENCE[currentStep]?.label}
              </strong>
            </div>
          )}

          {isComplete && !segmentedParts && (
            <div className="illus-instructions">
              ✅ All joints placed — click <strong>Segment</strong> to create puppet parts
            </div>
          )}

          {segmentedParts && (
            <div className="illus-instructions">
              🎭 Segmented! Adjust proportions with the sliders.
            </div>
          )}

          {/* Canvas */}
          <div className="illus-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={imageDimensions.w}
              height={imageDimensions.h}
              onClick={handleCanvasClick}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              className="illus-canvas"
              style={{
                cursor: dragJoint ? "grabbing"
                  : mode === "adjust" ? "grab"
                  : isComplete ? "default"
                  : "crosshair",
              }}
            />
          </div>

          {/* Controls */}
          <div className="illus-controls">
            {mode === "manual" && (
              <button className="illus-btn illus-btn--undo" onClick={handleUndo}
                disabled={currentStep === 0 && !isComplete}>
                ↩ Undo
              </button>
            )}
            <button className="illus-btn illus-btn--reset" onClick={handleReset}>
              ↺ Reset
            </button>
            {isComplete && !segmentedParts && (
              <button className="illus-btn illus-btn--segment" onClick={handleSegment}>
                ✂️ Segment into Parts
              </button>
            )}
            <label className="illus-btn illus-btn--new">
              📂 New Image
              <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
            </label>
          </div>

          {/* Part previews */}
          {segmentedParts && (
            <div className="illus-parts-preview">
              <h6 className="illus-parts-title">Segmented Parts</h6>
              <div className="illus-parts-grid">
                {Object.entries(segmentedParts).map(([partId, part]) => (
                  <div key={partId} className="illus-part-thumb">
                    <img src={part.image.src} alt={partId}
                      style={{ maxWidth: "60px", maxHeight: "60px" }} />
                    <span>{BODY_PARTS[partId]?.label || partId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default IllustrationSegmenter;