// AvatarRigPlayer3D.js — ROTATION-BASED bone mapping for Mixamo rigs
// Replaces the old position-based system that caused static/broken avatars
// Drop-in replacement: src/front/js/component/AvatarRigPlayer3D.js

import React, { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils';
import { OneEuroFilter } from '../utils/OneEuroFilter';

// ─────────────────────────────────────────────────────────────
// MEDIAPIPE POSE LANDMARK INDICES
// ─────────────────────────────────────────────────────────────
const MP = {
  NOSE: 0,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
};

// ─────────────────────────────────────────────────────────────
// MIXAMO BONE NAMES (works with X Bot, Y Bot, any Mixamo char)
// We try multiple naming conventions to handle different rigs
// ─────────────────────────────────────────────────────────────
const BONE_NAME_VARIANTS = {
  hips:           ['mixamorig:Hips', 'mixamorigHips', 'Hips', 'hips', 'pelvis'],
  spine:          ['mixamorig:Spine', 'mixamorigSpine', 'Spine', 'spine'],
  spine1:         ['mixamorig:Spine1', 'mixamorigSpine1', 'Spine1', 'Chest', 'chest'],
  spine2:         ['mixamorig:Spine2', 'mixamorigSpine2', 'Spine2', 'UpperChest'],
  neck:           ['mixamorig:Neck', 'mixamorigNeck', 'Neck', 'neck'],
  head:           ['mixamorig:Head', 'mixamorigHead', 'Head', 'head'],
  leftShoulder:   ['mixamorig:LeftShoulder', 'mixamorigLeftShoulder', 'LeftShoulder', 'l_clavicle'],
  leftArm:        ['mixamorig:LeftArm', 'mixamorigLeftArm', 'LeftArm', 'LeftUpperArm', 'l_upper_arm'],
  leftForeArm:    ['mixamorig:LeftForeArm', 'mixamorigLeftForeArm', 'LeftForeArm', 'LeftLowerArm', 'l_forearm'],
  leftHand:       ['mixamorig:LeftHand', 'mixamorigLeftHand', 'LeftHand', 'l_hand'],
  rightShoulder:  ['mixamorig:RightShoulder', 'mixamorigRightShoulder', 'RightShoulder', 'r_clavicle'],
  rightArm:       ['mixamorig:RightArm', 'mixamorigRightArm', 'RightArm', 'RightUpperArm', 'r_upper_arm'],
  rightForeArm:   ['mixamorig:RightForeArm', 'mixamorigRightForeArm', 'RightForeArm', 'RightLowerArm', 'r_forearm'],
  rightHand:      ['mixamorig:RightHand', 'mixamorigRightHand', 'RightHand', 'r_hand'],
  leftUpLeg:      ['mixamorig:LeftUpLeg', 'mixamorigLeftUpLeg', 'LeftUpLeg', 'LeftThigh', 'l_femur'],
  leftLeg:        ['mixamorig:LeftLeg', 'mixamorigLeftLeg', 'LeftLeg', 'LeftShin', 'l_tibia'],
  leftFoot:       ['mixamorig:LeftFoot', 'mixamorigLeftFoot', 'LeftFoot', 'l_foot'],
  leftToeBase:    ['mixamorig:LeftToeBase', 'mixamorigLeftToeBase', 'LeftToeBase', 'l_toe_base'],
  rightUpLeg:     ['mixamorig:RightUpLeg', 'mixamorigRightUpLeg', 'RightUpLeg', 'RightThigh', 'r_femur'],
  rightLeg:       ['mixamorig:RightLeg', 'mixamorigRightLeg', 'RightLeg', 'RightShin', 'r_tibia'],
  rightFoot:      ['mixamorig:RightFoot', 'mixamorigRightFoot', 'RightFoot', 'r_foot'],
  rightToeBase:   ['mixamorig:RightToeBase', 'mixamorigRightToeBase', 'RightToeBase', 'r_toe_base'],
};

// ─────────────────────────────────────────────────────────────
// HELPER: Find a bone by trying multiple name variants
// ─────────────────────────────────────────────────────────────
function findBone(skeleton, key) {
  const variants = BONE_NAME_VARIANTS[key];
  if (!variants || !skeleton) return null;
  for (const name of variants) {
    const bone = skeleton.getBoneByName(name);
    if (bone) return bone;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Convert MediaPipe landmark to THREE.Vector3
// MediaPipe: x right [0-1], y down [0-1], z toward camera (negative = closer)
// Three.js:  x right, y up, z toward camera
// ─────────────────────────────────────────────────────────────
function landmarkToVec3(lm) {
  return new THREE.Vector3(
    (lm.x - 0.5) * 2,   // center and scale x
    -(lm.y - 0.5) * 2,   // flip y (MediaPipe y is down)
    -lm.z * 2             // flip z
  );
}

// ─────────────────────────────────────────────────────────────
// HELPER: Compute rotation quaternion from parent→child direction
// Given a "from" direction (bone's rest direction) and a "to" direction
// (where MediaPipe says the limb is pointing), compute the rotation
// ─────────────────────────────────────────────────────────────
function computeLimbRotation(parentLm, childLm, restDir) {
  const currentDir = new THREE.Vector3().subVectors(
    landmarkToVec3(childLm),
    landmarkToVec3(parentLm)
  ).normalize();

  const quat = new THREE.Quaternion().setFromUnitVectors(restDir, currentDir);
  return quat;
}

// ─────────────────────────────────────────────────────────────
// REST POSE DIRECTIONS (T-pose for Mixamo characters)
// These define which way each bone points in the default pose
// ─────────────────────────────────────────────────────────────
const REST_DIRS = {
  // Arms: left arm points +X, right arm points -X in T-pose
  leftArm:      new THREE.Vector3(-1, 0, 0),
  leftForeArm:  new THREE.Vector3(-1, 0, 0),
  rightArm:     new THREE.Vector3(1, 0, 0),
  rightForeArm: new THREE.Vector3(1, 0, 0),
  // Legs: both point downward -Y
  leftUpLeg:    new THREE.Vector3(0, -1, 0),
  leftLeg:      new THREE.Vector3(0, -1, 0),
  rightUpLeg:   new THREE.Vector3(0, -1, 0),
  rightLeg:     new THREE.Vector3(0, -1, 0),
  // Spine: points upward +Y
  spine:        new THREE.Vector3(0, 1, 0),
  neck:         new THREE.Vector3(0, 1, 0),
};

// ─────────────────────────────────────────────────────────────
// VISIBILITY THRESHOLD — below this, we skip the landmark
// Set very low to catch legs (MediaPipe often reports low vis for legs)
// ─────────────────────────────────────────────────────────────
const VIS_THRESHOLD = 0.01;

function isVisible(lm) {
  return lm && (lm.visibility === undefined || lm.visibility > VIS_THRESHOLD);
}

// ─────────────────────────────────────────────────────────────
// MAIN AVATAR RIG COMPONENT
// ─────────────────────────────────────────────────────────────
const AvatarRig = ({ recordedFrames, avatarUrl, liveFrame, smoothingEnabled = true }) => {
  const avatarRef = useRef();
  const frameIndex = useRef(0);
  const bonesRef = useRef({});
  const skeletonRef = useRef(null);
  const filtersRef = useRef({});

  const gltf = useLoader(GLTFLoader, avatarUrl);
  const clonedScene = useMemo(() => skeletonClone(gltf.scene), [gltf]);

  // ── Setup: find skeleton & cache bone references ──
  useEffect(() => {
    if (!avatarRef.current || !clonedScene) return;

    avatarRef.current.add(clonedScene);

    // Find the SkinnedMesh to get the skeleton
    let skeleton = null;
    clonedScene.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton) {
        skeleton = child.skeleton;
      }
    });

    if (!skeleton) {
      console.warn('[AvatarRig] No skeleton found in model!');
      return;
    }

    skeletonRef.current = skeleton;

    // Cache bone references using name variants
    const bones = {};
    for (const key of Object.keys(BONE_NAME_VARIANTS)) {
      bones[key] = findBone(skeleton, key);
      if (!bones[key]) {
        console.warn(`[AvatarRig] Bone not found: ${key}`);
      }
    }
    bonesRef.current = bones;

    // Log discovered bones for debugging
    console.log('[AvatarRig] Discovered bones:', 
      Object.entries(bones)
        .filter(([, b]) => b !== null)
        .map(([k, b]) => `${k}→${b.name}`)
    );

    // Initialize OneEuro filters for each bone (x, y, z per bone = lots of filters)
    const filterKeys = [
      'hipsPos', 'hipsRotX', 'hipsRotY', 'hipsRotZ',
      'spineX', 'spineZ', 'neckX', 'neckY', 'neckZ', 'headX', 'headY',
      'leftArmX', 'leftArmY', 'leftArmZ',
      'leftForeArmX', 'leftForeArmY', 'leftForeArmZ',
      'rightArmX', 'rightArmY', 'rightArmZ',
      'rightForeArmX', 'rightForeArmY', 'rightForeArmZ',
      'leftUpLegX', 'leftUpLegY', 'leftUpLegZ',
      'leftLegX', 'leftLegY', 'leftLegZ',
      'rightUpLegX', 'rightUpLegY', 'rightUpLegZ',
      'rightLegX', 'rightLegY', 'rightLegZ',
    ];
    const filters = {};
    for (const k of filterKeys) {
      filters[k] = new OneEuroFilter(1.0, 0.007, 1.0);
    }
    filtersRef.current = filters;

    return () => {
      if (avatarRef.current) {
        avatarRef.current.remove(clonedScene);
      }
    };
  }, [clonedScene]);

  // ── Per-frame animation loop ──
  useFrame(() => {
    const bones = bonesRef.current;
    if (!bones.hips) return; // No skeleton loaded yet

    // Determine which frame to use: live webcam or recorded playback
    let frame;
    if (liveFrame) {
      frame = liveFrame;
    } else if (recordedFrames && recordedFrames.length > 0) {
      frameIndex.current = (frameIndex.current + 1) % recordedFrames.length;
      frame = recordedFrames[frameIndex.current];
    } else {
      return;
    }

    const lm = frame.landmarks || frame;
    if (!lm || lm.length < 33) return; // MediaPipe Pose has 33 landmarks

    const filters = filtersRef.current;
    const now = performance.now() / 1000; // seconds
    const smooth = smoothingEnabled;

    // Helper: optionally filter a value
    const f = (key, val) => {
      if (!smooth || !filters[key]) return val;
      return filters[key].filter(val, now);
    };

    // ─── HIPS POSITION (root motion) ───
    if (bones.hips && isVisible(lm[MP.LEFT_HIP]) && isVisible(lm[MP.RIGHT_HIP])) {
      const midHip = {
        x: (lm[MP.LEFT_HIP].x + lm[MP.RIGHT_HIP].x) / 2,
        y: (lm[MP.LEFT_HIP].y + lm[MP.RIGHT_HIP].y) / 2,
        z: (lm[MP.LEFT_HIP].z + lm[MP.RIGHT_HIP].z) / 2,
      };
      // Only apply Y offset (vertical bob) and Z (depth). Keep X centered unless full body tracking.
      const hipY = f('hipsPos', -(midHip.y - 0.5) * 0.5);
      bones.hips.position.y = bones.hips.position.y + hipY * 0.1; // Subtle vertical movement

      // Hip rotation from hip-to-hip line
      const hipVec = new THREE.Vector3(
        lm[MP.RIGHT_HIP].x - lm[MP.LEFT_HIP].x,
        0,
        lm[MP.RIGHT_HIP].z - lm[MP.LEFT_HIP].z
      ).normalize();
      const hipAngleY = Math.atan2(hipVec.z, hipVec.x);
      bones.hips.rotation.y = f('hipsRotY', hipAngleY * 0.5);
    }

    // ─── SPINE / TORSO ───
    if (bones.spine && isVisible(lm[MP.LEFT_SHOULDER]) && isVisible(lm[MP.RIGHT_SHOULDER]) 
        && isVisible(lm[MP.LEFT_HIP]) && isVisible(lm[MP.RIGHT_HIP])) {
      const midShoulder = landmarkToVec3({
        x: (lm[MP.LEFT_SHOULDER].x + lm[MP.RIGHT_SHOULDER].x) / 2,
        y: (lm[MP.LEFT_SHOULDER].y + lm[MP.RIGHT_SHOULDER].y) / 2,
        z: (lm[MP.LEFT_SHOULDER].z + lm[MP.RIGHT_SHOULDER].z) / 2,
      });
      const midHipVec = landmarkToVec3({
        x: (lm[MP.LEFT_HIP].x + lm[MP.RIGHT_HIP].x) / 2,
        y: (lm[MP.LEFT_HIP].y + lm[MP.RIGHT_HIP].y) / 2,
        z: (lm[MP.LEFT_HIP].z + lm[MP.RIGHT_HIP].z) / 2,
      });
      const torsoDir = new THREE.Vector3().subVectors(midShoulder, midHipVec).normalize();
      
      // Lean forward/back (X rotation) and side-to-side (Z rotation)
      const spineX = Math.asin(Math.max(-1, Math.min(1, -torsoDir.z))) * 0.6;
      const spineZ = Math.asin(Math.max(-1, Math.min(1, torsoDir.x))) * 0.4;
      bones.spine.rotation.x = f('spineX', spineX);
      bones.spine.rotation.z = f('spineZ', spineZ);
    }

    // ─── NECK / HEAD ───
    if (bones.neck && isVisible(lm[MP.NOSE]) && isVisible(lm[MP.LEFT_SHOULDER]) && isVisible(lm[MP.RIGHT_SHOULDER])) {
      const noseVec = landmarkToVec3(lm[MP.NOSE]);
      const midShoulderVec = landmarkToVec3({
        x: (lm[MP.LEFT_SHOULDER].x + lm[MP.RIGHT_SHOULDER].x) / 2,
        y: (lm[MP.LEFT_SHOULDER].y + lm[MP.RIGHT_SHOULDER].y) / 2,
        z: (lm[MP.LEFT_SHOULDER].z + lm[MP.RIGHT_SHOULDER].z) / 2,
      });
      const headDir = new THREE.Vector3().subVectors(noseVec, midShoulderVec).normalize();
      
      const neckX = f('neckX', Math.asin(Math.max(-1, Math.min(1, -headDir.z))) * 0.4);
      const neckY = f('neckY', Math.atan2(headDir.x, headDir.y) * 0.3);
      bones.neck.rotation.x = neckX;
      bones.neck.rotation.y = neckY;
    }

    // ─── LEFT ARM ───
    if (bones.leftArm && isVisible(lm[MP.LEFT_SHOULDER]) && isVisible(lm[MP.LEFT_ELBOW])) {
      const q = computeLimbRotation(lm[MP.LEFT_SHOULDER], lm[MP.LEFT_ELBOW], REST_DIRS.leftArm);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.leftArm.rotation.x = f('leftArmX', euler.x);
      bones.leftArm.rotation.y = f('leftArmY', euler.y);
      bones.leftArm.rotation.z = f('leftArmZ', euler.z);
    }

    // ─── LEFT FOREARM ───
    if (bones.leftForeArm && isVisible(lm[MP.LEFT_ELBOW]) && isVisible(lm[MP.LEFT_WRIST])) {
      const q = computeLimbRotation(lm[MP.LEFT_ELBOW], lm[MP.LEFT_WRIST], REST_DIRS.leftForeArm);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.leftForeArm.rotation.x = f('leftForeArmX', euler.x);
      bones.leftForeArm.rotation.y = f('leftForeArmY', euler.y);
      bones.leftForeArm.rotation.z = f('leftForeArmZ', euler.z);
    }

    // ─── RIGHT ARM ───
    if (bones.rightArm && isVisible(lm[MP.RIGHT_SHOULDER]) && isVisible(lm[MP.RIGHT_ELBOW])) {
      const q = computeLimbRotation(lm[MP.RIGHT_SHOULDER], lm[MP.RIGHT_ELBOW], REST_DIRS.rightArm);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.rightArm.rotation.x = f('rightArmX', euler.x);
      bones.rightArm.rotation.y = f('rightArmY', euler.y);
      bones.rightArm.rotation.z = f('rightArmZ', euler.z);
    }

    // ─── RIGHT FOREARM ───
    if (bones.rightForeArm && isVisible(lm[MP.RIGHT_ELBOW]) && isVisible(lm[MP.RIGHT_WRIST])) {
      const q = computeLimbRotation(lm[MP.RIGHT_ELBOW], lm[MP.RIGHT_WRIST], REST_DIRS.rightForeArm);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.rightForeArm.rotation.x = f('rightForeArmX', euler.x);
      bones.rightForeArm.rotation.y = f('rightForeArmY', euler.y);
      bones.rightForeArm.rotation.z = f('rightForeArmZ', euler.z);
    }

    // ─── LEFT UPPER LEG ───
    if (bones.leftUpLeg && isVisible(lm[MP.LEFT_HIP]) && isVisible(lm[MP.LEFT_KNEE])) {
      const q = computeLimbRotation(lm[MP.LEFT_HIP], lm[MP.LEFT_KNEE], REST_DIRS.leftUpLeg);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.leftUpLeg.rotation.x = f('leftUpLegX', euler.x);
      bones.leftUpLeg.rotation.y = f('leftUpLegY', euler.y);
      bones.leftUpLeg.rotation.z = f('leftUpLegZ', euler.z);
    }

    // ─── LEFT LOWER LEG ───
    if (bones.leftLeg && isVisible(lm[MP.LEFT_KNEE]) && isVisible(lm[MP.LEFT_ANKLE])) {
      const q = computeLimbRotation(lm[MP.LEFT_KNEE], lm[MP.LEFT_ANKLE], REST_DIRS.leftLeg);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.leftLeg.rotation.x = f('leftLegX', euler.x);
      bones.leftLeg.rotation.y = f('leftLegY', euler.y);
      bones.leftLeg.rotation.z = f('leftLegZ', euler.z);
    }

    // ─── RIGHT UPPER LEG ───
    if (bones.rightUpLeg && isVisible(lm[MP.RIGHT_HIP]) && isVisible(lm[MP.RIGHT_KNEE])) {
      const q = computeLimbRotation(lm[MP.RIGHT_HIP], lm[MP.RIGHT_KNEE], REST_DIRS.rightUpLeg);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.rightUpLeg.rotation.x = f('rightUpLegX', euler.x);
      bones.rightUpLeg.rotation.y = f('rightUpLegY', euler.y);
      bones.rightUpLeg.rotation.z = f('rightUpLegZ', euler.z);
    }

    // ─── RIGHT LOWER LEG ───
    if (bones.rightLeg && isVisible(lm[MP.RIGHT_KNEE]) && isVisible(lm[MP.RIGHT_ANKLE])) {
      const q = computeLimbRotation(lm[MP.RIGHT_KNEE], lm[MP.RIGHT_ANKLE], REST_DIRS.rightLeg);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      bones.rightLeg.rotation.x = f('rightLegX', euler.x);
      bones.rightLeg.rotation.y = f('rightLegY', euler.y);
      bones.rightLeg.rotation.z = f('rightLegZ', euler.z);
    }

    // ─── JAW / LIP SYNC ───
    if (bones.head && frame.jawOpen !== undefined) {
      const jaw = skeletonRef.current?.getBoneByName('mixamorig:Jaw')
                || skeletonRef.current?.getBoneByName('mixamorigJaw') 
                || skeletonRef.current?.getBoneByName('Jaw');
      if (jaw) {
        jaw.rotation.x = THREE.MathUtils.lerp(jaw.rotation.x, frame.jawOpen * 0.3, 0.2);
      }
    }
  });

  return <group ref={avatarRef} />;
};

// ─────────────────────────────────────────────────────────────
// EXPORTED COMPONENT
// ─────────────────────────────────────────────────────────────
const AvatarRigPlayer3D = ({ recordedFrames, avatarUrl, liveFrame, smoothingEnabled }) => {
  return (
    <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 5]} intensity={1} />
      <AvatarRig 
        recordedFrames={recordedFrames} 
        avatarUrl={avatarUrl} 
        liveFrame={liveFrame}
        smoothingEnabled={smoothingEnabled}
      />
    </Canvas>
  );
};

export default AvatarRigPlayer3D;