// src/front/js/pages/BodyCustomizerPage.js
// Full body customization page with presets + sliders
// Live preview on both 2D puppet and 3D avatar
// Save body type to profile, use in mocap sessions

import React, { useState, useRef, useEffect, useCallback, useContext } from "react";
import { Context } from "../store/appContext";
import BodyCustomizer from "../component/BodyCustomizer";
import {
  DEFAULT_PROPORTIONS,
  BODY_PRESETS,
  proportionsToPuppetStyle,
  applyProportionsToAvatar,
} from "../utils/bodyPresets";
import "../../styles/BodyCustomizerPage.css";

// Simple 2D puppet preview canvas that responds to proportion changes
const PuppetPreview = ({ proportions }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const style = proportionsToPuppetStyle(proportions);
    const cx = w / 2;
    const groundY = h - 30;

    // Colors
    const skinColor = "#d4a574";
    const bodyColor = "#6366f1";
    const hairColor = "#2d1b4e";

    // Calculate positions from bottom up
    const totalLegLen = style.upperLegLength + style.lowerLegLength;
    const hipY = groundY - totalLegLen;
    const shoulderY = hipY - style.bodyHeight;
    const neckY = shoulderY - 8;
    const headY = neckY - style.headRadius;

    // Helper: draw rounded rect limb
    const drawLimb = (x1, y1, x2, y2, thickness, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    // Legs
    const legSpread = style.bodyWidth * 0.35;
    const kneeY = hipY + style.upperLegLength;

    // Left leg
    drawLimb(cx - legSpread, hipY, cx - legSpread - 2, kneeY, style.limbWidth + 2, skinColor);
    drawLimb(cx - legSpread - 2, kneeY, cx - legSpread, groundY, style.limbWidth, skinColor);

    // Right leg
    drawLimb(cx + legSpread, hipY, cx + legSpread + 2, kneeY, style.limbWidth + 2, skinColor);
    drawLimb(cx + legSpread + 2, kneeY, cx + legSpread, groundY, style.limbWidth, skinColor);

    // Feet
    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.ellipse(cx - legSpread, groundY, style.footWidth / 2, style.footHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + legSpread, groundY, style.footWidth / 2, style.footHeight / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Torso (tapered shape)
    const shoulderW = style.bodyWidth / 2 + style.shoulderWidthOffset;
    const hipW = style.bodyWidth / 2 + style.hipWidthOffset;
    const waistW = Math.min(shoulderW, hipW) - style.waistNarrow;
    const waistY = shoulderY + style.bodyHeight * 0.55;

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW, shoulderY);
    ctx.quadraticCurveTo(cx - waistW, waistY, cx - hipW, hipY);
    ctx.lineTo(cx + hipW, hipY);
    ctx.quadraticCurveTo(cx + waistW, waistY, cx + shoulderW, shoulderY);
    ctx.closePath();
    ctx.fill();

    // Chest highlight
    if (style.chestOffset > 3) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.ellipse(cx, shoulderY + 15, shoulderW * 0.6, style.chestOffset + 5, 0, 0, Math.PI);
      ctx.fill();
    }

    // Arms
    const elbowOffsetY = style.upperArmLength;
    const armThick = style.limbWidth;

    // Left arm
    drawLimb(cx - shoulderW, shoulderY + 5, cx - shoulderW - 15, shoulderY + elbowOffsetY, armThick, skinColor);
    drawLimb(cx - shoulderW - 15, shoulderY + elbowOffsetY, cx - shoulderW - 10, shoulderY + elbowOffsetY + style.lowerArmLength, armThick - 1, skinColor);

    // Right arm
    drawLimb(cx + shoulderW, shoulderY + 5, cx + shoulderW + 15, shoulderY + elbowOffsetY, armThick, skinColor);
    drawLimb(cx + shoulderW + 15, shoulderY + elbowOffsetY, cx + shoulderW + 10, shoulderY + elbowOffsetY + style.lowerArmLength, armThick - 1, skinColor);

    // Hands
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(cx - shoulderW - 10, shoulderY + elbowOffsetY + style.lowerArmLength, style.handRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + shoulderW + 10, shoulderY + elbowOffsetY + style.lowerArmLength, style.handRadius, 0, Math.PI * 2);
    ctx.fill();

    // Neck
    ctx.fillStyle = skinColor;
    ctx.fillRect(cx - style.neckWidth / 2, neckY, style.neckWidth, shoulderY - neckY + 3);

    // Head
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(cx, headY, style.headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = hairColor;
    ctx.beginPath();
    ctx.arc(cx, headY - 3, style.headRadius + 2, Math.PI, Math.PI * 2);
    ctx.fill();

    // Face
    const eyeY = headY - style.headRadius * 0.1;
    const eyeSpread = style.headRadius * 0.35;
    const eyeR = style.headRadius * 0.08;

    ctx.fillStyle = "#333";
    ctx.beginPath();
    ctx.arc(cx - eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + eyeSpread, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = "#8B6F5E";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, headY + style.headRadius * 0.3, style.headRadius * 0.2, 0, Math.PI);
    ctx.stroke();

  }, [proportions]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={480}
      className="puppet-preview-canvas"
    />
  );
};

