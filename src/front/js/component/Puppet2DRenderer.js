// src/front/js/component/Puppet2DRenderer.js
// Canvas-based 2D puppet renderer driven by body pose + facial mocap data
// Draws character parts and animates them based on landmark positions

import React, { useRef, useEffect, useCallback } from "react";

// Default puppet style configuration
const DEFAULT_STYLE = {
  headRadius: 40,
  bodyWidth: 50,
  bodyHeight: 70,
  limbWidth: 14,
  upperArmLength: 55,
  lowerArmLength: 50,
  upperLegLength: 60,
  lowerLegLength: 55,
  handRadius: 10,
  footWidth: 20,
  footHeight: 10,
  // Colors
  skinColor: "#FFD4A3",
  bodyColor: "#4A90D9",
  limbColor: "#4A90D9",
  shoeColor: "#333333",
  eyeColor: "#222222",
  mouthColor: "#CC4444",
  browColor: "#664433",
  hairColor: "#4A3728",
};

// Convert normalized pose landmark to canvas coordinates
const toCanvas = (landmark, canvasWidth, canvasHeight, offsetX = 0, offsetY = 0) => {
  if (!landmark) return { x: canvasWidth / 2, y: canvasHeight / 2 };
  return {
    x: landmark.x * canvasWidth + offsetX,
    y: landmark.y * canvasHeight + offsetY,
  };
};

// Get angle between two points
const getAngle = (from, to) => {
  return Math.atan2(to.y - from.y, to.x - from.x);
};

// Draw a rounded limb segment
const drawLimb = (ctx, fromX, fromY, toX, toY, width, color) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
};

// Draw an ellipse
const drawEllipse = (ctx, x, y, rx, ry, color, fill = true) => {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
};

