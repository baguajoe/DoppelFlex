// src/front/js/pages/VideoUploadPage.js
// Fixed: Added REACT_APP_BACKEND_URL, dark theme styling

import React, { useState } from 'react';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const VideoUploadPage = () => {
  const [videoFile, setVideoFile] = useState(null);
  const [poseData, setPoseData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    setVideoFile(e.target.files[0]);
    setPoseData(null);
    setStatus('');
  };

  const handleUpload = async () => {
    if (!videoFile) {
      setStatus('Please select a video to upload.');
      return;
    }

    setIsUploading(true);
    setStatus('');

    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await fetch(`${BACKEND}/api/upload-video`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.pose_data_file) {
        setPoseData(data.pose_data_file);
        setStatus('✅ Video processed successfully!');
      } else if (data.error) {
        setStatus(`❌ ${data.error}`);
      } else {
        setStatus('❌ Error processing video.');
      }
    } catch {
      setStatus('⚠️ Backend not reachable.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">📹 Video Upload</h2>
        <p className="df-page__subtitle">
          Upload a video for server-side pose tracking. The backend processes frames and returns landmark data.
        </p>
      </div>

      <div className="df-card" style={{ maxWidth: '600px' }}>
        <div className="df-card__header">
          <h3 className="df-card__title">🎬 Upload Video</h3>
          {videoFile && <span className="df-card__badge df-card__badge--green">{videoFile.name}</span>}
        </div>
        <div className="df-card__body">
          <label className="df-file-label">
            📂 Choose Video
            <input type="file" accept="video/*" onChange={handleFileChange} className="df-file-input" />
          </label>

          {videoFile && <div className="df-file-name" style={{ marginTop: '8px' }}>{videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)</div>}

          <div className="df-actions" style={{ marginTop: '16px' }}>
            <button
              className="df-btn df-btn--primary"
              onClick={handleUpload}
              disabled={isUploading || !videoFile}
            >
              {isUploading ? '⏳ Processing…' : '🚀 Upload & Process'}
            </button>
          </div>

          {status && (
            <div className={`df-status ${status.startsWith('✅') ? 'df-status--success' : status.startsWith('⚠') || status.startsWith('❌') ? 'df-status--error' : 'df-status--info'}`}
              style={{ marginTop: '12px' }}
            >
              {status}
            </div>
          )}

          {poseData && (
            <div style={{ marginTop: '16px' }}>
              <label className="df-label">Pose Data Output</label>
              <pre style={{
                background: '#111118', border: '1px solid #2a2a3e', borderRadius: '8px',
                padding: '12px', color: '#4ade80', fontSize: '12px', maxHeight: '200px',
                overflow: 'auto', fontFamily: 'JetBrains Mono, monospace',
              }}>
                {JSON.stringify(poseData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoUploadPage;