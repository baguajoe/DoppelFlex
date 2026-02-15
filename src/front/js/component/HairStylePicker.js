// src/front/js/component/HairStylePicker.js
// Hair style selector + color picker
// Shows style options with preview icons + auto-detected/custom hair color

import React, { useState, useEffect } from 'react';

const HAIR_STYLES = [
  { id: 'bald', label: 'Bald', icon: '👨‍🦲' },
  { id: 'buzz', label: 'Buzz Cut', icon: '💇' },
  { id: 'short', label: 'Short', icon: '👱' },
  { id: 'medium', label: 'Medium', icon: '🧑' },
  { id: 'long', label: 'Long', icon: '👩' },
  { id: 'afro', label: 'Afro', icon: '🧑‍🦱' },
];

const HAIR_COLORS = [
  { hex: '#0a0a0a', label: 'Black' },
  { hex: '#2a1a0a', label: 'Dark Brown' },
  { hex: '#5a3218', label: 'Brown' },
  { hex: '#8b4513', label: 'Auburn' },
  { hex: '#c87830', label: 'Ginger' },
  { hex: '#d4a560', label: 'Blonde' },
  { hex: '#f0e0c0', label: 'Platinum' },
  { hex: '#808080', label: 'Gray' },
  { hex: '#ffffff', label: 'White' },
];

const HairStylePicker = ({
  onStyleChange,
  onColorChange,
  detectedHairColor,
  initialStyle = 'short',
}) => {
  const [selectedStyle, setSelectedStyle] = useState(initialStyle);
  const [selectedColor, setSelectedColor] = useState(detectedHairColor || '#2a1a0a');
  const [showColors, setShowColors] = useState(false);

  useEffect(() => {
    if (detectedHairColor) {
      setSelectedColor(detectedHairColor);
    }
  }, [detectedHairColor]);

  const handleStyleChange = (styleId) => {
    setSelectedStyle(styleId);
    if (onStyleChange) onStyleChange(styleId);
  };

  const handleColorChange = (hex) => {
    setSelectedColor(hex);
    if (onColorChange) onColorChange(hex);
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '10px',
      padding: '14px',
    }}>
      {/* Hair Style */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: '10px',
      }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#c0c0d0', margin: 0 }}>
          Hair Style
        </h4>
        <button
          onClick={() => setShowColors(!showColors)}
          style={{
            fontSize: '11px', color: '#a78bfa', background: 'none',
            border: '1px solid rgba(167,139,250,0.2)', borderRadius: '6px',
            padding: '3px 10px', cursor: 'pointer',
          }}
        >
          {showColors ? 'Hide Colors' : 'Change Color'}
        </button>
      </div>

      {/* Style grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
        marginBottom: '10px',
      }}>
        {HAIR_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => handleStyleChange(style.id)}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '2px',
              padding: '8px 4px', borderRadius: '8px',
              cursor: 'pointer',
              background: selectedStyle === style.id
                ? 'rgba(99,102,241,0.15)'
                : 'rgba(255,255,255,0.03)',
              border: selectedStyle === style.id
                ? '1px solid rgba(99,102,241,0.4)'
                : '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.12s ease',
            }}
          >
            <span style={{ fontSize: '20px' }}>{style.icon}</span>
            <span style={{ fontSize: '10px', color: '#aaa' }}>{style.label}</span>
          </button>
        ))}
      </div>

      {/* Current color swatch */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        marginBottom: showColors ? '10px' : 0,
      }}>
        <div style={{
          width: '22px', height: '22px', borderRadius: '50%',
          background: selectedColor,
          border: '2px solid rgba(255,255,255,0.15)',
        }} />
        <span style={{ fontSize: '11px', color: '#888' }}>
          Hair: <span style={{ fontFamily: 'monospace', color: '#aaa' }}>{selectedColor}</span>
          {detectedHairColor && selectedColor === detectedHairColor ? ' (detected)' : ''}
        </span>
      </div>

      {/* Color picker */}
      {showColors && (
        <div>
          <div style={{
            display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px',
          }}>
            {HAIR_COLORS.map((color) => (
              <button
                key={color.hex}
                onClick={() => handleColorChange(color.hex)}
                title={color.label}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: color.hex, cursor: 'pointer',
                  border: selectedColor === color.hex
                    ? '2px solid white'
                    : '2px solid transparent',
                  boxShadow: selectedColor === color.hex
                    ? '0 0 0 2px rgba(99,102,241,0.5)'
                    : 'none',
                  transition: 'all 0.12s ease',
                }}
              />
            ))}
          </div>

          {/* Custom color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#666' }}>Custom:</span>
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => handleColorChange(e.target.value)}
              style={{
                width: '28px', height: '28px', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', cursor: 'pointer', padding: 0, background: 'transparent',
              }}
            />
            {detectedHairColor && (
              <button
                onClick={() => handleColorChange(detectedHairColor)}
                style={{
                  fontSize: '10px', color: '#a78bfa',
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.15)',
                  borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
                }}
              >
                ↩ Auto-detected
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HairStylePicker;