// Main puppet drawing function
const drawPuppet = (ctx, canvas, poseLandmarks, faceData, style, customParts) => {
  const W = canvas.width;
  const H = canvas.height;
  const s = style || DEFAULT_STYLE;

  ctx.clearRect(0, 0, W, H);

  if (!poseLandmarks || poseLandmarks.length < 33) return;

  // Key body landmarks
  const nose = toCanvas(poseLandmarks[0], W, H);
  const leftShoulder = toCanvas(poseLandmarks[11], W, H);
  const rightShoulder = toCanvas(poseLandmarks[12], W, H);
  const leftElbow = toCanvas(poseLandmarks[13], W, H);
  const rightElbow = toCanvas(poseLandmarks[14], W, H);
  const leftWrist = toCanvas(poseLandmarks[15], W, H);
  const rightWrist = toCanvas(poseLandmarks[16], W, H);
  const leftHip = toCanvas(poseLandmarks[23], W, H);
  const rightHip = toCanvas(poseLandmarks[24], W, H);
  const leftKnee = toCanvas(poseLandmarks[25], W, H);
  const rightKnee = toCanvas(poseLandmarks[26], W, H);
  const leftAnkle = toCanvas(poseLandmarks[27], W, H);
  const rightAnkle = toCanvas(poseLandmarks[28], W, H);

  // Derived positions
  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
  };
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };

  // === DRAW ORDER: back limbs -> body -> front limbs -> head ===

  // If using custom uploaded part images
  if (customParts && customParts.loaded) {
    drawCustomParts(ctx, customParts, {
      nose, leftShoulder, rightShoulder, leftElbow, rightElbow,
      leftWrist, rightWrist, leftHip, rightHip, leftKnee, rightKnee,
      leftAnkle, rightAnkle, shoulderCenter, hipCenter,
    }, faceData);
    return;
  }

  // === BUILT-IN SHAPE PUPPET ===

  // --- LEGS (draw behind body) ---
  // Left leg
  drawLimb(ctx, leftHip.x, leftHip.y, leftKnee.x, leftKnee.y, s.limbWidth, s.limbColor);
  drawLimb(ctx, leftKnee.x, leftKnee.y, leftAnkle.x, leftAnkle.y, s.limbWidth, s.limbColor);
  // Left foot
  drawEllipse(ctx, leftAnkle.x + 5, leftAnkle.y + 5, s.footWidth, s.footHeight, s.shoeColor);

  // Right leg
  drawLimb(ctx, rightHip.x, rightHip.y, rightKnee.x, rightKnee.y, s.limbWidth, s.limbColor);
  drawLimb(ctx, rightKnee.x, rightKnee.y, rightAnkle.x, rightAnkle.y, s.limbWidth, s.limbColor);
  // Right foot
  drawEllipse(ctx, rightAnkle.x + 5, rightAnkle.y + 5, s.footWidth, s.footHeight, s.shoeColor);

  // --- BODY (torso) ---
  ctx.fillStyle = s.bodyColor;
  ctx.beginPath();
  ctx.moveTo(leftShoulder.x, leftShoulder.y);
  ctx.lineTo(rightShoulder.x, rightShoulder.y);
  ctx.lineTo(rightHip.x, rightHip.y);
  ctx.lineTo(leftHip.x, leftHip.y);
  ctx.closePath();
  ctx.fill();

  // --- ARMS ---
  // Left arm
  drawLimb(ctx, leftShoulder.x, leftShoulder.y, leftElbow.x, leftElbow.y, s.limbWidth, s.skinColor);
  drawLimb(ctx, leftElbow.x, leftElbow.y, leftWrist.x, leftWrist.y, s.limbWidth, s.skinColor);
  drawEllipse(ctx, leftWrist.x, leftWrist.y, s.handRadius, s.handRadius, s.skinColor);

  // Right arm
  drawLimb(ctx, rightShoulder.x, rightShoulder.y, rightElbow.x, rightElbow.y, s.limbWidth, s.skinColor);
  drawLimb(ctx, rightElbow.x, rightElbow.y, rightWrist.x, rightWrist.y, s.limbWidth, s.skinColor);
  drawEllipse(ctx, rightWrist.x, rightWrist.y, s.handRadius, s.handRadius, s.skinColor);

  // --- NECK ---
  drawLimb(ctx, shoulderCenter.x, shoulderCenter.y, nose.x, nose.y - s.headRadius * 0.5, 12, s.skinColor);

  // --- HEAD ---
  const headX = nose.x;
  const headY = nose.y - s.headRadius * 0.3;
  const headRotation = faceData ? faceData.headRoll : 0;

  ctx.save();
  ctx.translate(headX, headY);
  ctx.rotate(headRotation || 0);

  // Head circle
  drawEllipse(ctx, 0, 0, s.headRadius, s.headRadius * 1.1, s.skinColor);

  // Hair (simple arc on top)
  ctx.fillStyle = s.hairColor;
  ctx.beginPath();
  ctx.arc(0, -s.headRadius * 0.2, s.headRadius * 1.05, Math.PI, 0);
  ctx.fill();

  // --- FACE (driven by facial mocap) ---
  if (faceData) {
    const eyeY = -5;
    const eyeSpacing = s.headRadius * 0.35;

    // Eyes
    const leftEyeOpen = faceData.leftEye || 1;
    const rightEyeOpen = faceData.rightEye || 1;

    // Left eye
    const leftEyeH = Math.max(1, 8 * leftEyeOpen);
    drawEllipse(ctx, -eyeSpacing, eyeY, 7, leftEyeH, "white");
    if (leftEyeOpen > 0.2) {
      const pupilOffsetX = (faceData.headYaw || 0) * 3;
      drawEllipse(ctx, -eyeSpacing + pupilOffsetX, eyeY, 3, 3, s.eyeColor);
    }

    // Right eye
    const rightEyeH = Math.max(1, 8 * rightEyeOpen);
    drawEllipse(ctx, eyeSpacing, eyeY, 7, rightEyeH, "white");
    if (rightEyeOpen > 0.2) {
      const pupilOffsetX = (faceData.headYaw || 0) * 3;
      drawEllipse(ctx, eyeSpacing + pupilOffsetX, eyeY, 3, 3, s.eyeColor);
    }

    // Eyebrows
    const leftBrowY = eyeY - 14 - (faceData.leftBrowRaise || 0) * 6;
    const rightBrowY = eyeY - 14 - (faceData.rightBrowRaise || 0) * 6;

    ctx.strokeStyle = s.browColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    // Left brow
    ctx.beginPath();
    ctx.moveTo(-eyeSpacing - 8, leftBrowY + 2);
    ctx.quadraticCurveTo(-eyeSpacing, leftBrowY - 2, -eyeSpacing + 8, leftBrowY);
    ctx.stroke();

    // Right brow
    ctx.beginPath();
    ctx.moveTo(eyeSpacing - 8, rightBrowY);
    ctx.quadraticCurveTo(eyeSpacing, rightBrowY - 2, eyeSpacing + 8, rightBrowY + 2);
    ctx.stroke();

    // Nose (simple)
    ctx.fillStyle = "#E8B888";
    ctx.beginPath();
    ctx.moveTo(0, eyeY + 5);
    ctx.lineTo(-4, eyeY + 15);
    ctx.lineTo(4, eyeY + 15);
    ctx.closePath();
    ctx.fill();

    // Mouth
    const mouthY = eyeY + 25;
    const mouthOpenAmount = (faceData.mouthOpen || 0) * 12;
    const smileAmount = (faceData.mouthSmile || 0.5);
    const mouthW = 12 + smileAmount * 8;

    if (mouthOpenAmount > 2) {
      // Open mouth
      ctx.fillStyle = "#882222";
      ctx.beginPath();
      ctx.ellipse(0, mouthY, mouthW, mouthOpenAmount, 0, 0, Math.PI * 2);
      ctx.fill();

      // Teeth hint
      ctx.fillStyle = "white";
      ctx.fillRect(-mouthW * 0.6, mouthY - mouthOpenAmount * 0.3, mouthW * 1.2, mouthOpenAmount * 0.3);
    } else {
      // Closed mouth / smile
      ctx.strokeStyle = s.mouthColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-mouthW, mouthY);
      ctx.quadraticCurveTo(0, mouthY + smileAmount * 10, mouthW, mouthY);
      ctx.stroke();
    }
  } else {
    // Default face (no face tracking data)
    drawEllipse(ctx, -12, -5, 5, 6, "white");
    drawEllipse(ctx, -12, -5, 2.5, 2.5, s.eyeColor);
    drawEllipse(ctx, 12, -5, 5, 6, "white");
    drawEllipse(ctx, 12, -5, 2.5, 2.5, s.eyeColor);

    ctx.strokeStyle = s.mouthColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 15, 10, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  ctx.restore();
};

