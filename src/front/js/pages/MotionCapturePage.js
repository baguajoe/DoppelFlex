// src/front/js/pages/MotionCapturePage.js
// Updated to use the new LiveMoCapAvatar component

import React, { useState, useCallback } from 'react';
import LiveMoCapAvatar from '../component/LiveMoCapAvatar';

const MotionCapturePage = () => {
  // Use backend URL for static files
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const defaultAvatar = `${backendUrl}/static/models/rigged_avatar.glb`;
  
  const [avatarUrl, setAvatarUrl] = useState(defaultAvatar);
  const [showVideo, setShowVideo] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [lastFrameData, setLastFrameData] = useState(null);

  // Available avatar models
  const avatarModels = [
    { name: 'Default Avatar', url: `${backendUrl}/static/models/rigged_avatar.glb` },
    { name: 'Rigged Avatar', url: `${backendUrl}/static/models/rigged_avatar.glb` },
  ];

  // Handle each frame (optional - for sending to backend)
  const handleFrame = useCallback((frameData) => {
    setLastFrameData(frameData);
  }, []);

  // Save session to backend
  const handleSaveSession = async (frames) => {
    if (!frames || frames.length === 0) {
      setSaveStatus('❌ No frames to save');
      return;
    }

    setSaveStatus('⏳ Saving...');

    try {
      const userId = localStorage.getItem('user_id') || '1';
      
      const response = await fetch(`${backendUrl}/save-motion-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          session_name: `MoCap Session ${new Date().toLocaleString()}`,
          frames: frames,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setSaveStatus(`✅ Saved! Session ID: ${data.id}`);
      } else {
        setSaveStatus(`❌ Error: ${data.error || 'Failed to save'}`);
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('❌ Network error');
    }
  };

  return (
    <div className="container mt-4">
      <h2>🎥 Live Motion Capture</h2>
      <p className="text-muted">
        Capture your movements in real-time and see them applied to a 3D avatar.
      </p>

      {/* Settings Row */}
      <div className="row mb-4">
        <div className="col-md-4">
          <label className="form-label">Avatar Model:</label>
          <select
            className="form-select"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          >
            {avatarModels.map((model) => (
              <option key={model.url} value={model.url}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-md-4">
          <label className="form-label">Custom Avatar (GLB/GLTF):</label>
          <input
            type="file"
            className="form-control"
            accept=".glb,.gltf"
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) {
                const url = URL.createObjectURL(file);
                setAvatarUrl(url);
              }
            }}
          />
        </div>

        <div className="col-md-4 d-flex align-items-end">
          <div className="form-check">
            <input
              type="checkbox"
              className="form-check-input"
              id="showVideo"
              checked={showVideo}
              onChange={(e) => setShowVideo(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="showVideo">
              Show webcam preview
            </label>
          </div>
        </div>
      </div>

      {/* Main MoCap Component */}
      <div className="card">
        <div className="card-body">
          <LiveMoCapAvatar
            avatarUrl={avatarUrl}
            showVideo={showVideo}
            videoWidth={320}
            onFrame={handleFrame}
          />
        </div>
      </div>

      {/* Save Status */}
      {saveStatus && (
        <div className={`alert mt-3 ${saveStatus.includes('✅') ? 'alert-success' : saveStatus.includes('❌') ? 'alert-danger' : 'alert-info'}`}>
          {saveStatus}
        </div>
      )}

      {/* Instructions */}
      <div className="card mt-4">
        <div className="card-header">
          <h5 className="mb-0">📖 How to Use</h5>
        </div>
        <div className="card-body">
          <ol className="mb-0">
            <li><strong>Start Camera</strong> - Click the green button to enable your webcam</li>
            <li><strong>Position Yourself</strong> - Stand back so your full body is visible</li>
            <li><strong>Move!</strong> - Your avatar will mirror your movements in real-time</li>
            <li><strong>Record</strong> - Click "Record" to capture your motion session</li>
            <li><strong>Download</strong> - Save your recording as JSON for later playback</li>
          </ol>
        </div>
      </div>

      {/* Tips */}
      <div className="card mt-3">
        <div className="card-header">
          <h5 className="mb-0">💡 Tips for Best Results</h5>
        </div>
        <div className="card-body">
          <ul className="mb-0">
            <li>Use good lighting - avoid backlight (windows behind you)</li>
            <li>Wear contrasting clothes (avoid patterns similar to background)</li>
            <li>Keep your full body in frame for best tracking</li>
            <li>Maintain a distance of 6-10 feet from the camera</li>
            <li>A plain background improves detection accuracy</li>
          </ul>
        </div>
      </div>

      {/* Debug Panel (collapsible) */}
      {lastFrameData && (
        <details className="mt-4">
          <summary className="text-muted" style={{ cursor: 'pointer' }}>
            🔧 Debug Information
          </summary>
          <div className="card mt-2">
            <div className="card-body">
              <h6>Last Frame Data:</h6>
              <pre style={{ maxHeight: '200px', overflow: 'auto', fontSize: '11px' }}>
                Key Landmarks:
                {JSON.stringify({
                  nose: lastFrameData.landmarks?.[0],
                  leftShoulder: lastFrameData.landmarks?.[11],
                  rightShoulder: lastFrameData.landmarks?.[12],
                  leftHip: lastFrameData.landmarks?.[23],
                  rightHip: lastFrameData.landmarks?.[24],
                }, null, 2)}
              </pre>
            </div>
          </div>
        </details>
      )}

      {/* Quick Links */}
      <div className="mt-4 d-flex gap-2 flex-wrap">
        <a href="/motion-sessions" className="btn btn-outline-primary">
          📂 View Saved Sessions
        </a>
        <a href="/replay-session" className="btn btn-outline-secondary">
          ▶️ Replay Sessions
        </a>
        <a href="/dance-sync" className="btn btn-outline-success">
          🎵 Dance Sync Mode
        </a>
        <a href="/motion-from-video" className="btn btn-outline-info">
          🎬 MoCap from Video
        </a>
      </div>
    </div>
  );
};

export default MotionCapturePage;