// 3D preview using model-viewer or Three.js (placeholder for now, wires into existing avatar)
const Avatar3DPreview = ({ proportions }) => {
  const containerRef = useRef(null);

  // This would connect to your existing Three.js avatar viewer
  // For now, show bone scale values as a reference
  return (
    <div className="avatar-3d-preview" ref={containerRef}>
      <div className="avatar-3d-placeholder">
        <div className="avatar-3d-icon">🧍</div>
        <p>3D Preview</p>
        <p className="avatar-3d-hint">
          Connect your rigged avatar to see<br />
          bone scaling applied in real-time
        </p>
      </div>
    </div>
  );
};

const BodyCustomizerPage = () => {
  const { store, actions } = useContext(Context);
  const [proportions, setProportions] = useState({ ...DEFAULT_PROPORTIONS });
  const [activePreset, setActivePreset] = useState("average");
  const [saveStatus, setSaveStatus] = useState(null);
  const [previewMode, setPreviewMode] = useState("2d"); // "2d" | "3d" | "both"

  const handleProportionsChange = useCallback((newProportions, preset) => {
    setProportions(newProportions);
    setActivePreset(preset);
  }, []);

  // Save body type to backend
  const handleSave = async () => {
    try {
      setSaveStatus("saving");
      const token = sessionStorage.getItem("token") || localStorage.getItem("token");
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/save-body-type`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preset: activePreset,
          proportions: proportions,
        }),
      });

      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(null), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
    }
  };

  // Export proportions as JSON
  const handleExport = () => {
    const data = {
      format: "doppelflex_body_type",
      version: "1.0",
      preset: activePreset,
      proportions: proportions,
      puppetStyle: proportionsToPuppetStyle(proportions),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `body_type_${activePreset || "custom"}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import proportions from JSON
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.proportions) {
          setProportions(data.proportions);
          setActivePreset(data.preset || null);
        }
      } catch (err) {
        console.error("Invalid body type file:", err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="body-customizer-page">
      <div className="bcp-header">
        <div>
          <h2 className="bcp-title">Body Customizer</h2>
          <p className="bcp-subtitle">
            Choose a body type preset and fine-tune with sliders.
            Changes apply to both 2D puppet and 3D avatar.
          </p>
        </div>
        <div className="bcp-header-actions">
          <button
            className={`bcp-save-btn ${saveStatus === "saved" ? "bcp-save-btn--saved" : ""}`}
            onClick={handleSave}
            disabled={saveStatus === "saving"}
          >
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "💾 Save to Profile"}
          </button>
          <button className="bcp-export-btn" onClick={handleExport}>
            📥 Export
          </button>
          <label className="bcp-import-btn">
            📤 Import
            <input type="file" accept=".json" onChange={handleImport} hidden />
          </label>
        </div>
      </div>

      <div className="bcp-layout">
        {/* Left panel: Customizer controls */}
        <div className="bcp-controls">
          <BodyCustomizer
            onProportionsChange={handleProportionsChange}
            initialProportions={proportions}
            initialPreset={activePreset}
          />
        </div>

        {/* Center: Preview */}
        <div className="bcp-preview">
          {/* Preview mode toggle */}
          <div className="bcp-preview-tabs">
            <button
              className={`bcp-tab ${previewMode === "2d" ? "bcp-tab--active" : ""}`}
              onClick={() => setPreviewMode("2d")}
            >
              2D Puppet
            </button>
            <button
              className={`bcp-tab ${previewMode === "3d" ? "bcp-tab--active" : ""}`}
              onClick={() => setPreviewMode("3d")}
            >
              3D Avatar
            </button>
            <button
              className={`bcp-tab ${previewMode === "both" ? "bcp-tab--active" : ""}`}
              onClick={() => setPreviewMode("both")}
            >
              Both
            </button>
          </div>

          <div className={`bcp-preview-area ${previewMode === "both" ? "bcp-preview-area--split" : ""}`}>
            {(previewMode === "2d" || previewMode === "both") && (
              <div className="bcp-preview-panel">
                <PuppetPreview proportions={proportions} />
                <span className="bcp-preview-label">2D Puppet</span>
              </div>
            )}
            {(previewMode === "3d" || previewMode === "both") && (
              <div className="bcp-preview-panel">
                <Avatar3DPreview proportions={proportions} />
                <span className="bcp-preview-label">3D Avatar</span>
              </div>
            )}
          </div>

          {/* Active preset badge */}
          <div className="bcp-active-preset">
            {activePreset ? (
              <span className="bcp-preset-badge">
                {BODY_PRESETS[activePreset]?.emoji} {BODY_PRESETS[activePreset]?.label}
                <span className="bcp-preset-badge-desc">
                  — {BODY_PRESETS[activePreset]?.description}
                </span>
              </span>
            ) : (
              <span className="bcp-preset-badge bcp-preset-badge--custom">
                ✏️ Custom Body Type
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BodyCustomizerPage;