// src/front/js/component/MultiPhotoUpload.js
// Multi-angle photo upload with guide overlays
// Front (required) + Left profile (optional) + Right profile (optional)
// Includes skin color extraction display and manual color picker

import React, { useState, useRef, useCallback } from "react";
import "../../styles/MultiPhotoUpload.css";

const PHOTO_SLOTS = [
  {
    id: "front",
    label: "Front",
    required: true,
    icon: "😀",
    guide: "Look straight at the camera",
    guideOverlay: "front",
  },
  {
    id: "left",
    label: "Left Side",
    required: false,
    icon: "👤",
    guide: "Turn head ~45° to the right",
    guideOverlay: "left",
  },
  {
    id: "right",
    label: "Right Side",
    required: false,
    icon: "👤",
    guide: "Turn head ~45° to the left",
    guideOverlay: "right",
  },
];

// Default skin tone palette for manual selection
const DEFAULT_PALETTE = [
  { hex: "#f5d6b8", label: "Light" },
  { hex: "#e8b88a", label: "Fair" },
  { hex: "#c8946a", label: "Medium" },
  { hex: "#a67650", label: "Tan" },
  { hex: "#8b5e3c", label: "Brown" },
  { hex: "#6b4226", label: "Dark Brown" },
  { hex: "#4a2c17", label: "Deep" },
  { hex: "#3b1e0e", label: "Ebony" },
];

