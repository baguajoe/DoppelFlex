// src/front/js/component/AvatarCustomizer.js
import React, { useEffect, useRef, useState } from "react";
import ModelViewer from "./ModelViewer";
import ColorThief from "colorthief";

// ─── Consistent model path ───
const DEFAULT_MODEL = "/static/models/Y_Bot.glb";

const AvatarCustomizer = ({ onCustomize }) => {
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(70);
  const [skinColor, setSkinColor] = useState("#f5cba7");
  const [outfitColor, setOutfitColor] = useState("#3498db");
  const [accessories, setAccessories] = useState("glasses");
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const fileInputRef = useRef();

  const backendUrl = process.env.REACT_APP_BACKEND_URL || "";

  const handleSelfieUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result;
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const colorThief = new ColorThief();
        const dominant = colorThief.getColor(canvas);
        const hexColor = `#${dominant.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
        setSkinColor(hexColor);
        setSelfiePreview(reader.result);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const custom = {
      height,
      weight,
      skin_color: skinColor,
      outfit_color: outfitColor,
      accessories,
      modelUrl,
    };
    onCustomize(custom);

    const token = localStorage.getItem("token");
    if (token) {
      await fetch(`${backendUrl}/api/save-avatar-preset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(custom),
      });
    }
  };

  return (
    <div>
      <h2>Customize Your Avatar</h2>

      <div className="input-group">
        <label htmlFor="height">Height (cm):</label>
        <input
          type="number"
          id="height"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          min="100"
          max="250"
        />
      </div>

      <div className="input-group">
        <label htmlFor="weight">Weight (kg):</label>
        <input
          type="number"
          id="weight"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          min="30"
          max="200"
        />
      </div>

      <div className="input-group">
        <label htmlFor="skin-color">Skin Color:</label>
        <input
          type="color"
          id="skin-color"
          value={skinColor}
          onChange={(e) => setSkinColor(e.target.value)}
        />
      </div>

      <div className="input-group">
        <label htmlFor="outfit-color">Outfit Color:</label>
        <input
          type="color"
          id="outfit-color"
          value={outfitColor}
          onChange={(e) => setOutfitColor(e.target.value)}
        />
      </div>

      <div className="input-group">
        <label htmlFor="accessories">Accessories:</label>
        <select
          id="accessories"
          value={accessories}
          onChange={(e) => setAccessories(e.target.value)}
        >
          <option value="glasses">Glasses</option>
          <option value="hat">Hat</option>
          <option value="necklace">Necklace</option>
        </select>
      </div>

      <div className="input-group">
        <label htmlFor="model">Avatar Model:</label>
        <select
          id="model"
          value={modelUrl}
          onChange={(e) => setModelUrl(e.target.value)}
        >
          <option value="/static/models/Y_Bot.glb">Y Bot</option>
          <option value="/static/models/xbot_avatar_compressed.glb">X Bot</option>
        </select>
      </div>

      {/* Selfie Upload + Preview */}
      <div className="input-group">
        <label>Upload Selfie for Skin Tone Detection:</label>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleSelfieUpload} />
        {selfiePreview && <img src={selfiePreview} alt="Preview" width={100} />}
      </div>

      {/* Live Preview */}
      <h3 className="mt-4">🧍 Live Preview</h3>
      <div style={{ height: "400px", border: "1px solid #ccc" }}>
        <ModelViewer url={modelUrl} skinColor={skinColor} outfitColor={outfitColor} />
      </div>

      <button className="btn btn-success mt-3" onClick={handleSave}>Save Preset</button>
    </div>
  );
};

export default AvatarCustomizer;