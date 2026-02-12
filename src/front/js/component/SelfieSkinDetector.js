import React, { useState, useRef, useEffect } from "react";
import ColorThief from "colorthief";

const SelfieSkinDetector = ({ onSkinColorDetected }) => {
  const [preview, setPreview] = useState(null);
  const imageRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleDetectColor = () => {
    if (!imageRef.current) return;

    const colorThief = new ColorThief();
    const [r, g, b] = colorThief.getColor(imageRef.current);
    const rgbColor = `rgb(${r}, ${g}, ${b})`;
    const hex = `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`;

    console.log("Detected Skin Color:", rgbColor, hex);
    if (onSkinColorDetected) onSkinColorDetected(hex);
  };

  return (
    <div>
      <h4>Upload Selfie to Detect Skin Tone</h4>
      <input type="file" accept="image/*" onChange={handleImageChange} />

      {preview && (
        <div>
          <img
            src={preview}
            ref={imageRef}
            crossOrigin="anonymous"
            alt="Selfie"
            onLoad={handleDetectColor}
            style={{ width: 250, marginTop: 10 }}
          />
        </div>
      )}
    </div>
  );
};

export default SelfieSkinDetector;
