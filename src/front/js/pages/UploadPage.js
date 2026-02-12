import React, { useState } from 'react';
import AvatarCreation from '../component/AvatarCreation';
import AvatarViewer from '../component/AvatarViewer';

const UploadPage = () => {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleAvatarCreated = (url) => {
    setAvatarUrl(url);
  };

  const handleAvatarCreation = async (selfie) => {
    setLoading(true);
    setErrorMessage("");

    // Example fetch to send the selfie image to backend
    const formData = new FormData();
    formData.append("image", selfie); // Assuming selfie is the file
    try {
      const response = await fetch(`${process.env.BACKEND_URL}/api/create-avatar`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        handleAvatarCreated(data.avatar_url);
      } else {
        setErrorMessage("Error generating avatar. Please try again.");
      }
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage("Something went wrong!");
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e) => {
    setImage(e.target.files[0]);
    setErrorMessage(""); // Reset any previous error messages
  };

  return (
    <div>
      <h2>Upload Your Photo</h2>

      {/* File Upload Component */}
      <input
        type="file"
        accept="image/*"
        className="form-control mb-3"
        onChange={handleImageChange}
      />

      {/* Error message */}
      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}

      {/* Avatar creation component */}
      <button
        onClick={() => handleAvatarCreation(image)}
        disabled={loading || !image}
        className="btn btn-primary"
      >
        {loading ? "Generating..." : "Create Avatar"}
      </button>

      {/* Display loading state */}
      {loading && <p>Generating avatar...</p>}

      {/* Display Avatar if it's created */}
      {avatarUrl && <AvatarViewer modelUrl={avatarUrl} />}
    </div>
  );
};

export default UploadPage;
