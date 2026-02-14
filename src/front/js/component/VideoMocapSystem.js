// VideoMocapSystem.js — Motion Capture from Video Files
// Location: src/front/js/component/VideoMocapSystem.js
//
// Processes uploaded video files frame-by-frame through MediaPipe Pose
// and optionally MediaPipe FaceMesh, extracts all landmarks with timestamps,
// then plays them back on the 3D avatar.
//
// Features:
//   - Drag & drop or click to upload video (MP4, WebM, MOV, AVI)
//   - Frame-by-frame extraction at configurable FPS
//   - Body pose (33 landmarks) + optional face (478 landmarks)
//   - Real-time progress bar with ETA
//   - Skeleton overlay on video during processing
//   - Playback with scrubber, speed control, play/pause
//   - Export extracted data as JSON
//   - Upload to backend for server-side storage
//
// Usage:
//   <VideoMocapSystem avatarUrl="/static/models/Y_Bot.glb" />

import React, { useRef, useState, useCallback, useEffect } from 'react';
import '../../styles/VideoMocap.css';

// ─────────────────────────────────────────────────────────────
// POSE CONNECTIONS for skeleton drawing
// ─────────────────────────────────────────────────────────────
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],       // Arms
  [11, 23], [12, 24], [23, 24],                             // Torso
  [23, 25], [25, 27], [27, 29], [27, 31],                   // Left leg
  [24, 26], [26, 28], [28, 30], [28, 32],                   // Right leg
  [0, 1], [1, 2], [2, 3], [3, 7],                           // Left face
  [0, 4], [4, 5], [5, 6], [6, 8],                           // Right face
  [9, 10],                                                    // Mouth
  [15, 17], [15, 19], [15, 21],                              // Left hand
  [16, 18], [16, 20], [16, 22],                              // Right hand
];

// ─────────────────────────────────────────────────────────────
// VIDEO MOCAP SYSTEM COMPONENT
// ─────────────────────────────────────────────────────────────

