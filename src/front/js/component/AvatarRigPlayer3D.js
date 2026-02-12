// src/front/js/component/AvatarRigPlayer3D.js
// Plays back recorded motion capture data on a 3D avatar

import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { POSE_LANDMARKS, BONE_CONNECTIONS, STANDARD_BONES } from '../../utils/poseConstants';

/**
 * Find bone by name with fallback aliases
 */
const findBone = (model, boneName) => {
  if (!model) return null;
  
  // Try exact match
  let bone = model.getObjectByName(boneName);
  if (bone) return bone;

  // Try common variations
  const variations = [
    boneName,
    `mixamorig:${boneName}`,
    `mixamorig${boneName}`,
    boneName.replace('UpperArm', 'Arm'),
    boneName.replace('LowerArm', 'ForeArm'),
    boneName.replace('UpperLeg', 'UpLeg'),
    boneName.replace('LowerLeg', 'Leg'),
    // Unity style
    boneName.replace('Upper', ''),
    boneName.replace('Lower', 'Fore'),
  ];

  for (const name of variations) {
    bone = model.getObjectByName(name);
    if (bone) return bone;
  }

  return null;
};

/**
 * Calculate rotation between two points
 */
const calculateRotation = (from, to) => {
  const direction = new THREE.Vector3(
    to.x - from.x,
    -(to.y - from.y),
    -(to.z - from.z)
  ).normalize();

  const defaultDir = new THREE.Vector3(0, -1, 0);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(defaultDir, direction);

  const euler = new THREE.Euler();
  euler.setFromQuaternion(quaternion);
  return euler;
};

/**
 * Avatar component that updates with pose data
 */
const AvatarRig = ({ recordedFrames, avatarUrl, isPlaying = true, playbackSpeed = 1 }) => {
  const groupRef = useRef();
  const modelRef = useRef();
  const frameIndex = useRef(0);
  const lastTime = useRef(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [boneList, setBoneList] = useState([]);

  // Load the avatar model
  const gltf = useLoader(GLTFLoader, avatarUrl);

  useEffect(() => {
    if (gltf && groupRef.current) {
      // Clone the scene to avoid issues with reuse
      const model = gltf.scene.clone();
      
      // Clear previous model
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }
      
      groupRef.current.add(model);
      modelRef.current = model;

      // List all bones for debugging
      const bones = [];
      model.traverse((child) => {
        if (child.isBone) {
          bones.push(child.name);
        }
      });
      setBoneList(bones);
      console.log('Avatar bones found:', bones);

      setModelLoaded(true);
    }
  }, [gltf]);

  // Animation loop
  useFrame((state, delta) => {
    if (!isPlaying || !modelLoaded || !recordedFrames || recordedFrames.length === 0) {
      return;
    }

    if (!modelRef.current) return;

    // Advance frame based on time
    lastTime.current += delta * playbackSpeed;
    
    // Find the appropriate frame based on timestamp
    const currentTime = lastTime.current;
    let frame = recordedFrames[frameIndex.current];

    // Find frame matching current time
    while (
      frameIndex.current < recordedFrames.length - 1 &&
      recordedFrames[frameIndex.current + 1].time <= currentTime
    ) {
      frameIndex.current++;
    }

    // Loop playback
    if (frameIndex.current >= recordedFrames.length - 1) {
      frameIndex.current = 0;
      lastTime.current = 0;
    }

    frame = recordedFrames[frameIndex.current];
    if (!frame || !frame.landmarks) return;

    const landmarks = frame.landmarks;

    // Apply bone rotations
    BONE_CONNECTIONS.forEach(({ bone, from, to }) => {
      const boneObj = findBone(modelRef.current, bone);
      
      if (boneObj && landmarks[from] && landmarks[to]) {
        // Check visibility
        if (landmarks[from].visibility < 0.5 || landmarks[to].visibility < 0.5) {
          return;
        }

        const rotation = calculateRotation(landmarks[from], landmarks[to]);

        // Smooth interpolation
        boneObj.rotation.x = THREE.MathUtils.lerp(boneObj.rotation.x, rotation.x, 0.3);
        boneObj.rotation.y = THREE.MathUtils.lerp(boneObj.rotation.y, rotation.y, 0.3);
        boneObj.rotation.z = THREE.MathUtils.lerp(boneObj.rotation.z, rotation.z, 0.3);
      }
    });

    // Apply hip position
    const hips = findBone(modelRef.current, STANDARD_BONES.HIPS);
    if (hips && landmarks[POSE_LANDMARKS.LEFT_HIP] && landmarks[POSE_LANDMARKS.RIGHT_HIP]) {
      const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
      const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

      const hipX = ((leftHip.x + rightHip.x) / 2 - 0.5) * 2;
      const hipY = -((leftHip.y + rightHip.y) / 2 - 0.5) * 2;
      const hipZ = -((leftHip.z + rightHip.z) / 2) * 2;

      hips.position.x = THREE.MathUtils.lerp(hips.position.x, hipX, 0.3);
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, hipY + 1, 0.3); // Offset up
      hips.position.z = THREE.MathUtils.lerp(hips.position.z, hipZ, 0.3);
    }

    // Apply head rotation
    const head = findBone(modelRef.current, STANDARD_BONES.HEAD);
    if (head && landmarks[POSE_LANDMARKS.NOSE]) {
      const nose = landmarks[POSE_LANDMARKS.NOSE];
      const leftEar = landmarks[POSE_LANDMARKS.LEFT_EAR];
      const rightEar = landmarks[POSE_LANDMARKS.RIGHT_EAR];

      if (leftEar && rightEar) {
        const headY = (rightEar.z - leftEar.z) * Math.PI;
        const headZ = (rightEar.y - leftEar.y) * Math.PI * 0.5;
        
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, headY, 0.3);
        head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, headZ, 0.3);
      }
    }

    // Apply jaw animation if available
    if (frame.jawOpen !== undefined) {
      const jaw = findBone(modelRef.current, 'Jaw');
      if (jaw) {
        jaw.rotation.x = THREE.MathUtils.lerp(jaw.rotation.x, frame.jawOpen * 0.3, 0.2);
      }
    }
  });

  return <group ref={groupRef} />;
};

