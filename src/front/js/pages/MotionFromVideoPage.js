// src/front/js/pages/MotionFromVideoPage.js
// Reworked: dark theme, uses VideoMocapSystem for full-featured video mocap,
// falls back to basic MotionFromVideo if VideoMocapSystem isn't available

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

// Try to use the full-featured VideoMocapSystem, fall back to basic upload
let VideoMocapSystem;
try {
  VideoMocapSystem = require('../component/VideoMocapSystem').default;
} catch {
  VideoMocapSystem = null;
}

let MotionFromVideo;
try {
  MotionFromVideo = require('../component/MotionFromVideo').default;
} catch {
  MotionFromVideo = null;
}

const MotionFromVideoPage = () => {
  const [videoUrl, setVideoUrl] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoUrl(URL.createObjectURL(file));
      setFileName(file.name);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎬 Motion Capture from Video</h2>
        <p className="df-page__subtitle">
          Upload a video clip and extract body and face motion data frame by frame.
          Works offline — no camera needed.
        </p>
      </div>

      {/* Use VideoMocapSystem if available (full-featured) */}
      {VideoMocapSystem ? (
        <VideoMocapSystem />
      ) : (
        <>
          {/* Fallback: basic file upload + MotionFromVideo component */}
          <div className="df-card" style={{ marginBottom: '16px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">📹 Upload Video</h3>
              {fileName && <span className="df-card__badge df-card__badge--green">{fileName}</span>}
            </div>
            <div className="df-card__body">
              <div
                className="df-upload-zone"
                onClick={() => document.getElementById('video-upload-input')?.click()}
              >
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    style={{ maxHeight: '240px', borderRadius: '8px', maxWidth: '100%' }}
                  />
                ) : (
                  <>
                    <span className="df-upload-zone__icon">🎥</span>
                    <span className="df-upload-zone__text">Drop a video file or click to browse</span>
                    <span className="df-upload-zone__hint">Supports MP4, WebM, MOV, AVI</span>
                  </>
                )}
                <input
                  id="video-upload-input"
                  type="file"
                  accept="video/*"
                  onChange={handleFileUpload}
                  className="df-file-input"
                />
              </div>
            </div>
          </div>

          {/* Render the MotionFromVideo component if video is loaded */}
          {videoUrl && MotionFromVideo && (
            <div className="df-card" style={{ marginBottom: '16px' }}>
              <div className="df-card__header">
                <h3 className="df-card__title">📊 Processing</h3>
              </div>
              <div className="df-card__body">
                <MotionFromVideo videoUrl={videoUrl} />
              </div>
            </div>
          )}

          {/* Show message if neither component exists */}
          {videoUrl && !MotionFromVideo && (
            <div className="df-status df-status--info">
              Video loaded but MotionFromVideo component not found. Add VideoMocapSystem.js for full functionality.
            </div>
          )}
        </>
      )}

      <div className="df-grid-2" style={{ marginTop: '16px' }}>
        {/* How it works */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">📖 How It Works</h3>
          </div>
          <div className="df-card__body">
            <ol style={{ margin: 0, paddingLeft: '20px', color: '#bbb', fontSize: '13px', lineHeight: '2' }}>
              <li><strong style={{ color: '#e0e0e0' }}>Upload</strong> — Select a video file (MP4, WebM, MOV, AVI)</li>
              <li><strong style={{ color: '#e0e0e0' }}>Choose Tracks</strong> — Toggle body (33 landmarks) and/or face (478 landmarks)</li>
              <li><strong style={{ color: '#e0e0e0' }}>Set FPS</strong> — Pick extraction rate (15/24/30/60 frames per second)</li>
              <li><strong style={{ color: '#e0e0e0' }}>Process</strong> — MediaPipe runs on each frame offline</li>
              <li><strong style={{ color: '#e0e0e0' }}>Review</strong> — Scrub through results with playback controls</li>
              <li><strong style={{ color: '#e0e0e0' }}>Export</strong> — Download motion data as JSON with timestamps</li>
            </ol>
          </div>
        </div>

        {/* Tips */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">💡 Tips</h3>
          </div>
          <div className="df-card__body">
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#bbb', fontSize: '13px', lineHeight: '2' }}>
              <li>Shorter clips process faster — trim to the section you need</li>
              <li>Good lighting and clear subject visibility improve accuracy</li>
              <li>Higher FPS gives smoother motion but takes longer to process</li>
              <li>Body tracking uses <code style={{ color: '#a78bfa' }}>modelComplexity: 2</code> for maximum accuracy</li>
              <li>Face tracking captures 478 landmarks including iris position</li>
              <li>Exported JSON includes per-frame timestamps for easy sync</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
        <Link to="/motion" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          🎥 Live Motion Capture
        </Link>
        <Link to="/face-capture" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          😊 Face Capture
        </Link>
        <Link to="/full-capture" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          🧍 Full Body + Face
        </Link>
        <Link to="/dance-sync" className="df-btn df-btn--ghost df-btn--sm" style={{ textDecoration: 'none' }}>
          🎵 Dance Sync
        </Link>
      </div>
    </div>
  );
};

export default MotionFromVideoPage;