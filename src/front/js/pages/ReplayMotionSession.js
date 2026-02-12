// src/front/js/pages/ReplayMotionSession.js
// Fixed version using proper imports and correct avatar paths

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AvatarRigPlayer3D from '../component/AvatarRigPlayer3D';

const ReplayMotionSession = () => {
  const { id: sessionId } = useParams();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  
  const [frames, setFrames] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [modelUrl, setModelUrl] = useState(`${backendUrl}/static/uploads/me_wit_locks.jpg_avatar.glb`);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const audioRef = useRef(new Audio());

  const availableModels = [
    { name: 'Default Avatar', url: `${backendUrl}/static/uploads/me_wit_locks.jpg_avatar.glb` },
    { name: 'Rigged Avatar', url: `${backendUrl}/static/models/avatar.glb` },
  ];

  // Load session from backend if sessionId provided
  useEffect(() => {
    if (sessionId) {
      loadSessionFromBackend(sessionId);
    }
  }, [sessionId]);

  const loadSessionFromBackend = async (id) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/motion-sessions/${id}`);
      if (!res.ok) throw new Error('Session not found');
      
      const data = await res.json();
      setFrames(data.frames || []);
      
      if (data.audio_url) {
        setAudioUrl(data.audio_url);
        audioRef.current.src = data.audio_url;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle JSON file upload
  const handlePoseUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        // Handle both array format and object with frames property
        const frameData = Array.isArray(data) ? data : data.frames || [];
        setFrames(frameData);
        setError(null);
      } catch (err) {
        setError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };

  // Handle audio file upload
  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    audioRef.current.src = url;
  };

  // Handle custom avatar upload
  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setModelUrl(url);
  };

  // Play/Pause controls
  const handlePlay = () => {
    setIsPlaying(true);
    if (audioUrl) {
      audioRef.current.currentTime = 0;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play();
    }
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (audioUrl) {
      audioRef.current.pause();
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    if (audioUrl) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  // Export functions
  const handleExportJSON = () => {
    const json = JSON.stringify(frames, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `motion_session_${Date.now()}.json`;
    a.click();
  };

  // Calculate session stats
  const sessionDuration = frames.length > 0 
    ? (frames[frames.length - 1]?.time || 0).toFixed(2) 
    : 0;

  return (
    <div className="container-fluid mt-4">
      <h2>▶️ Replay Motion Session</h2>

      {/* Error Display */}
      {error && (
        <div className="alert alert-danger">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="alert alert-info">Loading session...</div>
      )}

      {/* File Inputs Row */}
      <div className="row mb-4">
        <div className="col-md-4">
          <label className="form-label">Load Pose Data (JSON):</label>
          <input
            type="file"
            className="form-control"
            accept=".json"
            onChange={handlePoseUpload}
          />
        </div>

        <div className="col-md-4">
          <label className="form-label">Audio Track (optional):</label>
          <input
            type="file"
            className="form-control"
            accept="audio/*"
            onChange={handleAudioUpload}
          />
        </div>

        <div className="col-md-4">
          <label className="form-label">Custom Avatar (GLB):</label>
          <input
            type="file"
            className="form-control"
            accept=".glb,.gltf"
            onChange={handleAvatarUpload}
          />
        </div>
      </div>

      {/* Avatar Model Selection */}
      <div className="row mb-3">
        <div className="col-md-4">
          <label className="form-label">Select Avatar:</label>
          <select
            className="form-select"
            value={modelUrl}
            onChange={(e) => setModelUrl(e.target.value)}
          >
            {availableModels.map((model) => (
              <option key={model.url} value={model.url}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-md-4">
          <label className="form-label">Playback Speed:</label>
          <select
            className="form-select"
            value={playbackSpeed}
            onChange={(e) => {
              const speed = parseFloat(e.target.value);
              setPlaybackSpeed(speed);
              audioRef.current.playbackRate = speed;
            }}
          >
            <option value="0.25">0.25x (Slow)</option>
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x (Normal)</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x (Fast)</option>
          </select>
        </div>

        <div className="col-md-4 d-flex align-items-end">
          <div className="text-muted">
            <strong>Frames:</strong> {frames.length} | 
            <strong> Duration:</strong> {sessionDuration}s
          </div>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="mb-4 d-flex gap-2 flex-wrap align-items-center">
        {!isPlaying ? (
          <button
            className="btn btn-success"
            onClick={handlePlay}
            disabled={frames.length === 0}
          >
            ▶️ Play
          </button>
        ) : (
          <button className="btn btn-warning" onClick={handlePause}>
            ⏸️ Pause
          </button>
        )}

        <button
          className="btn btn-secondary"
          onClick={handleStop}
          disabled={frames.length === 0}
        >
          ⏹️ Stop
        </button>

        <button
          className="btn btn-primary"
          onClick={handleExportJSON}
          disabled={frames.length === 0}
        >
          💾 Export JSON
        </button>

        {audioUrl && (
          <span className="badge bg-info">🎵 Audio loaded</span>
        )}
      </div>

      {/* 3D Player */}
      <div className="card">
        <div className="card-body p-0">
          {frames.length > 0 ? (
            <AvatarRigPlayer3D
              recordedFrames={frames}
              avatarUrl={modelUrl}
              isPlaying={isPlaying}
              playbackSpeed={playbackSpeed}
              showControls={false}
              height="500px"
            />
          ) : (
            <div 
              className="d-flex align-items-center justify-content-center bg-light"
              style={{ height: '500px' }}
            >
              <div className="text-center text-muted">
                <h4>No Motion Data Loaded</h4>
                <p>Upload a JSON file or load a saved session to begin playback</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Audio Player (hidden but functional) */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      {/* Session Info */}
      {frames.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <h5 className="mb-0">📊 Session Info</h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-3">
                <strong>Total Frames:</strong> {frames.length}
              </div>
              <div className="col-md-3">
                <strong>Duration:</strong> {sessionDuration} seconds
              </div>
              <div className="col-md-3">
                <strong>Avg FPS:</strong> {(frames.length / sessionDuration).toFixed(1)}
              </div>
              <div className="col-md-3">
                <strong>First Frame:</strong> {frames[0]?.time?.toFixed(3)}s
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="mt-4 d-flex gap-2 flex-wrap">
        <a href="/motion" className="btn btn-outline-primary">
          🎥 Live Capture
        </a>
        <a href="/motion-sessions" className="btn btn-outline-secondary">
          📂 All Sessions
        </a>
        <a href="/dance-sync" className="btn btn-outline-success">
          🎵 Dance Sync
        </a>
      </div>
    </div>
  );
};

export default ReplayMotionSession;