/**
 * Main player component
 */
const AvatarRigPlayer3D = ({ 
  recordedFrames, 
  avatarUrl,
  isPlaying = true,
  playbackSpeed = 1,
  showControls = true,
  height = '500px',
}) => {
  // Use backend URL for default avatar
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const defaultAvatarUrl = avatarUrl || `${backendUrl}/static/uploads/me_wit_locks.jpg_avatar.glb`;
  
  const [localIsPlaying, setLocalIsPlaying] = useState(isPlaying);
  const [localSpeed, setLocalSpeed] = useState(playbackSpeed);

  return (
    <div style={{ width: '100%', height }}>
      {showControls && (
        <div style={{ marginBottom: '10px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => setLocalIsPlaying(!localIsPlaying)}
            style={{ padding: '8px 16px' }}
          >
            {localIsPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          
          <label>
            Speed: 
            <input 
              type="range" 
              min="0.25" 
              max="2" 
              step="0.25" 
              value={localSpeed}
              onChange={(e) => setLocalSpeed(parseFloat(e.target.value))}
              style={{ marginLeft: '8px' }}
            />
            {localSpeed}x
          </label>
          
          <span style={{ marginLeft: 'auto', color: '#666' }}>
            Frames: {recordedFrames?.length || 0}
          </span>
        </div>
      )}
      
      <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
        <directionalLight position={[-5, 5, -5]} intensity={0.3} />
        
        {recordedFrames && recordedFrames.length > 0 && (
          <AvatarRig 
            recordedFrames={recordedFrames} 
            avatarUrl={defaultAvatarUrl}
            isPlaying={localIsPlaying}
            playbackSpeed={localSpeed}
          />
        )}
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          minDistance={1}
          maxDistance={10}
        />
        
        {/* Ground plane for reference */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#cccccc" />
        </mesh>
      </Canvas>
    </div>
  );
};

export default AvatarRigPlayer3D;