const MultiPhotoUpload = ({
  onPhotosReady,        // Called with { front, left, right } File objects
  onSkinColorChange,    // Called with hex color string
  detectedSkinColor,    // From backend after front photo upload
  existingFrontPhoto,   // Pre-loaded front photo (from single-photo flow)
}) => {
  const [photos, setPhotos] = useState({
    front: existingFrontPhoto || null,
    left: null,
    right: null,
  });
  const [previews, setPreviews] = useState({
    front: existingFrontPhoto ? URL.createObjectURL(existingFrontPhoto) : null,
    left: null,
    right: null,
  });
  const [skinColor, setSkinColor] = useState(detectedSkinColor || null);
  const [customColor, setCustomColor] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);

  const fileInputRef = useRef(null);

  // Handle photo selection for a slot
  const handlePhotoSelect = useCallback((slotId, file) => {
    if (!file) return;

    const newPhotos = { ...photos, [slotId]: file };
    setPhotos(newPhotos);

    // Generate preview
    const url = URL.createObjectURL(file);
    setPreviews((prev) => {
      // Revoke old preview
      if (prev[slotId]) URL.revokeObjectURL(prev[slotId]);
      return { ...prev, [slotId]: url };
    });

    // Notify parent
    if (onPhotosReady) {
      onPhotosReady(newPhotos);
    }
  }, [photos, onPhotosReady]);

  // Click a slot to upload
  const triggerUpload = (slotId) => {
    setActiveSlot(slotId);
    fileInputRef.current?.click();
  };

  // File input change handler
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && activeSlot) {
      handlePhotoSelect(activeSlot, file);
    }
    e.target.value = ""; // Reset
  };

  // Remove a photo
  const removePhoto = (slotId) => {
    const newPhotos = { ...photos, [slotId]: null };
    setPhotos(newPhotos);
    if (previews[slotId]) URL.revokeObjectURL(previews[slotId]);
    setPreviews((prev) => ({ ...prev, [slotId]: null }));
    if (onPhotosReady) onPhotosReady(newPhotos);
  };

  // Handle skin color selection
  const selectSkinColor = (hex) => {
    setSkinColor(hex);
    setCustomColor(hex);
    if (onSkinColorChange) onSkinColorChange(hex);
  };

  // Handle custom color input
  const handleCustomColorInput = (e) => {
    const hex = e.target.value;
    setCustomColor(hex);
    setSkinColor(hex);
    if (onSkinColorChange) onSkinColorChange(hex);
  };

  const photoCount = Object.values(photos).filter(Boolean).length;

  return (
    <div className="mpu-container">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileChange}
        hidden
      />

      {/* Photo slots */}
      <div className="mpu-slots">
        {PHOTO_SLOTS.map((slot) => (
          <div key={slot.id} className={`mpu-slot ${photos[slot.id] ? "mpu-slot--filled" : ""}`}>
            {/* Preview or upload prompt */}
            {previews[slot.id] ? (
              <div className="mpu-preview-wrap">
                <img src={previews[slot.id]} alt={slot.label} className="mpu-preview-img" />
                <button className="mpu-remove-btn" onClick={() => removePhoto(slot.id)}>✕</button>
                <div className="mpu-slot-badge mpu-slot-badge--done">✓</div>
              </div>
            ) : (
              <button className="mpu-upload-btn" onClick={() => triggerUpload(slot.id)}>
                {/* Guide overlay silhouette */}
                <div className={`mpu-guide-overlay mpu-guide--${slot.guideOverlay}`}>
                  <svg viewBox="0 0 80 100" className="mpu-guide-svg">
                    {slot.guideOverlay === "front" && (
                      <>
                        <ellipse cx="40" cy="38" rx="22" ry="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="40" y1="68" x2="40" y2="85" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="25" y1="72" x2="55" y2="72" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                      </>
                    )}
                    {slot.guideOverlay === "left" && (
                      <>
                        <ellipse cx="45" cy="38" rx="20" ry="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <path d="M 25 38 Q 20 30 25 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="40" y1="68" x2="40" y2="85" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                      </>
                    )}
                    {slot.guideOverlay === "right" && (
                      <>
                        <ellipse cx="35" cy="38" rx="20" ry="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <path d="M 55 38 Q 60 30 55 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                        <line x1="40" y1="68" x2="40" y2="85" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                      </>
                    )}
                  </svg>
                </div>
                <span className="mpu-upload-icon">{slot.icon}</span>
                <span className="mpu-upload-label">{slot.label}</span>
                <span className="mpu-upload-hint">{slot.guide}</span>
                {slot.required && <span className="mpu-required-badge">Required</span>}
                {!slot.required && <span className="mpu-optional-badge">Optional</span>}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Photo count info */}
      <div className="mpu-info-bar">
        <span className="mpu-photo-count">
          {photoCount}/3 photos
          {photoCount === 1 && " — side photos improve accuracy"}
          {photoCount >= 2 && " — great for 3D accuracy!"}
        </span>
      </div>

      {/* Skin Color Section */}
      <div className="mpu-skin-section">
        <div className="mpu-skin-header">
          <h4 className="mpu-skin-title">Skin Color</h4>
          <button
            className="mpu-skin-toggle"
            onClick={() => setShowColorPicker(!showColorPicker)}
          >
            {showColorPicker ? "Close" : "Customize"}
          </button>
        </div>

        {/* Detected color display */}
        {(detectedSkinColor || skinColor) && (
          <div className="mpu-detected-color">
            <div
              className="mpu-color-swatch mpu-color-swatch--large"
              style={{ background: skinColor || detectedSkinColor }}
            />
            <div className="mpu-detected-info">
              <span className="mpu-detected-label">
                {customColor ? "Selected" : "Auto-detected from photo"}
              </span>
              <span className="mpu-detected-hex">{skinColor || detectedSkinColor}</span>
            </div>
          </div>
        )}

        {/* Color picker */}
        {showColorPicker && (
          <div className="mpu-color-picker">
            <div className="mpu-palette">
              {DEFAULT_PALETTE.map((color) => (
                <button
                  key={color.hex}
                  className={`mpu-palette-btn ${skinColor === color.hex ? "active" : ""}`}
                  style={{ background: color.hex }}
                  onClick={() => selectSkinColor(color.hex)}
                  title={color.label}
                />
              ))}
            </div>

            {/* Detected palette (from backend) */}
            {detectedSkinColor && (
              <button
                className="mpu-auto-color-btn"
                onClick={() => selectSkinColor(detectedSkinColor)}
              >
                ↩ Use auto-detected color
              </button>
            )}

            {/* Custom hex input */}
            <div className="mpu-custom-color">
              <label className="mpu-custom-label">Custom:</label>
              <input
                type="color"
                value={customColor || "#c8946a"}
                onChange={handleCustomColorInput}
                className="mpu-color-input"
              />
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  const val = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                    setCustomColor(val);
                    if (val.length === 7) selectSkinColor(val);
                  }
                }}
                placeholder="#c8946a"
                className="mpu-hex-input"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiPhotoUpload;