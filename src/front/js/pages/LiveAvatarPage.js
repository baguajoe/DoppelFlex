// src/front/js/pages/LiveAvatarPage.js
// Simplified version using the new LiveMoCapAvatar component

import React, { useState } from 'react';
import LiveMoCapAvatar from '../component/LiveMoCapAvatar';

const LiveAvatarPage = () => {
  // Use backend URL for static files
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const defaultAvatar = `${backendUrl}/static/uploads/me_wit_locks.jpg_avatar.glb`;
  
  const [avatarUrl, setAvatarUrl] = useState(defaultAvatar);

  const avatarOptions = [
    { name: 'Default Avatar', url: `${backendUrl}/static/uploads/me_wit_locks.jpg_avatar.glb` },
    { name: 'Rigged Avatar', url: `${backendUrl}/static/models/avatar.glb` },
  ];

  return (
    <div className="container mt-4">
      <h2>🎥 Live Avatar Mode</h2>
      <p>Move in front of your webcam to animate your avatar in real-time.</p>

      {/* Avatar Selection */}
      <div className="mb-3">
        <label className="form-label">Select Avatar:</label>
        <select
          className="form-select w-auto"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
        >
          {avatarOptions.map((opt) => (
            <option key={opt.url} value={opt.url}>{opt.name}</option>
          ))}
        </select>
      </div>

      {/* Live MoCap Component */}
      <LiveMoCapAvatar
        avatarUrl={avatarUrl}
        showVideo={true}
        videoWidth={400}
      />
    </div>
  );
};

export default LiveAvatarPage;