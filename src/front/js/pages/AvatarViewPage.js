// UploadPage.js
import React, { useState } from 'react';
import ModelViewer from "../component/ModelViewer";


const AvatarViewPage = ({ avatarUrl, skinColor = "#f5cba7" }) => {
  return (
    <div className="container mt-4">
      <h2>Your Avatar Preview</h2>
      {avatarUrl ? (
        <ModelViewer url={avatarUrl} skinColor={skinColor} />
      ) : (
        <p>No avatar to preview.</p>
      )}
    </div>
  );
};

export default AvatarViewPage;
