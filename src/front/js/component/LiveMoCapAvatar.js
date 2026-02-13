// src/front/js/component/LiveMoCapAvatar.js
// Real-time motion capture with avatar visualization

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { POSE_LANDMARKS, BONE_CONNECTIONS, STANDARD_BONES } from '../../utils/poseConstants';
import { smoothPose } from '../../utils/smoothPose';

/**
 * Find bone with fallback names
 */
const findBone = (model, boneName) => {
  if (!model) return null;

  const variations = [
    boneName,
    `mixamorig:${boneName}`,
    `mixamorig1:${boneName}`,
    boneName.replace('UpperArm', 'Arm'),
    boneName.replace('LowerArm', 'ForeArm'),
    boneName.replace('UpperLeg', 'UpLeg'),
    `mixamorig1:${boneName.replace('UpperLeg', 'UpLeg')}`,
    `mixamorig1:${boneName.replace('LowerLeg', 'Leg')}`,
    `mixamorig1:${boneName.replace('UpperArm', 'Arm')}`,
    `mixamorig1:${boneName.replace('LowerArm', 'ForeArm')}`,
    boneName.replace('LowerLeg', 'Leg'),
  ];

  for (const name of variations) {
    const bone = model.getObjectByName(name);
    if (bone) return bone;
  }
  return null;
};

/**
 * Calculate bone rotation from two landmarks
 */
const calculateRotation = (from, to, boneName = '') => {
  const direction = new THREE.Vector3(
    to.x - from.x,
    -(to.y - from.y),
    -(to.z - from.z)
  ).normalize();

  const quaternion = new THREE.Quaternion();
  let baseDir = new THREE.Vector3(0, -1, 0); if (boneName.includes("LeftArm")) baseDir.set(-1,0,0); else if (boneName.includes("RightArm")) baseDir.set(1,0,0); else if (boneName.includes("Leg") || boneName.includes("Foot")) baseDir.set(0,-1,0); quaternion.setFromUnitVectors(baseDir, direction); if (boneName.includes("Leg")) console.log(boneName, "rot:", euler.x?.toFixed(2), euler.y?.toFixed(2), euler.z?.toFixed(2));

  const euler = new THREE.Euler();
  euler.setFromQuaternion(quaternion);
  return euler;
};

/**
 * Avatar component that updates from live landmarks
 */
const LiveAvatar = ({ landmarks, avatarUrl }) => {
  const groupRef = useRef();
  const modelRef = useRef();
  const [loaded, setLoaded] = useState(false);

  const gltf = useLoader(GLTFLoader, avatarUrl);

  useEffect(() => {
    if (gltf && groupRef.current) {
      const model = gltf.scene.clone();
      
      while (groupRef.current.children.length > 0) {
        groupRef.current.remove(groupRef.current.children[0]);
      }
      
      groupRef.current.add(model);
      modelRef.current = model;
      setLoaded(true);

      // Debug: list bones
      const bones = [];
      model.traverse((child) => {
        if (child.isBone) bones.push(child.name);
      });
      console.log('Loaded avatar bones:', bones);
    }
  }, [gltf]);

  useFrame(() => {
    if (!loaded || !modelRef.current || !landmarks || landmarks.length < 33) {
      return;
    }

    // Apply bone rotations
    BONE_CONNECTIONS.forEach(({ bone, from, to }) => {
      if (bone.includes('Leg')) console.log(bone, 'from:', from, 'to:', to, 'visibility:', landmarks[from]?.visibility, landmarks[to]?.visibility);
      const boneObj = findBone(modelRef.current, bone);
      
      if (boneObj && landmarks[from] && landmarks[to]) {
        if (landmarks[from].visibility < 0.0001 || landmarks[to].visibility < 0.0001) {
          return;
        }

        const rotation = calculateRotation(landmarks[from], landmarks[to], bone);
        
        // Smooth interpolation
        boneObj.rotation.x = THREE.MathUtils.lerp(boneObj.rotation.x, rotation.x, 0.4);
        boneObj.rotation.y = THREE.MathUtils.lerp(boneObj.rotation.y, rotation.y, 0.4);
        boneObj.rotation.z = THREE.MathUtils.lerp(boneObj.rotation.z, rotation.z, 0.4);
      }
    });

    // Apply hip position
    const hips = findBone(modelRef.current, STANDARD_BONES.HIPS);
    if (hips) {
      const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
      const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];

      if (leftHip && rightHip) {
        const x = ((leftHip.x + rightHip.x) / 2 - 0.5) * 2;
        const y = -((leftHip.y + rightHip.y) / 2 - 0.6) * 3;
        const z = -((leftHip.z + rightHip.z) / 2) * 2;

        hips.position.x = THREE.MathUtils.lerp(hips.position.x, x, 0.4);
        hips.position.y = THREE.MathUtils.lerp(hips.position.y, y, 0.4);
        hips.position.z = THREE.MathUtils.lerp(hips.position.z, z, 0.4);
      }
    }

    // Apply head rotation
    const head = findBone(modelRef.current, STANDARD_BONES.HEAD);
    if (head) {
      const leftEar = landmarks[POSE_LANDMARKS.LEFT_EAR];
      const rightEar = landmarks[POSE_LANDMARKS.RIGHT_EAR];

      if (leftEar && rightEar && leftEar.visibility > 0.5 && rightEar.visibility > 0.5) {
        const headY = (rightEar.z - leftEar.z) * Math.PI;
        const headZ = (rightEar.y - leftEar.y) * Math.PI * 0.5;
        
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, headY, 0.4);
        head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, headZ, 0.4);
      }
    }
  });

  return <group ref={groupRef} />;
};

