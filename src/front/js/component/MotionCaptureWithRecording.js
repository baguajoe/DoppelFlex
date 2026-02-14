// src/front/js/component/MotionCaptureWithRecording.js
// Fixed: MediaPipe Pose & Camera loaded from CDN (avoids Babel ES6 class crash)
// Fixed: All fetch URLs use REACT_APP_BACKEND_URL
// Updated: fullWidth prop for responsive sizing, 1280x720 capture, dark theme controls

import React, { useEffect, useRef, useState } from 'react';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

/**
 * loadScript — dynamically loads a <script> from CDN, deduplicates.
 */
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });

/**
 * MotionCaptureWithRecording — body tracking with video recording,
 * landmark export, and backend upload.
 *
 * Props:
 *   userId      — (optional) user ID for session saving
 *   socket      — (optional) WebSocket for real-time streaming
 *   onPoseFrame — (optional) callback receiving each pose frame
 *   fullWidth   — (optional) if true, video fills parent container
 */
const MotionCaptureWithRecording = ({ userId, socket, onPoseFrame, fullWidth = false }) => {
  const videoRef = useRef(null);
  const avatarRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  const [recordingVideo, setRecordingVideo] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordedLandmarks, setRecordedLandmarks] = useState([]);
  const [startTime] = useState(Date.now());
  const [saveStatus, setSaveStatus] = useState('');
  const [convertedUrl, setConvertedUrl] = useState(null);
  const [status, setStatus] = useState('Loading MediaPipe…');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');

        if (cancelled || !videoRef.current) return;

        const pose = new window.Pose({
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

        pose.onResults((results) => {
          if (results.poseLandmarks) {
            const timestamp = (Date.now() - startTime) / 1000;
            const frame = { time: timestamp, landmarks: results.poseLandmarks };
            setRecordedLandmarks((prev) => [...prev, frame]);

            // WebSocket streaming
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'pose_frame', payload: frame }));
            }

            // Send to backend
            fetch(`${BACKEND}/api/process-pose`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pose_data: results.poseLandmarks }),
            }).catch(() => {});

            if (onPoseFrame) onPoseFrame(frame);
          }
        });

        const camera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            await pose.send({ image: videoRef.current });
          },
          width: 1280,
          height: 720,
        });

        camera.start();
        setStatus('');
      } catch (err) {
        console.error('MediaPipe init error:', err);
        setStatus('⚠️ Failed to load MediaPipe');
      }
    };

    init();

    return () => { cancelled = true; };
  }, [socket, onPoseFrame, startTime]);

  // ── Video Recording ──
  const startVideoRecording = () => {
    if (!videoRef.current) return;
    const stream = videoRef.current.captureStream();
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const filename = `recorded_motion_${Date.now()}.webm`;

      // Local download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      // Upload to backend
      const formData = new FormData();
      formData.append('video', blob, filename);

      try {
        const uploadRes = await fetch(`${BACKEND}/api/upload-video`, {
          method: 'POST',
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (uploadData.error) {
          setSaveStatus('Upload failed.');
          return;
        }

        // Convert to MP4
        const convertRes = await fetch(`${BACKEND}/api/convert-to-mp4`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename }),
        });
        const convertData = await convertRes.json();

        if (convertData.mp4_url) {
          setConvertedUrl(`${BACKEND}${convertData.mp4_url}`);
          setSaveStatus('🎉 MP4 conversion complete!');
        } else {
          setSaveStatus('MP4 conversion failed.');
        }
      } catch {
        setSaveStatus('An error occurred during upload.');
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecordedChunks([]);
    setRecordingVideo(true);
  };

  const stopVideoRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecordingVideo(false);
    }
  };

  // ── Export pose data as JSON ──
  const handleExport = () => {
    const json = JSON.stringify(recordedLandmarks, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pose_data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Upload landmarks to backend ──
  const handleUpload = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/save-mocap-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          landmarks: recordedLandmarks,
        }),
      });
      const data = await res.json();
      setSaveStatus(data.message || 'Upload complete!');
    } catch {
      setSaveStatus('Upload failed.');
    }
  };

  // ── Responsive video sizing ──
  const videoStyle = fullWidth
    ? {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        minHeight: '440px',
        borderRadius: '8px',
        background: '#000',
      }
    : {
        width: '640px',
        height: '480px',
        borderRadius: '8px',
        background: '#000',
      };

  return (
    <div>
      {status && <p style={{ color: '#888', fontSize: '13px' }}>{status}</p>}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={videoStyle}
      />

      <div ref={avatarRef} style={{ display: 'none' }} />

      <div style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        marginTop: '12px',
        padding: '8px 0',
      }}>
        <button
          className={`df-btn ${recordingVideo ? 'df-btn--danger' : 'df-btn--primary'}`}
          onClick={recordingVideo ? stopVideoRecording : startVideoRecording}
        >
          {recordingVideo ? '⏹ Stop Recording' : '⏺ Start Video Recording'}
        </button>

        <button className="df-btn df-btn--ghost" onClick={handleExport}>
          📥 Download Pose Data
        </button>

        <button className="df-btn df-btn--ghost" onClick={handleUpload}>
          ⬆️ Upload to Backend
        </button>

        {convertedUrl && (
          <a
            className="df-btn df-btn--ghost"
            href={convertedUrl}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none' }}
          >
            🎬 View MP4
          </a>
        )}
      </div>

      {saveStatus && (
        <p style={{
          marginTop: '8px',
          fontSize: '13px',
          color: saveStatus.includes('🎉') || saveStatus.includes('complete')
            ? '#4ade80'
            : saveStatus.includes('failed') || saveStatus.includes('error')
            ? '#f87171'
            : '#ccc',
        }}>
          {saveStatus}
        </p>
      )}
    </div>
  );
};

export default MotionCaptureWithRecording;