import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { createSmoothingPipeline } from '../utils/smoothPose';
import AvatarRigPlayer3D from './AvatarRigPlayer3D';
// Hand tracking — optional, gracefully skipped if hook unavailable
let useHandMocap;
try { useHandMocap = require('../../hooks/useHandMocap').default; } catch(e) { useHandMocap = null; }

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const DEFAULT_CONFIG = {
  modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false,
  minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
  cameraWidth: 640, cameraHeight: 480,
  skipBackendFrames: true, backendSendInterval: 10,
};

const MotionCaptureSystem = ({
  avatarUrl = '/static/models/Y_Bot.glb',
  onPoseFrame = null,
  showWebcam = true,
  smoothingPreset = 'balanced',
  config = {},
  externalStream = null,
  socket = null,
  faceFrame = null,
}) => {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const videoRef = useRef(null);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const pipelineRef = useRef(null);
  const frameCountRef = useRef(0);
  const recordingRef = useRef([]);
  const startTimeRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);

  const [liveFrame, setLiveFrame] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(0);
  const [landmarkCount, setLandmarkCount] = useState(0);
  const [smoothingEnabled, setSmoothingEnabled] = useState(true);
  const [currentPreset, setCurrentPreset] = useState(smoothingPreset);
  const [error, setError] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });

  // ── Optional hand tracking ──
  const handHook = useHandMocap ? useHandMocap() : null;
  const handData = handHook?.handData || null;


  useEffect(() => { pipelineRef.current = createSmoothingPipeline(currentPreset); }, [currentPreset]);

  // WebSocket: receive remote pose and drive avatar
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data && data.landmarks) {
        setLiveFrame({ landmarks: data.landmarks, timestamp: data.time || performance.now() / 1000, source: 'websocket' });
      }
    };
    socket.on('pose_update', handler);
    return () => socket.off('pose_update', handler);
  }, [socket]);

  const handlePoseResults = useCallback((results) => {
    if (!results.poseLandmarks) return;
    const now = performance.now() / 1000;
    let landmarks = results.poseLandmarks;
    if (smoothingEnabled && pipelineRef.current) landmarks = pipelineRef.current.process(landmarks);

    const frame = {
      landmarks, timestamp: now,
      worldLandmarks: results.poseWorldLandmarks || null,
      jawOpen:    faceFrame?.mouthOpen    ?? undefined,
      handData:   handData || undefined,
      leftBlink:  faceFrame?.leftEyeOpen  != null ? 1 - faceFrame.leftEyeOpen  : undefined,
      rightBlink: faceFrame?.rightEyeOpen != null ? 1 - faceFrame.rightEyeOpen : undefined,
      browRaise:  faceFrame?.leftBrowRaise ?? undefined,
    };

    setLiveFrame(frame);
    fpsCounterRef.current.frames++;
    const elapsed = now - fpsCounterRef.current.lastTime;
    if (elapsed >= 1.0) {
      setFps(Math.round(fpsCounterRef.current.frames / elapsed));
      fpsCounterRef.current = { frames: 0, lastTime: now };
    }
    setLandmarkCount(landmarks.filter(lm => lm.visibility === undefined || lm.visibility > 0.5).length);

    if (isRecording) {
      const t = startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : 0;
      recordingRef.current.push({ time: t, landmarks: landmarks.map(lm => ({ ...lm })) });
    }
    if (onPoseFrame) onPoseFrame(frame);
    frameCountRef.current++;
    if (!cfg.skipBackendFrames || frameCountRef.current % cfg.backendSendInterval === 0) {
      fetch(`${BACKEND}/api/process-pose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pose_data: landmarks }) }).catch(() => {});
    }
  }, [smoothingEnabled, isRecording, onPoseFrame, cfg, faceFrame]);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      if (pipelineRef.current) pipelineRef.current.reset();
      const pose = new Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      pose.setOptions({ modelComplexity: cfg.modelComplexity, smoothLandmarks: cfg.smoothLandmarks, enableSegmentation: cfg.enableSegmentation, minDetectionConfidence: cfg.minDetectionConfidence, minTrackingConfidence: cfg.minTrackingConfidence });
      pose.onResults(handlePoseResults);
      poseRef.current = pose;

      if (videoRef.current) {
        if (externalStream) {
          videoRef.current.srcObject = externalStream;
          await videoRef.current.play();
          const run = async () => {
            if (poseRef.current && videoRef.current && !videoRef.current.paused) await poseRef.current.send({ image: videoRef.current });
            if (poseRef.current) requestAnimationFrame(run);
          };
          requestAnimationFrame(run);
        } else {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => { if (poseRef.current) await poseRef.current.send({ image: videoRef.current }); },
            width: cfg.cameraWidth, height: cfg.cameraHeight,
          });
          await camera.start();
          cameraRef.current = camera;
        }
        setIsCapturing(true);
      }
    } catch (err) { setError(`Camera failed: ${err.message}`); }
  }, [cfg, handlePoseResults, externalStream]);

  const stopCapture = useCallback(async () => {
    if (cameraRef.current) { cameraRef.current.stop(); cameraRef.current = null; }
    if (poseRef.current) { poseRef.current.close(); poseRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCapturing(false); setLiveFrame(null); setFps(0); setLandmarkCount(0);
  }, []);

  const startRecording = useCallback(() => {
    recordingRef.current = [];
    startTimeRef.current = performance.now();
    setIsRecording(true);
    if (videoRef.current?.srcObject) {
      try {
        const recorder = new MediaRecorder(videoRef.current.srcObject, { mimeType: 'video/webm;codecs=vp9' });
        videoChunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
        recorder.onstop = () => setDownloadUrl(URL.createObjectURL(new Blob(videoChunksRef.current, { type: 'video/webm' })));
        recorder.start(100);
        mediaRecorderRef.current = recorder;
      } catch (e) { console.warn('[MoCap] Video recording unavailable:', e.message); }
    }
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setRecordedFrames([...recordingRef.current]);
    recordingRef.current = [];
    if (mediaRecorderRef.current?.state !== 'inactive') { mediaRecorderRef.current.stop(); mediaRecorderRef.current = null; }
  }, []);

  const exportRecording = useCallback(() => {
    if (!recordedFrames?.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ frames: recordedFrames }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `mocap_${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  }, [recordedFrames]);

  const saveToBackend = useCallback(async () => {
    if (!recordedFrames?.length) return;
    const userId = localStorage.getItem('user_id');
    try {
      const res = await fetch(`${BACKEND}/api/save-motion-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, session_name: `Session ${new Date().toLocaleString()}`, frames: recordedFrames }) });
      const data = await res.json();
      alert(res.ok ? `✅ Saved! Session ID: ${data.id}` : `❌ ${data.error}`);
    } catch (err) { alert(`❌ ${err.message}`); }
  }, [recordedFrames]);

  useEffect(() => () => { stopCapture(); }, [stopCapture]);

  const resolvedAvatarUrl = avatarUrl.startsWith('http') || avatarUrl.startsWith('blob:') ? avatarUrl : `${BACKEND}${avatarUrl}`;

  return (
    <div style={{ display:'flex', gap:'16px', height:'100%', minHeight:'600px', padding:'16px', backgroundColor:'#0a0a0f', color:'#e0e0e0' }}>
      <div style={{ width:'360px', flexShrink:0, display:'flex', flexDirection:'column', gap:'12px' }}>
        {showWebcam && (
          <div style={{ position:'relative', borderRadius:'12px', overflow:'hidden', backgroundColor:'#111', border:'1px solid #1a1a2e' }}>
            <video ref={videoRef} style={{ width:'100%', borderRadius:'12px', transform:'scaleX(-1)' }} autoPlay muted playsInline />
            {isCapturing && (
              <div style={{ position:'absolute', top:'8px', left:'8px', right:'8px', display:'flex', gap:'8px', alignItems:'center', fontSize:'11px', color:'#aaa', backgroundColor:'rgba(0,0,0,0.6)', padding:'4px 8px', borderRadius:'6px' }}>
                <span style={{ width:'8px', height:'8px', borderRadius:'50%', backgroundColor: landmarkCount > 20 ? '#4ade80' : '#f87171' }} />
                <span>{fps} FPS</span><span>{landmarkCount}/33</span>
                {isRecording && <span style={{ color:'#f87171' }}>● REC</span>}
              </div>
            )}
            {!isCapturing && <div style={{ width:'100%', height:'270px', display:'flex', alignItems:'center', justifyContent:'center', color:'#555' }}>Press Start to begin</div>}
          </div>
        )}
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
          {!isCapturing ? <button onClick={startCapture} style={{ padding:'8px 16px', background:'#7c3aed', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>▶ Start Capture</button>
                        : <button onClick={stopCapture}  style={{ padding:'8px 16px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>■ Stop</button>}
          {isCapturing && !isRecording && <button onClick={startRecording} style={{ padding:'8px 16px', background:'#b91c1c', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>⏺ Record</button>}
          {isRecording && <button onClick={stopRecording} style={{ padding:'8px 16px', background:'#dc2626', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer' }}>⏹ Stop Recording</button>}
          {recordedFrames?.length > 0 && <>
            <button onClick={() => setIsPlaying(p => !p)} style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer' }}>{isPlaying ? '⏹ Stop Playback' : '▶ Play Recording'}</button>
            <button onClick={exportRecording} style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer' }}>💾 Export JSON</button>
            <button onClick={saveToBackend} style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer' }}>☁ Save</button>
            {downloadUrl && <a href={downloadUrl} download="mocap_video.webm" style={{ padding:'6px 12px', background:'#1e1e2e', color:'#ccc', border:'1px solid #333', borderRadius:'8px', cursor:'pointer', textDecoration:'none' }}>📹 Download Video</a>}
          </>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', fontSize:'13px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer' }}>
            <input type="checkbox" checked={smoothingEnabled} onChange={e => setSmoothingEnabled(e.target.checked)} />
            Smoothing
          </label>
          {smoothingEnabled && (
            <select value={currentPreset} onChange={e => setCurrentPreset(e.target.value)} style={{ background:'#1a1a2e', color:'#e0e0e0', border:'1px solid #333', borderRadius:'6px', padding:'4px 8px', fontSize:'12px' }}>
              <option value="dance">Dance (fast)</option>
              <option value="balanced">Balanced</option>
              <option value="cinematic">Cinematic</option>
            </select>
          )}
        </div>
        {error && <div style={{ color:'#f87171', fontSize:'13px', padding:'8px', background:'#1a0a0a', borderRadius:'6px' }}>{error}</div>}
      </div>
      <div style={{ flex:1, borderRadius:'12px', overflow:'hidden', border:'1px solid #1a1a2e', minHeight:'500px' }}>
        <AvatarRigPlayer3D
          avatarUrl={resolvedAvatarUrl}
          liveFrame={isPlaying ? null : liveFrame}
          recordedFrames={isPlaying ? recordedFrames : null}
          smoothingEnabled={false}
        />
      </div>
    </div>
  );
};

export default MotionCaptureSystem;