const VideoMocapSystem = ({
  onProcessingComplete = null,  // (frames) => {}
  onFrameExtracted = null,      // (frame, index) => {} — called per frame during extraction
}) => {
  // ── Refs ──
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const poseRef = useRef(null);
  const faceMeshRef = useRef(null);
  const processingRef = useRef(false);

  // ── State ──
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoMeta, setVideoMeta] = useState(null);       // { duration, width, height, fps }

  const [trackBody, setTrackBody] = useState(true);
  const [trackFace, setTrackFace] = useState(false);
  const [extractionFps, setExtractionFps] = useState(30);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);             // 0–1
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [eta, setEta] = useState(null);

  const [frames, setFrames] = useState([]);                 // Extracted frame data
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState(null);

  // Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackIdx, setPlaybackIdx] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackTimerRef = useRef(null);

  // ── File Upload / Drop ──
  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (!file) return;

    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mov|avi)$/i)) {
      setError('Unsupported format. Use MP4, WebM, MOV, or AVI.');
      return;
    }

    setError(null);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setFrames([]);
    setIsComplete(false);
    setProgress(0);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // ── Video Metadata ──
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const estimatedFrames = Math.ceil(duration * extractionFps);

    setVideoMeta({ duration, width, height });
    setTotalFrames(estimatedFrames);

    console.log(`[VideoMocap] Loaded: ${width}x${height}, ${duration.toFixed(1)}s, ~${estimatedFrames} frames @ ${extractionFps}fps`);
  }, [extractionFps]);

  // ── Initialize MediaPipe Models ──
  const initModels = useCallback(async () => {
    // Body pose
    if (trackBody && !poseRef.current) {
      const { Pose } = await import('@mediapipe/pose');
      const pose = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });
      pose.setOptions({
        modelComplexity: 2,            // Highest accuracy for offline processing
        smoothLandmarks: false,         // No smoothing needed — we process frame-by-frame
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.3,
      });
      poseRef.current = pose;
      console.log('[VideoMocap] Body pose model loaded');
    }

    // Face mesh
    if (trackFace && !faceMeshRef.current) {
      const { FaceMesh } = await import('@mediapipe/face_mesh');
      const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.3,
      });
      faceMeshRef.current = faceMesh;
      console.log('[VideoMocap] Face mesh model loaded');
    }
  }, [trackBody, trackFace]);

  // ── MAIN PROCESSING: Extract poses frame-by-frame ──
  const startProcessing = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    setIsProcessing(true);
    setError(null);
    setFrames([]);
    setIsComplete(false);
    setProgress(0);
    processingRef.current = true;

    const startTime = performance.now();

    try {
      // Load models
      await initModels();

      const duration = video.duration;
      const frameInterval = 1 / extractionFps;
      const estimatedFrames = Math.ceil(duration * extractionFps);
      setTotalFrames(estimatedFrames);

      const extractedFrames = [];
      let frameIdx = 0;

      // Seek through video frame by frame
      for (let time = 0; time < duration && processingRef.current; time += frameInterval) {
        // Seek to timestamp
        video.currentTime = time;
        await waitForSeek(video);

        const frameData = {
          index: frameIdx,
          time: parseFloat(time.toFixed(4)),
          body: null,
          face: null,
        };

        // ── Body Pose ──
        if (trackBody && poseRef.current) {
          const bodyResult = await processFrame(poseRef.current, video);
          if (bodyResult?.poseLandmarks) {
            frameData.body = bodyResult.poseLandmarks.map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility || 0,
            }));
          }

          // Draw skeleton overlay
          if (canvasRef.current && bodyResult?.poseLandmarks) {
            drawSkeleton(canvasRef.current, video, bodyResult.poseLandmarks);
          }
        }

        // ── Face Mesh ──
        if (trackFace && faceMeshRef.current) {
          const faceResult = await processFrame(faceMeshRef.current, video);
          if (faceResult?.multiFaceLandmarks?.[0]) {
            frameData.face = faceResult.multiFaceLandmarks[0].map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
            }));
          }
        }

        extractedFrames.push(frameData);

        // Update progress
        frameIdx++;
        const pct = Math.min(time / duration, 1);
        setProgress(pct);
        setCurrentFrameIdx(frameIdx);

        // ETA calculation
        const elapsed = (performance.now() - startTime) / 1000;
        const remaining = pct > 0.01 ? (elapsed / pct) * (1 - pct) : 0;
        setEta(remaining);

        if (onFrameExtracted) onFrameExtracted(frameData, frameIdx);

        // Yield to UI thread every 5 frames so the browser stays responsive
        if (frameIdx % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      setFrames(extractedFrames);
      setIsComplete(true);
      setIsProcessing(false);
      processingRef.current = false;

      const totalTime = ((performance.now() - startTime) / 1000).toFixed(1);
      const detected = extractedFrames.filter((f) => f.body).length;
      console.log(`[VideoMocap] Done: ${extractedFrames.length} frames in ${totalTime}s, ${detected} with pose`);

      if (onProcessingComplete) onProcessingComplete(extractedFrames);
    } catch (err) {
      console.error('[VideoMocap] Processing error:', err);
      setError(`Processing failed: ${err.message}`);
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [videoUrl, trackBody, trackFace, extractionFps, initModels, onProcessingComplete, onFrameExtracted]);

  // ── Cancel Processing ──
  const cancelProcessing = useCallback(() => {
    processingRef.current = false;
    setIsProcessing(false);
  }, []);

  // ── Wait for video seek to complete ──
  function waitForSeek(video) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
    });
  }

  // ── Process a single frame through a MediaPipe model ──
  function processFrame(model, video) {
    return new Promise((resolve) => {
      model.onResults((results) => resolve(results));
      model.send({ image: video });
    });
  }

  // ── Draw skeleton overlay ──
  function drawSkeleton(canvas, video, landmarks) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (!landmarks) return;

    // Draw connections
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2;
    for (const [a, b] of POSE_CONNECTIONS) {
      if (a >= landmarks.length || b >= landmarks.length) continue;
      const la = landmarks[a];
      const lb = landmarks[b];
      if ((la.visibility || 0) < 0.3 || (lb.visibility || 0) < 0.3) continue;

      ctx.beginPath();
      ctx.moveTo(la.x * canvas.width, la.y * canvas.height);
      ctx.lineTo(lb.x * canvas.width, lb.y * canvas.height);
      ctx.stroke();
    }

    // Draw landmarks
    ctx.fillStyle = '#4ade80';
    for (const lm of landmarks) {
      if ((lm.visibility || 0) < 0.3) continue;
      ctx.beginPath();
      ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // ── Playback Controls ──
  const startPlayback = useCallback(() => {
    if (frames.length === 0) return;
    setIsPlaying(true);

    const fps = extractionFps * playbackSpeed;
    const interval = 1000 / fps;

    playbackTimerRef.current = setInterval(() => {
      setPlaybackIdx((prev) => {
        const next = prev + 1;
        if (next >= frames.length) {
          clearInterval(playbackTimerRef.current);
          setIsPlaying(false);
          return 0;
        }

        // Draw the frame's skeleton on canvas
        const frame = frames[next];
        if (frame?.body && canvasRef.current && videoRef.current) {
          // Seek video to match
          videoRef.current.currentTime = frame.time;
          drawSkeleton(canvasRef.current, videoRef.current, frame.body);
        }

        return next;
      });
    }, interval);
  }, [frames, extractionFps, playbackSpeed]);

  const pausePlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
  }, []);

  const handleScrub = useCallback((e) => {
    const idx = parseInt(e.target.value, 10);
    setPlaybackIdx(idx);

    if (frames[idx]?.body && canvasRef.current && videoRef.current) {
      videoRef.current.currentTime = frames[idx].time;
      drawSkeleton(canvasRef.current, videoRef.current, frames[idx].body);
    }
  }, [frames]);

  // ── Export ──
  const exportJSON = useCallback(() => {
    if (frames.length === 0) return;

    const data = {
      type: 'video_mocap',
      version: '1.0',
      source: videoFile?.name || 'unknown',
      settings: {
        fps: extractionFps,
        trackBody,
        trackFace,
      },
      frameCount: frames.length,
      duration: frames[frames.length - 1]?.time || 0,
      detectedFrames: frames.filter((f) => f.body).length,
      frames,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mocap_${videoFile?.name?.replace(/\.[^.]+$/, '') || 'video'}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [frames, videoFile, extractionFps, trackBody, trackFace]);

  const uploadToBackend = useCallback(async () => {
    if (frames.length === 0) return;

    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

    try {
      const res = await fetch(`${backendUrl}/api/save-mocap-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 1, // TODO: get from auth context
          session_name: videoFile?.name || 'Video Mocap',
          source_type: 'video',
          frames,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(`Upload failed: ${data.error}`);
      } else {
        console.log('[VideoMocap] Uploaded to backend:', data);
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    }
  }, [frames, videoFile]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      processingRef.current = false;
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // ── Format helpers ──
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const detectedCount = frames.filter((f) => f.body).length;
  const detectionRate = frames.length > 0 ? ((detectedCount / frames.length) * 100).toFixed(1) : 0;

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────
  return (
    <div className="vmocap">
      {/* Header */}
      <div>
        <h2 className="vmocap__title">🎬 Motion Capture from Video</h2>
        <p className="vmocap__subtitle">
          Upload a video clip to extract body pose and facial data frame-by-frame.
        </p>
      </div>

      {/* Upload Zone */}
      {!videoUrl && (
        <div
          className="vmocap__upload-zone"
          onDrop={handleFileDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="vmocap__upload-icon">🎬</span>
          <span className="vmocap__upload-text">Drag & drop a video or click to browse</span>
          <span className="vmocap__upload-hint">MP4, WebM, MOV, AVI — any length</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileDrop}
            className="vmocap__upload-input"
          />
        </div>
      )}

      {/* Toolbar (shown after upload) */}
      {videoUrl && (
        <div className="vmocap__toolbar">
          <div className="vmocap__toolbar-group">
            <span className="vmocap__toolbar-label">Track:</span>
            <div className="vmocap__track-types">
              <button
                className={`vmocap__track-chip ${trackBody ? 'vmocap__track-chip--active' : ''}`}
                onClick={() => setTrackBody(!trackBody)}
                disabled={isProcessing}
              >
                🏃 Body
              </button>
              <button
                className={`vmocap__track-chip ${trackFace ? 'vmocap__track-chip--active' : ''}`}
                onClick={() => setTrackFace(!trackFace)}
                disabled={isProcessing}
              >
                🎭 Face
              </button>
            </div>
          </div>

          <div className="vmocap__toolbar-group">
            <span className="vmocap__toolbar-label">FPS:</span>
            <select
              value={extractionFps}
              onChange={(e) => setExtractionFps(parseInt(e.target.value, 10))}
              className="vmocap__toolbar-select"
              disabled={isProcessing}
            >
              <option value={15}>15 fps (fast)</option>
              <option value={24}>24 fps (film)</option>
              <option value={30}>30 fps (standard)</option>
              <option value={60}>60 fps (smooth)</option>
            </select>
          </div>

          <div className="vmocap__toolbar-group">
            <span className="vmocap__toolbar-label">File:</span>
            <span style={{ fontSize: '12px', color: '#4ade80' }}>{videoFile?.name}</span>
            <button
              className="vmocap__btn vmocap__btn--ghost"
              onClick={() => {
                setVideoUrl(null);
                setVideoFile(null);
                setFrames([]);
                setIsComplete(false);
              }}
              disabled={isProcessing}
              style={{ padding: '4px 10px', fontSize: '11px' }}
            >
              ✕ Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Area */}
      {videoUrl && (
        <div className="vmocap__main">
          {/* Video + Skeleton Overlay */}
          <div className="vmocap__section">
            <div className="vmocap__section-header">
              <h3 className="vmocap__section-title">📹 Source Video</h3>
              {videoMeta && (
                <span className="vmocap__section-status">
                  {videoMeta.width}x{videoMeta.height} · {formatTime(videoMeta.duration)}
                </span>
              )}
            </div>
            <div className="vmocap__section-body">
              <div className="vmocap__video-container">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  onLoadedMetadata={handleVideoLoaded}
                  muted
                  playsInline
                  className="vmocap__video"
                />
                <canvas ref={canvasRef} className="vmocap__canvas" />
              </div>
            </div>
          </div>

          {/* Controls + Progress */}
          <div className="vmocap__section">
            <div className="vmocap__section-header">
              <h3 className="vmocap__section-title">⚙️ Processing</h3>
              <span className="vmocap__section-status">
                {isComplete ? `${frames.length} frames extracted` : isProcessing ? 'Processing...' : 'Ready'}
              </span>
            </div>
            <div className="vmocap__section-body">
              {/* Actions */}
              <div className="vmocap__actions">
                {!isProcessing && !isComplete && (
                  <button
                    onClick={startProcessing}
                    className="vmocap__btn vmocap__btn--primary"
                    disabled={!trackBody && !trackFace}
                  >
                    🚀 Start Extraction
                  </button>
                )}

                {isProcessing && (
                  <button onClick={cancelProcessing} className="vmocap__btn vmocap__btn--danger">
                    ✕ Cancel
                  </button>
                )}

                {isComplete && (
                  <>
                    <button
                      onClick={isPlaying ? pausePlayback : startPlayback}
                      className="vmocap__btn vmocap__btn--primary"
                    >
                      {isPlaying ? '⏸ Pause' : '▶ Play Back'}
                    </button>
                    <button onClick={exportJSON} className="vmocap__btn vmocap__btn--success">
                      💾 Export JSON
                    </button>
                    <button onClick={uploadToBackend} className="vmocap__btn vmocap__btn--ghost">
                      ⬆️ Upload to Backend
                    </button>
                  </>
                )}
              </div>

              {/* Progress Bar */}
              {(isProcessing || isComplete) && (
                <div className="vmocap__progress">
                  <div className="vmocap__progress-header">
                    <span>Frame {currentFrameIdx} / {totalFrames}</span>
                    <span>{(progress * 100).toFixed(1)}%</span>
                  </div>
                  <div className="vmocap__progress-track">
                    <div
                      className="vmocap__progress-fill"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <div className="vmocap__progress-stats">
                    {isProcessing && eta !== null && <span>ETA: {formatTime(eta)}</span>}
                    {isComplete && <span>Detection rate: {detectionRate}%</span>}
                  </div>
                </div>
              )}

              {/* Processing Status */}
              {isProcessing && (
                <div className="vmocap__status vmocap__status--processing">
                  <span className="vmocap__spinner" />
                  <span>Extracting {trackBody ? 'body' : ''}{trackBody && trackFace ? ' + ' : ''}{trackFace ? 'face' : ''} landmarks...</span>
                </div>
              )}

              {isComplete && (
                <div className="vmocap__status vmocap__status--complete">
                  ✅ Extraction complete — {detectedCount} of {frames.length} frames have pose data
                </div>
              )}

              {/* Playback Scrubber */}
              {isComplete && frames.length > 0 && (
                <div className="vmocap__playback">
                  <span className="vmocap__playback-time">
                    {formatTime(frames[playbackIdx]?.time || 0)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={frames.length - 1}
                    value={playbackIdx}
                    onChange={handleScrub}
                    className="vmocap__scrubber"
                  />
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="vmocap__speed-select"
                  >
                    <option value={0.25}>0.25x</option>
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2x</option>
                  </select>
                </div>
              )}

              {/* Frame Stats */}
              {isComplete && (
                <div className="vmocap__frame-info">
                  <div className="vmocap__frame-stat">
                    <span className="vmocap__frame-stat-label">Total Frames</span>
                    <span className="vmocap__frame-stat-value">{frames.length}</span>
                  </div>
                  <div className="vmocap__frame-stat">
                    <span className="vmocap__frame-stat-label">Detected</span>
                    <span className="vmocap__frame-stat-value">{detectedCount}</span>
                  </div>
                  <div className="vmocap__frame-stat">
                    <span className="vmocap__frame-stat-label">Duration</span>
                    <span className="vmocap__frame-stat-value">{formatTime(videoMeta?.duration || 0)}</span>
                  </div>
                  <div className="vmocap__frame-stat">
                    <span className="vmocap__frame-stat-label">FPS</span>
                    <span className="vmocap__frame-stat-value">{extractionFps}</span>
                  </div>
                  <div className="vmocap__frame-stat">
                    <span className="vmocap__frame-stat-label">Body</span>
                    <span className="vmocap__frame-stat-value">{trackBody ? '✅' : '—'}</span>
                  </div>
                  <div className="vmocap__frame-stat">
                    <span className="vmocap__frame-stat-label">Face</span>
                    <span className="vmocap__frame-stat-value">{trackFace ? '✅' : '—'}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="vmocap__error">{error}</div>}
    </div>
  );
};

export default VideoMocapSystem;