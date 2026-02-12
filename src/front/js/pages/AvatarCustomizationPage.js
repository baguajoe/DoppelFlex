// src/pages/AvatarCustomizationPage.js
import React, { useState } from 'react';
import ModelViewer from '../component/ModelViewer'; // For previewing the 3D avatar

const AvatarCustomizationPage = () => {
  const [height, setHeight] = useState(170); // Default height in cm
  const [weight, setWeight] = useState(70); // Default weight in kg
  const [skinColor, setSkinColor] = useState('#f5cba7');
  const [outfitColor, setOutfitColor] = useState('#3498db');
  const [accessories, setAccessories] = useState('glasses');
  const [modelUrl, setModelUrl] = useState(null); // Holds the URL for the generated model
  const [selfie, setSelfie] = useState(null); // Holds the selfie image
  const [loading, setLoading] = useState(false);

  // Handle uploading the selfie image
  const handleSelfieUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelfie(URL.createObjectURL(file)); // Preview the selfie image
    }
  };

  const handleSavePreset = async () => {
    const customizationData = {
      height,
      weight,
      skin_color: skinColor,
      outfit_color: outfitColor,
      accessories,
    };
  
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const response = await fetch(`${process.env.BACKEND_URL}/api/save-avatar-preset`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(customizationData),
        });
  
        const data = await response.json();
        if (response.ok) {
          alert("Preset saved successfully!");
        } else {
          alert("Failed to save preset");
        }
      } catch (error) {
        console.error("Error:", error);
        alert("Something went wrong while saving preset");
      }
    }
  };
  
  // Handle the save and build process (sending data to backend)
  const handleSaveAndBuild = async () => {
    setLoading(true);

    const formData = new FormData();
    formData.append('image', selfie); // Add the selfie image
    formData.append('user_id', 'USER_ID'); // Add user id if needed

    try {
      // Send customization data and selfie image to backend
      const response = await fetch(`${process.env.BACKEND_URL}/api/create-avatar`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setModelUrl(data.avatar_url); // Get the URL of the generated avatar
      } else {
        alert('Error generating avatar');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Customize Your Avatar</h1>
      {/* Avatar Customization Form */}
      <div>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          placeholder="Height (cm)"
        />
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Weight (kg)"
        />
        <input
          type="color"
          value={skinColor}
          onChange={(e) => setSkinColor(e.target.value)}
        />
        <input
          type="color"
          value={outfitColor}
          onChange={(e) => setOutfitColor(e.target.value)}
        />
        <select onChange={(e) => setAccessories(e.target.value)}>
          <option value="glasses">Glasses</option>
          <option value="hat">Hat</option>
          <option value="necklace">Necklace</option>
        </select>

        {/* Selfie Upload */}
        <input type="file" accept="image/*" onChange={handleSelfieUpload} />
        {selfie && <img src={selfie} alt="Selfie Preview" width="100" />}
      </div>

      {/* Save and Build Avatar Button */}
      <button onClick={handleSaveAndBuild} disabled={loading}>
        {loading ? 'Building...' : 'Save & Build Avatar'}
      </button>
      <button onClick={handleSavePreset}>Save as Preset</button>


      {/* Show the Avatar Preview */}
      {modelUrl && <ModelViewer url={modelUrl} />}
    </div>
  );
};

export default AvatarCustomizationPage;
