// src/front/utils/poseToAvatarRig.js
// Applies MediaPipe pose landmarks to a 3D avatar skeleton

import * as THREE from 'three';
import { POSE_LANDMARKS, BONE_CONNECTIONS, STANDARD_BONES } from './poseConstants';

// Smoothing factor for rotation interpolation (0 = no smoothing, 1 = no movement)
const SMOOTHING_FACTOR = 0.3;

// Store previous rotations for smoothing
const previousRotations = {};

/**
 * Calculate rotation from two 3D points (bone direction)
 * @param {Object} from - Start point {x, y, z}
 * @param {Object} to - End point {x, y, z}
 * @returns {THREE.Euler} - Rotation euler angles
 */
const calculateBoneRotation = (from, to) => {
  // Create direction vector
  const direction = new THREE.Vector3(
    to.x - from.x,
    -(to.y - from.y), // Flip Y (MediaPipe Y is inverted)
    -(to.z - from.z)  // Flip Z for proper depth
  );

  direction.normalize();

  // Calculate rotation from default pose (pointing down for arms, etc.)
  const quaternion = new THREE.Quaternion();
  const defaultDir = new THREE.Vector3(0, -1, 0); // Default bone direction (down)
  
  quaternion.setFromUnitVectors(defaultDir, direction);
  
  const euler = new THREE.Euler();
  euler.setFromQuaternion(quaternion);
  
  return euler;
};

/**
 * Smooth rotation transition
 * @param {string} boneName - Name of the bone
 * @param {THREE.Euler} newRotation - Target rotation
 * @returns {THREE.Euler} - Smoothed rotation
 */
const smoothRotation = (boneName, newRotation) => {
  if (!previousRotations[boneName]) {
    previousRotations[boneName] = newRotation.clone();
    return newRotation;
  }

  const prev = previousRotations[boneName];
  const smoothed = new THREE.Euler(
    THREE.MathUtils.lerp(prev.x, newRotation.x, 1 - SMOOTHING_FACTOR),
    THREE.MathUtils.lerp(prev.y, newRotation.y, 1 - SMOOTHING_FACTOR),
    THREE.MathUtils.lerp(prev.z, newRotation.z, 1 - SMOOTHING_FACTOR)
  );

  previousRotations[boneName] = smoothed;
  return smoothed;
};

/**
 * Find a bone in the avatar by name (handles different naming conventions)
 * @param {THREE.Object3D} avatar - The avatar scene/model
 * @param {string} boneName - Standard bone name
 * @returns {THREE.Bone|null} - The bone object or null
 */
const findBone = (avatar, boneName) => {
  // Try exact match first
  let bone = avatar.getObjectByName(boneName);
  if (bone) return bone;

  // Try common variations
  const variations = [
    boneName,
    `mixamorig:${boneName}`,
    `mixamorig${boneName}`,
    boneName.replace('Upper', ''),
    boneName.replace('Lower', 'Fore'),
    boneName.replace('UpperArm', 'Arm'),
    boneName.replace('LowerArm', 'ForeArm'),
    boneName.replace('UpperLeg', 'UpLeg'),
    boneName.replace('LowerLeg', 'Leg'),
  ];

  for (const name of variations) {
    bone = avatar.getObjectByName(name);
    if (bone) return bone;
  }

  return null;
};

/**
 * Calculate hip/root position from landmarks
 * @param {Array} landmarks - MediaPipe landmarks array
 * @returns {THREE.Vector3} - Hip center position
 */
const calculateHipPosition = (landmarks) => {
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

  return new THREE.Vector3(
    ((leftHip.x + rightHip.x) / 2 - 0.5) * 2,  // Center and scale
    -((leftHip.y + rightHip.y) / 2 - 0.5) * 2, // Flip and center Y
    -((leftHip.z + rightHip.z) / 2) * 2         // Scale Z
  );
};

/**
 * Calculate spine rotation from shoulders and hips
 * @param {Array} landmarks - MediaPipe landmarks array
 * @returns {THREE.Euler} - Spine rotation
 */
const calculateSpineRotation = (landmarks) => {
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

  // Shoulder center
  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2,
  };

  // Hip center
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2,
  };

  // Calculate spine tilt
  const spineDir = new THREE.Vector3(
    shoulderCenter.x - hipCenter.x,
    -(shoulderCenter.y - hipCenter.y),
    -(shoulderCenter.z - hipCenter.z)
  ).normalize();

  // Calculate twist from shoulder line
  const shoulderDir = new THREE.Vector3(
    rightShoulder.x - leftShoulder.x,
    -(rightShoulder.y - leftShoulder.y),
    -(rightShoulder.z - leftShoulder.z)
  ).normalize();

  return new THREE.Euler(
    Math.asin(spineDir.z) * 0.5,           // Forward/back lean
    Math.atan2(shoulderDir.z, shoulderDir.x), // Twist
    Math.asin(-spineDir.x) * 0.5           // Side lean
  );
};

