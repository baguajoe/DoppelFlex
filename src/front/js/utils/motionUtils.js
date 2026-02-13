// motionUtils.js — Pose processing and avatar rig mapping utilities
// Drop into: src/utils/motionUtils.js (replaces the stub version)

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
// MediaPipe Pose landmark indices
// ─────────────────────────────────────────────────────────────
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
};

// ─────────────────────────────────────────────────────────────
// Process raw landmarks into structured pose data
// ─────────────────────────────────────────────────────────────
/**
 * Convert MediaPipe landmark array into a keyed object for easy access.
 * 
 * @param {Array} landmarks - MediaPipe Pose landmarks (33 points)
 * @returns {Object} Keyed landmarks: { nose: {x,y,z,vis}, leftShoulder: {...}, ... }
 */
export const processPoseData = (landmarks) => {
  if (!landmarks || landmarks.length < 33) return null;

  const get = (idx) => ({
    x: landmarks[idx].x,
    y: landmarks[idx].y,
    z: landmarks[idx].z,
    visibility: landmarks[idx].visibility || 0,
  });

  return {
    nose: get(0),
    leftShoulder: get(11),  rightShoulder: get(12),
    leftElbow: get(13),     rightElbow: get(14),
    leftWrist: get(15),     rightWrist: get(16),
    leftHip: get(23),       rightHip: get(24),
    leftKnee: get(25),      rightKnee: get(26),
    leftAnkle: get(27),     rightAnkle: get(28),
    leftHeel: get(29),      rightHeel: get(30),
    leftFoot: get(31),      rightFoot: get(32),
    // Computed
    midShoulder: midpoint(get(11), get(12)),
    midHip: midpoint(get(23), get(24)),
  };
};

// ─────────────────────────────────────────────────────────────
// Compute midpoint between two landmarks
// ─────────────────────────────────────────────────────────────
function midpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

// ─────────────────────────────────────────────────────────────
// Compute angle between three landmarks (in radians)
// ─────────────────────────────────────────────────────────────
/**
 * Calculate the angle at point B formed by A→B→C
 * 
 * @param {Object} a - First landmark {x, y, z}
 * @param {Object} b - Middle landmark (vertex of angle)
 * @param {Object} c - Third landmark
 * @returns {number} Angle in radians
 */
export const computeAngle = (a, b, c) => {
  const ba = new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
  const bc = new THREE.Vector3(c.x - b.x, c.y - b.y, c.z - b.z);
  
  const dot = ba.dot(bc);
  const cross = ba.length() * bc.length();
  
  if (cross === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / cross)));
};

// ─────────────────────────────────────────────────────────────
// Compute limb rotation quaternion
// ─────────────────────────────────────────────────────────────
/**
 * Given parent and child landmarks, compute the rotation needed
 * to point a bone from its rest direction to the detected direction.
 * 
 * @param {Object} parent - Parent landmark {x, y, z}
 * @param {Object} child - Child landmark {x, y, z}
 * @param {THREE.Vector3} restDir - Bone's direction in rest/T-pose
 * @returns {THREE.Quaternion}
 */
export const computeLimbQuaternion = (parent, child, restDir) => {
  const currentDir = new THREE.Vector3(
    (child.x - parent.x),
    -(child.y - parent.y),  // Flip Y (MediaPipe Y is down)
    -(child.z - parent.z),  // Flip Z
  ).normalize();

  return new THREE.Quaternion().setFromUnitVectors(restDir.clone().normalize(), currentDir);
};

// ─────────────────────────────────────────────────────────────
// Apply full pose to avatar skeleton (rotation-based)
// ─────────────────────────────────────────────────────────────
/**
 * Apply MediaPipe pose landmarks to an avatar's skeleton using rotations.
 * This is the core function that makes the avatar move.
 * 
 * @param {Object} pose - Output from processPoseData()
 * @param {Object} bones - Keyed bone references from the skeleton
 * @param {Object} options - { damping: 0.3 } for lerp smoothing
 */