/**
 * Main Live MoCap component
 */
const LiveMoCapAvatar = ({
  avatarUrl,
  onFrame = null,
  showVideo = true,
  videoWidth = 320,
}) => {
  // Use backend URL for default avatar
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const defaultAvatarUrl = avatarUrl || `${backendUrl}/static/models/xbot_avatar.glb`;
  
  const videoRef = useRef(null);
  const [landmarks, setLandmarks] = useState(null);
  const [prevLandmarks, setPrevLandmarks] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [fps, setFps] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState([]);
  const startTimeRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastFpsUpdate = useRef(Date.now());
  const poseRef = useRef(null);
  const cameraRef = useRef(null);

  // Initialize MediaPipe Pose
  useEffect(() => {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      if (results.poseLandmarks) {
        // Apply smoothing
        const smoothed = smoothPose(prevLandmarks, results.poseLandmarks, 0.3);
        setPrevLandmarks(smoothed);
        setLandmarks(smoothed);

        // Calculate FPS
        frameCountRef.current++;
        const now = Date.now();
        if (now - lastFpsUpdate.current > 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsUpdate.current = now;
        }

        // Recording
        if (recording && startTimeRef.current) {
          const timestamp = (Date.now() - startTimeRef.current) / 1000;
          setRecordedFrames((prev) => [
            ...prev,
            { time: timestamp, landmarks: smoothed },
          ]);
        }

        // Callback
        if (onFrame) {
          onFrame({ landmarks: smoothed, timestamp: Date.now() });
        }
      }
    });

    poseRef.current = pose;

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, []);

  // Start/Stop camera
  const toggleCamera = useCallback(() => {
    if (isRunning) {
      if (cameraRef.current) {
        cameraRef.current.stop();
        cameraRef.current = null;
      }
      setIsRunning(false);
    } else {
      if (videoRef.current && poseRef.current) {
        const camera = new Camera(videoRef.current, {
          onFrame: async () => {
            await poseRef.current.send({ image: videoRef.current });
          },
          width: 640,
          height: 480,
        });
        camera.start();
        cameraRef.current = camera;
        setIsRunning(true);
      }
    }
  }, [isRunning]);

  // Recording controls
  const startRecording = () => {
    setRecordedFrames([]);
    startTimeRef.current = Date.now();
    setRecording(true);
  };

  const stopRecording = () => {
    setRecording(false);
    return recordedFrames;
  };

  const downloadRecording = () => {
    const json = JSON.stringify(recordedFrames, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mocap_${Date.now()}.json`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={toggleCamera}
          style={{
            padding: '10px 20px',
            backgroundColor: isRunning ? '#dc3545' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {isRunning ? '⏹ Stop Camera' : '▶ Start Camera'}
        </button>

        {isRunning && (
          <>
            <button
              onClick={recording ? stopRecording : startRecording}
              style={{
                padding: '10px 20px',
                backgroundColor: recording ? '#ffc107' : '#007bff',
                color: recording ? 'black' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {recording ? '⏹ Stop Recording' : '⏺ Record'}
            </button>

            {recordedFrames.length > 0 && !recording && (
              <button
                onClick={downloadRecording}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                💾 Download ({recordedFrames.length} frames)
              </button>
            )}
          </>
        )}

        <span style={{ marginLeft: 'auto', color: '#666' }}>
          {isRunning ? `${fps} FPS` : 'Camera off'}
          {recording && ` | Recording: ${recordedFrames.length} frames`}
        </span>
      </div>

      {/* Video + Avatar */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {/* Webcam feed */}
        {showVideo && (
          <div style={{ position: 'relative' }}>
            <video
              ref={videoRef}
              style={{
                width: videoWidth,
                height: videoWidth * 0.75,
                backgroundColor: '#000',
                borderRadius: '8px',
              }}
              autoPlay
              muted
              playsInline
            />
            {!isRunning && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                  textAlign: 'center',
                }}
              >
                Click "Start Camera" to begin
              </div>
            )}
          </div>
        )}

        {/* 3D Avatar */}
        <div
          style={{
            flex: 1,
            minWidth: '400px',
            height: '400px',
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid #ddd',
          }}
        >
          <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1} />
            <directionalLight position={[-5, 5, -5]} intensity={0.3} />
            
            <LiveAvatar landmarks={landmarks} avatarUrl={defaultAvatarUrl} />
            
            <OrbitControls enablePan={true} enableZoom={true} />
            
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
              <planeGeometry args={[10, 10]} />
              <meshStandardMaterial color="#f0f0f0" />
            </mesh>
          </Canvas>
        </div>
      </div>

      {/* Debug info */}
      {landmarks && (
        <details style={{ fontSize: '12px', color: '#666' }}>
          <summary>Debug: Landmark positions</summary>
          <pre style={{ maxHeight: '200px', overflow: 'auto' }}>
            {JSON.stringify(
              {
                nose: landmarks[0],
                leftShoulder: landmarks[11],
                rightShoulder: landmarks[12],
                leftHip: landmarks[23],
                rightHip: landmarks[24],
              },
              null,
              2
            )}
          </pre>
        </details>
      )}
    </div>
  );
};

export default LiveMoCapAvatar;