/**
 * Main function: Apply pose landmarks to avatar
 * @param {Array} landmarks - MediaPipe pose landmarks (33 points)
 * @param {THREE.Object3D} avatar - The 3D avatar model/scene
 * @param {Object} options - Optional configuration
 */
export const applyPoseToAvatar = (landmarks, avatar, options = {}) => {
  if (!landmarks || !avatar) {
    console.warn('applyPoseToAvatar: Missing landmarks or avatar');
    return;
  }

  if (landmarks.length < 33) {
    console.warn('applyPoseToAvatar: Incomplete landmarks data');
    return;
  }

  const {
    applyPosition = true,  // Move root/hips
    applyRotation = true,  // Rotate bones
    scale = 1.0,           // Position scale multiplier
  } = options;

  // Apply hip/root position
  if (applyPosition) {
    const hips = findBone(avatar, STANDARD_BONES.HIPS);
    if (hips) {
      const hipPos = calculateHipPosition(landmarks);
      hips.position.lerp(hipPos.multiplyScalar(scale), 0.3);
    }
  }

  // Apply spine rotation
  if (applyRotation) {
    const spine = findBone(avatar, STANDARD_BONES.SPINE);
    if (spine) {
      const spineRot = calculateSpineRotation(landmarks);
      const smoothedRot = smoothRotation(STANDARD_BONES.SPINE, spineRot);
      spine.rotation.copy(smoothedRot);
    }
  }

  // Apply bone rotations based on connections
  if (applyRotation) {
    BONE_CONNECTIONS.forEach(({ bone, from, to }) => {
      const boneObj = findBone(avatar, bone);
      
      if (boneObj && landmarks[from] && landmarks[to]) {
        const fromPoint = landmarks[from];
        const toPoint = landmarks[to];

        // Skip if landmarks have low visibility
        if (fromPoint.visibility < 0.5 || toPoint.visibility < 0.5) {
          return;
        }

        const rotation = calculateBoneRotation(fromPoint, toPoint);
        const smoothedRotation = smoothRotation(bone, rotation);

        // Apply rotation with limits to prevent unnatural poses
        boneObj.rotation.x = THREE.MathUtils.clamp(smoothedRotation.x, -Math.PI, Math.PI);
        boneObj.rotation.y = THREE.MathUtils.clamp(smoothedRotation.y, -Math.PI / 2, Math.PI / 2);
        boneObj.rotation.z = THREE.MathUtils.clamp(smoothedRotation.z, -Math.PI, Math.PI);
      }
    });
  }

  // Apply head rotation
  const head = findBone(avatar, STANDARD_BONES.HEAD);
  if (head && applyRotation) {
    const nose = landmarks[POSE_LANDMARKS.NOSE];
    const leftEar = landmarks[POSE_LANDMARKS.LEFT_EAR];
    const rightEar = landmarks[POSE_LANDMARKS.RIGHT_EAR];

    if (nose && leftEar && rightEar) {
      // Head turn (Y rotation)
      const earDiff = rightEar.z - leftEar.z;
      const headY = earDiff * Math.PI;

      // Head tilt (Z rotation)
      const earTilt = rightEar.y - leftEar.y;
      const headZ = earTilt * Math.PI * 0.5;

      // Head nod (X rotation) - based on nose position relative to ears
      const earCenterY = (leftEar.y + rightEar.y) / 2;
      const headX = (nose.y - earCenterY) * Math.PI * 0.5;

      const headRot = new THREE.Euler(headX, headY, headZ);
      const smoothedHead = smoothRotation(STANDARD_BONES.HEAD, headRot);
      head.rotation.copy(smoothedHead);
    }
  }
};

/**
 * Reset all bone rotations to default pose
 * @param {THREE.Object3D} avatar - The 3D avatar model
 */
export const resetPose = (avatar) => {
  if (!avatar) return;

  Object.values(STANDARD_BONES).forEach((boneName) => {
    const bone = findBone(avatar, boneName);
    if (bone) {
      bone.rotation.set(0, 0, 0);
    }
  });

  // Clear previous rotations cache
  Object.keys(previousRotations).forEach((key) => {
    delete previousRotations[key];
  });
};

/**
 * Debug function: List all bones in avatar
 * @param {THREE.Object3D} avatar - The avatar model
 * @returns {Array} - List of bone names
 */
export const listAvatarBones = (avatar) => {
  const bones = [];
  
  avatar.traverse((child) => {
    if (child.isBone) {
      bones.push(child.name);
    }
  });

  console.log('Avatar bones:', bones);
  return bones;
};

export default {
  applyPoseToAvatar,
  resetPose,
  listAvatarBones,
};