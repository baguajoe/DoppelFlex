// src/front/js/pages/IllustrationPuppetPage.js
// Upload illustration → auto-rig or manual joints → segment → edit with body sliders
// Illustration parts map to puppet skeleton, sliders scale each piece

import React, { useState, useRef, useEffect, useCallback } from "react";
import IllustrationSegmenter from "../component/IllustrationSegmenter";
import BodyCustomizer from "../component/BodyCustomizer";
import {
  DEFAULT_PROPORTIONS,
  BODY_PRESETS,
  proportionsToPuppetStyle,
} from "../utils/bodyPresets";
import "../../styles/IllustrationPuppetPage.css";

// Illustration puppet renderer - draws segmented parts scaled by proportions
const IllustrationPuppetCanvas = ({ parts, proportions }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parts || !parts.loaded) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const style = proportionsToPuppetStyle(proportions);
    const cx = W / 2;
    const groundY = H - 30;

    const totalLegLen = style.upperLegLength + style.lowerLegLength;
    const hipY = groundY - totalLegLen;
    const shoulderY = hipY - style.bodyHeight;
    const neckY = shoulderY - 8;
    const headY = neckY - style.headRadius;

    const shoulderW = style.bodyWidth / 2 + style.shoulderWidthOffset;
    const legSpread = style.bodyWidth * 0.35;
    const kneeY = hipY + style.upperLegLength;

    const drawPart = (img, targetX, targetY, targetW, targetH, flipX = false) => {
      if (!img || !img.complete || img.width === 0) return;
      ctx.save();
      ctx.translate(targetX, targetY);
      if (flipX) {
        ctx.scale(-1, 1);
        ctx.translate(-targetW, 0);
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      ctx.restore();
    };

    // Head
    if (parts.head) {
      const headW = style.headRadius * 2.2;
      const headH = style.headRadius * 2.4;
      drawPart(parts.head, cx - headW / 2, headY - style.headRadius, headW, headH);
    }

    // Torso
    if (parts.torso) {
      const torsoW = shoulderW * 2 + 10;
      const torsoH = style.bodyHeight + 10;
      drawPart(parts.torso, cx - torsoW / 2, shoulderY - 5, torsoW, torsoH);
    }

    // Left arm
    const leftShoulderX = cx - shoulderW;
    const leftElbowY = shoulderY + style.upperArmLength;

    if (parts.upperArm) {
      const armW = style.limbWidth + 10;
      drawPart(parts.upperArm, leftShoulderX - armW / 2 - 15, shoulderY,
        armW + 15, style.upperArmLength);
    }
    if (parts.lowerArm) {
      const armW = style.limbWidth + 8;
      drawPart(parts.lowerArm, leftShoulderX - armW / 2 - 10, leftElbowY,
        armW + 10, style.lowerArmLength);
    }

    // Right arm (flipped)
    const rightShoulderX = cx + shoulderW;
    if (parts.upperArm) {
      const armW = style.limbWidth + 10;
      drawPart(parts.upperArm, rightShoulderX - armW / 2, shoulderY,
        armW + 15, style.upperArmLength, true);
    }
    if (parts.lowerArm) {
      const armW = style.limbWidth + 8;
      drawPart(parts.lowerArm, rightShoulderX - armW / 2 + 5, leftElbowY,
        armW + 10, style.lowerArmLength, true);
    }

    // Left leg
    if (parts.upperLeg) {
      const legW = style.limbWidth + 10;
      drawPart(parts.upperLeg, cx - legSpread - legW / 2, hipY,
        legW, style.upperLegLength);
    }
    if (parts.lowerLeg) {
      const legW = style.limbWidth + 8;
      drawPart(parts.lowerLeg, cx - legSpread - legW / 2, kneeY,
        legW, style.lowerLegLength);
    }

    // Right leg (flipped)
    if (parts.upperLeg) {
      const legW = style.limbWidth + 10;
      drawPart(parts.upperLeg, cx + legSpread - legW / 2, hipY,
        legW, style.upperLegLength, true);
    }
    if (parts.lowerLeg) {
      const legW = style.limbWidth + 8;
      drawPart(parts.lowerLeg, cx + legSpread - legW / 2, kneeY,
        legW, style.lowerLegLength, true);
    }
  }, [parts, proportions]);

  return (
    <canvas ref={canvasRef} width={400} height={560} className="illus-puppet-canvas" />
  );
};


// ─── Main Page ───
const IllustrationPuppetPage = () => {
  const [proportions, setProportions] = useState({ ...DEFAULT_PROPORTIONS });
  const [activePreset, setActivePreset] = useState("average");
  const [segmentedParts, setSegmentedParts] = useState(null);
  const [step, setStep] = useState("upload");

  const handleProportionsChange = useCallback((newProportions, preset) => {
    setProportions(newProportions);
    setActivePreset(preset);
  }, []);

  const handleSegmented = useCallback((parts) => {
    setSegmentedParts(parts);
    setStep("edit");
  }, []);

  const handleExport = () => {
    const data = {
      format: "doppelflex_illustration_puppet",
      version: "1.0",
      preset: activePreset,
      proportions: proportions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `illustration_puppet_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="illus-puppet-page">
      <div className="ipp-header">
        <div>
          <h2 className="ipp-title">Illustration to Puppet</h2>
          <p className="ipp-subtitle">
            Upload a character drawing — auto-rigging detects the skeleton, then use sliders to edit body proportions in real-time.
          </p>
        </div>
        {segmentedParts && (
          <button className="ipp-export-btn" onClick={handleExport}>📥 Export</button>
        )}
      </div>

      {/* Steps */}
      <div className="ipp-steps">
        <div className={`ipp-step ${step === "edit" ? "ipp-step--done" : "ipp-step--active"}`}>
          <span className="ipp-step-num">1</span>
          <span>Upload & Auto-Rig</span>
        </div>
        <div className="ipp-step-arrow">→</div>
        <div className={`ipp-step ${segmentedParts ? "ipp-step--done" : ""}`}>
          <span className="ipp-step-num">2</span>
          <span>Segment Parts</span>
        </div>
        <div className="ipp-step-arrow">→</div>
        <div className={`ipp-step ${step === "edit" ? "ipp-step--active" : ""}`}>
          <span className="ipp-step-num">3</span>
          <span>Edit with Sliders</span>
        </div>
      </div>

      <div className="ipp-layout">
        {/* Left: Segmenter */}
        <div className="ipp-segmenter-panel">
          <IllustrationSegmenter onSegmented={handleSegmented} />
        </div>

        {/* Right: Sliders + puppet */}
        <div className="ipp-edit-panel">
          {segmentedParts ? (
            <>
              <div className="ipp-sliders">
                <BodyCustomizer
                  onProportionsChange={handleProportionsChange}
                  initialProportions={proportions}
                  initialPreset={activePreset}
                />
              </div>
              <div className="ipp-preview">
                <IllustrationPuppetCanvas parts={segmentedParts} proportions={proportions} />
                <div className="ipp-preview-label">
                  {activePreset
                    ? <span>{BODY_PRESETS[activePreset]?.emoji} {BODY_PRESETS[activePreset]?.label}</span>
                    : <span>✏️ Custom</span>
                  }
                </div>
              </div>
            </>
          ) : (
            <div className="ipp-waiting">
              <div className="ipp-waiting-icon">✂️</div>
              <h5>Waiting for segmentation</h5>
              <p>
                Upload an illustration — joints will be detected automatically.
                Adjust if needed, then click "Segment into Parts" to enable slider editing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IllustrationPuppetPage;