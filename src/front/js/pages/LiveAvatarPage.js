// src/front/js/pages/LiveAvatarPage.js
// Simplified version using the new LiveMoCapAvatar component

import React, { useState } from 'react';
import LiveMoCapAvatar from '../component/LiveMoCapAvatar';

const LiveAvatarPage = () => {
  const [avatarUrl, setAvatarUrl] = useState('/models/avatar.glb');

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
          <option value="/models/avatar.glb">Default Avatar</option>
          <option value="/rigged-avatar.glb">Rigged Avatar</option>
          <option value="/alt-avatar.glb">Alternate Avatar</option>
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