export const mapPoseToRig = (pose, bones, options = {}) => {
  if (!pose || !bones) return;
  
  const damp = options.damping || 1.0; // 1.0 = instant, 0.3 = smooth

  // Helper: apply rotation with optional damping
  const applyRotation = (bone, quat) => {
    if (!bone) return;
    if (damp >= 1.0) {
      bone.quaternion.copy(quat);
    } else {
      bone.quaternion.slerp(quat, damp);
    }
  };

  // REST DIRECTIONS (T-pose)
  const LEFT = new THREE.Vector3(-1, 0, 0);   // Left arm points left
  const RIGHT = new THREE.Vector3(1, 0, 0);   // Right arm points right
  const DOWN = new THREE.Vector3(0, -1, 0);   // Legs point down
  const UP = new THREE.Vector3(0, 1, 0);      // Spine points up

  // ── Arms ──
  if (isVisible(pose.leftShoulder) && isVisible(pose.leftElbow)) {
    applyRotation(bones.leftArm, computeLimbQuaternion(pose.leftShoulder, pose.leftElbow, LEFT));
  }
  if (isVisible(pose.leftElbow) && isVisible(pose.leftWrist)) {
    applyRotation(bones.leftForeArm, computeLimbQuaternion(pose.leftElbow, pose.leftWrist, LEFT));
  }
  if (isVisible(pose.rightShoulder) && isVisible(pose.rightElbow)) {
    applyRotation(bones.rightArm, computeLimbQuaternion(pose.rightShoulder, pose.rightElbow, RIGHT));
  }
  if (isVisible(pose.rightElbow) && isVisible(pose.rightWrist)) {
    applyRotation(bones.rightForeArm, computeLimbQuaternion(pose.rightElbow, pose.rightWrist, RIGHT));
  }

  // ── Legs ──
  if (isVisible(pose.leftHip) && isVisible(pose.leftKnee)) {
    applyRotation(bones.leftUpLeg, computeLimbQuaternion(pose.leftHip, pose.leftKnee, DOWN));
  }
  if (isVisible(pose.leftKnee) && isVisible(pose.leftAnkle)) {
    applyRotation(bones.leftLeg, computeLimbQuaternion(pose.leftKnee, pose.leftAnkle, DOWN));
  }
  if (isVisible(pose.rightHip) && isVisible(pose.rightKnee)) {
    applyRotation(bones.rightUpLeg, computeLimbQuaternion(pose.rightHip, pose.rightKnee, DOWN));
  }
  if (isVisible(pose.rightKnee) && isVisible(pose.rightAnkle)) {
    applyRotation(bones.rightLeg, computeLimbQuaternion(pose.rightKnee, pose.rightAnkle, DOWN));
  }

  // ── Spine ──
  if (isVisible(pose.midShoulder) && isVisible(pose.midHip)) {
    applyRotation(bones.spine, computeLimbQuaternion(pose.midHip, pose.midShoulder, UP));
  }
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function isVisible(lm, threshold = 0.01) {
  return lm && (lm.visibility === undefined || lm.visibility > threshold);
}

/**
 * Calculate body proportions from landmarks (useful for avatar scaling).
 */
export const getBodyProportions = (landmarks) => {
  if (!landmarks || landmarks.length < 33) return null;

  const dist = (a, b) => {
    const dx = landmarks[a].x - landmarks[b].x;
    const dy = landmarks[a].y - landmarks[b].y;
    const dz = landmarks[a].z - landmarks[b].z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  return {
    shoulderWidth: dist(11, 12),
    torsoLength: dist(11, 23),      // shoulder to hip
    upperArmLeft: dist(11, 13),
    forearmLeft: dist(13, 15),
    upperLegLeft: dist(23, 25),
    lowerLegLeft: dist(25, 27),
    hipWidth: dist(23, 24),
    height: dist(0, 27),            // rough: nose to ankle
  };
};