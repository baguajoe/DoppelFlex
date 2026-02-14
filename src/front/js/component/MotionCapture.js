// src/front/js/component/MotionCapture.js
// Updated: Accepts fullWidth prop to fill parent container instead of fixed 640x480

import React, { useEffect, useRef } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';

const MotionCapture = ({ avatarRef, fullWidth = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults(async (results) => {
      if (results.poseLandmarks) {
        try {
          await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/process-pose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pose_data: results.poseLandmarks }),
          });
        } catch (err) {
          console.error('Error sending pose data:', err);
        }
      }
    });

    const camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video });
      },
      width: 1280,
      height: 720,
    });

    camera.start();

    return () => {
      camera.stop?.();
    };
  }, []);

  const videoStyle = fullWidth
    ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: '440px' }
    : { width: '640px', height: '480px' };

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      style={videoStyle}
    />
  );
};

export default MotionCapture;