// Draw custom uploaded character parts (images mapped to skeleton)
const drawCustomParts = (ctx, parts, positions, faceData) => {
  const drawPart = (image, x, y, angle, scaleX = 1, scaleY = 1) => {
    if (!image) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  };

  const { leftShoulder, rightShoulder, leftElbow, rightElbow,
    leftWrist, rightWrist, leftHip, rightHip, leftKnee, rightKnee,
    leftAnkle, rightAnkle, shoulderCenter, hipCenter, nose } = positions;

  // Torso
  const torsoAngle = getAngle(hipCenter, shoulderCenter);
  drawPart(parts.torso, shoulderCenter.x, (shoulderCenter.y + hipCenter.y) / 2, torsoAngle - Math.PI / 2);

  // Arms
  const leftUpperArmAngle = getAngle(leftShoulder, leftElbow);
  drawPart(parts.upperArm, (leftShoulder.x + leftElbow.x) / 2, (leftShoulder.y + leftElbow.y) / 2, leftUpperArmAngle);

  const leftLowerArmAngle = getAngle(leftElbow, leftWrist);
  drawPart(parts.lowerArm, (leftElbow.x + leftWrist.x) / 2, (leftElbow.y + leftWrist.y) / 2, leftLowerArmAngle);

  const rightUpperArmAngle = getAngle(rightShoulder, rightElbow);
  drawPart(parts.upperArm, (rightShoulder.x + rightElbow.x) / 2, (rightShoulder.y + rightElbow.y) / 2, rightUpperArmAngle, -1, 1);

  const rightLowerArmAngle = getAngle(rightElbow, rightWrist);
  drawPart(parts.lowerArm, (rightElbow.x + rightWrist.x) / 2, (rightElbow.y + rightWrist.y) / 2, rightLowerArmAngle, -1, 1);

  // Legs
  const leftUpperLegAngle = getAngle(leftHip, leftKnee);
  drawPart(parts.upperLeg, (leftHip.x + leftKnee.x) / 2, (leftHip.y + leftKnee.y) / 2, leftUpperLegAngle);

  const leftLowerLegAngle = getAngle(leftKnee, leftAnkle);
  drawPart(parts.lowerLeg, (leftKnee.x + leftAnkle.x) / 2, (leftKnee.y + leftAnkle.y) / 2, leftLowerLegAngle);

  const rightUpperLegAngle = getAngle(rightHip, rightKnee);
  drawPart(parts.upperLeg, (rightHip.x + rightKnee.x) / 2, (rightHip.y + rightKnee.y) / 2, rightUpperLegAngle, -1, 1);

  const rightLowerLegAngle = getAngle(rightKnee, rightAnkle);
  drawPart(parts.lowerLeg, (rightKnee.x + rightAnkle.x) / 2, (rightKnee.y + rightAnkle.y) / 2, rightLowerLegAngle, -1, 1);

  // Head
  const headAngle = faceData ? faceData.headRoll : 0;
  drawPart(parts.head, nose.x, nose.y - 30, headAngle);
};


// React component wrapper
const Puppet2DRenderer = ({ poseLandmarks, faceData, style, customParts, width = 640, height = 480 }) => {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawPuppet(ctx, canvas, poseLandmarks, faceData, style, customParts);
  }, [poseLandmarks, faceData, style, customParts]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        border: "1px solid #333",
        borderRadius: "8px",
        background: "#1a1a2e",
        width: "100%",
        maxWidth: `${width}px`,
        height: "auto",
      }}
    />
  );
};

export default Puppet2DRenderer;
export { drawPuppet, DEFAULT_STYLE };