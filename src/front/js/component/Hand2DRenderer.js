// src/front/js/component/Hand2DRenderer.js
// Draws 2D hands on canvas driven by useHandMocap data
// Shows all 21 landmarks with finger connections and gesture label

import React from "react";

// MediaPipe hand connections (pairs of landmark indices to draw lines between)
const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17],
];

// Finger tip indices for highlighting
const FINGER_TIPS = [4, 8, 12, 16, 20];
const FINGER_NAMES = ["thumb", "index", "middle", "ring", "pinky"];

// Color scheme per finger
const FINGER_COLORS = {
  thumb: "#FF6B6B",
  index: "#4ECDC4",
  middle: "#45B7D1",
  ring: "#96CEB4",
  pinky: "#FFEAA7",
  palm: "#DDA0DD",
};

const getFingerForConnection = (a, b) => {
  if (a <= 4 || b <= 4) return "thumb";
  if ((a >= 5 && a <= 8) || (b >= 5 && b <= 8)) return "index";
  if ((a >= 9 && a <= 12) || (b >= 9 && b <= 12)) return "middle";
  if ((a >= 13 && a <= 16) || (b >= 13 && b <= 16)) return "ring";
  if ((a >= 17 && a <= 20) || (b >= 17 && b <= 20)) return "pinky";
  return "palm";
};

/**
 * Draw a single hand on canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} handData - from useHandMocap (left or right)
 * @param {number} offsetX - horizontal offset for positioning
 * @param {number} offsetY - vertical offset for positioning
 * @param {number} scale - scale factor
 * @param {boolean} mirror - mirror for left/right hand display
 */
export const drawHand = (ctx, handData, offsetX = 0, offsetY = 0, scale = 400, mirror = false) => {
  if (!handData || !handData.rawLandmarks) return;

  const landmarks = handData.rawLandmarks;

  // Convert normalized coordinates to canvas space
  const toPos = (lm) => ({
    x: (mirror ? (1 - lm.x) : lm.x) * scale + offsetX,
    y: lm.y * scale + offsetY,
  });

  // Draw connections (bones)
  HAND_CONNECTIONS.forEach(([a, b]) => {
    const posA = toPos(landmarks[a]);
    const posB = toPos(landmarks[b]);
    const finger = getFingerForConnection(a, b);

    ctx.strokeStyle = FINGER_COLORS[finger];
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(posA.x, posA.y);
    ctx.lineTo(posB.x, posB.y);
    ctx.stroke();
  });

  // Draw joints
  landmarks.forEach((lm, i) => {
    const pos = toPos(lm);
    const isTip = FINGER_TIPS.includes(i);
    const radius = isTip ? 6 : 4;

    // Determine color based on which finger
    let color = "#FFFFFF";
    if (i <= 4) color = FINGER_COLORS.thumb;
    else if (i <= 8) color = FINGER_COLORS.index;
    else if (i <= 12) color = FINGER_COLORS.middle;
    else if (i <= 16) color = FINGER_COLORS.ring;
    else if (i <= 20) color = FINGER_COLORS.pinky;

    // Wrist
    if (i === 0) {
      color = "#FFFFFF";
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Outline for tips
    if (isTip) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // Draw gesture label
  if (handData.gesture && handData.gesture !== "unknown") {
    const wristPos = toPos(landmarks[0]);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(handData.gesture.toUpperCase(), wristPos.x, wristPos.y + 30);
  }

  // Draw pinch indicator
  if (handData.indexPinch > 0.5) {
    const thumbTip = toPos(landmarks[4]);
    const indexTip = toPos(landmarks[8]);
    const midX = (thumbTip.x + indexTip.x) / 2;
    const midY = (thumbTip.y + indexTip.y) / 2;

    ctx.strokeStyle = `rgba(255, 215, 0, ${handData.indexPinch})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(midX, midY, 12, 0, Math.PI * 2);
    ctx.stroke();
  }
};

/**
 * Draw finger curl bar indicators
 */
export const drawFingerBars = (ctx, handData, x, y, label) => {
  if (!handData) return;

  ctx.fillStyle = "#AAAAAA";
  ctx.font = "12px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`${label} Hand`, x, y);

  const fingers = [
    { name: "T", value: handData.thumbCurl },
    { name: "I", value: handData.indexCurl },
    { name: "M", value: handData.middleCurl },
    { name: "R", value: handData.ringCurl },
    { name: "P", value: handData.pinkyCurl },
  ];

  const barWidth = 30;
  const barMaxHeight = 40;
  const gap = 6;

  fingers.forEach((f, i) => {
    const bx = x + i * (barWidth + gap);
    const by = y + 10;
    const barHeight = f.value * barMaxHeight;

    // Background
    ctx.fillStyle = "#333333";
    ctx.fillRect(bx, by, barWidth, barMaxHeight);

    // Fill (green = extended, red = curled)
    const r = Math.floor(f.value * 255);
    const g = Math.floor((1 - f.value) * 255);
    ctx.fillStyle = `rgb(${r}, ${g}, 80)`;
    ctx.fillRect(bx, by + (barMaxHeight - barHeight), barWidth, barHeight);

    // Label
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(f.name, bx + barWidth / 2, by + barMaxHeight + 12);
  });

  // Spread indicator
  ctx.fillStyle = "#AAAAAA";
  ctx.font = "10px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Spread: ${(handData.fingerSpread * 100).toFixed(0)}%`, x, y + barMaxHeight + 30);
  ctx.fillText(`Gesture: ${handData.gesture || "—"}`, x, y + barMaxHeight + 44);
};