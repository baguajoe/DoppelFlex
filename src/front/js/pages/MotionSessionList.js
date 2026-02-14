// MotionFromVideoPage.js — Video-based Motion Capture Page
// Location: src/front/js/pages/MotionFromVideoPage.js
//
// Full replacement for the old bare-bones MotionFromVideoPage.
// Uses VideoMocapSystem for extraction and can play back on the avatar.
//
// Already registered in layout.js at /motion-from-video

import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import VideoMocapSystem from '../component/VideoMocapSystem';
import '../../styles/VideoMocap.css';

const DEFAULT_MODEL = '/static/models/Y_Bot.glb';

const MotionFromVideoPage = () => {
  const [extractedFrames, setExtractedFrames] = useState([]);
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_MODEL);

  const handleProcessingComplete = useCallback((frames) => {
    setExtractedFrames(frames);
    console.log(`[VideoPage] Got ${frames.length} frames`);
  }, []);

  return (
    <div className="vmocap">
      {/* Video Mocap System */}
      <VideoMocapSystem
        onProcessingComplete={handleProcessingComplete}
      />

      {/* After extraction: link to replay */}
      {extractedFrames.length > 0 && (
        <div className="vmocap__frame-info">
          <div className="vmocap__frame-stat">
            <span className="vmocap__frame-stat-label">Next Steps</span>
            <span className="vmocap__frame-stat-value">
              Export JSON and load in Replay, or upload to your sessions.
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <Link to="/motion" className="vmocap__btn vmocap__btn--ghost" style={{ textDecoration: 'none' }}>
          🎥 Live Webcam Mocap
        </Link>
        <Link to="/full-capture" className="vmocap__btn vmocap__btn--ghost" style={{ textDecoration: 'none' }}>
          🎭 Body + Face Capture
        </Link>
        <Link to="/motion-sessions" className="vmocap__btn vmocap__btn--ghost" style={{ textDecoration: 'none' }}>
          📂 Saved Sessions
        </Link>
        <Link to="/replay-session" className="vmocap__btn vmocap__btn--ghost" style={{ textDecoration: 'none' }}>
          ▶️ Replay Session
        </Link>
      </div>
    </div>
  );
};

export default MotionFromVideoPage;