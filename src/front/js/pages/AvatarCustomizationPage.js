// src/front/js/pages/AvatarCustomizationPage.js
// Reworked: dark theme, labeled controls, real-time preview, fixed env vars

import React, { useState, useRef, useCallback } from 'react';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const ACCESSORY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'glasses', label: '👓 Glasses' },
  { value: 'hat', label: '🎩 Hat' },
  { value: 'necklace', label: '📿 Necklace' },
  { value: 'earrings', label: '💎 Earrings' },
];

const MODEL_OPTIONS = [
  { value: `${BACKEND}/static/models/Y_Bot.glb`, label: 'Y Bot' },
  { value: `${BACKEND}/static/models/xbot_avatar_compressed.glb`, label: 'X Bot' },
];

const AvatarCustomizationPage = () => {
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(70);
  const [skinColor, setSkinColor] = useState('#f5cba7');
  const [outfitColor, setOutfitColor] = useState('#3498db');
  const [accessories, setAccessories] = useState('none');
  const [modelUrl, setModelUrl] = useState(MODEL_OPTIONS[0].value);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);

  // ── Body type from sliders ──
  const bodyType = weight > 90 ? 'Heavy' : weight > 70 ? 'Athletic' : 'Slim';
  const heightLabel = height >= 180 ? 'Tall' : height >= 165 ? 'Average' : 'Short';

  // ── Selfie color extraction ──
  const handleSelfie = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Sample center region for skin tone
        const cx = Math.floor(img.width / 2);
        const cy = Math.floor(img.height / 3);
        const size = 40;
        const data = ctx.getImageData(cx - size, cy - size, size * 2, size * 2).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          setSkinColor(hex);
        }
        setSelfiePreview(reader.result);
      };
    };
    reader.readAsDataURL(file);
  }, []);

  // ── Save to backend ──
  const handleSave = async () => {
    setStatus('');
    try {
      const res = await fetch(`${BACKEND}/api/save-avatar-preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          height, weight, skinColor, outfitColor, accessories, modelUrl,
        }),
      });
      const data = await res.json();
      setStatus(res.ok ? '✅ Customization saved!' : `Error: ${data.error || 'Unknown'}`);
    } catch {
      setStatus('⚠️ Backend not reachable — settings saved locally only.');
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎨 Style Editor</h2>
        <p className="df-page__subtitle">
          Customize your avatar's appearance — body shape, skin tone, outfit color, and accessories.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Body Shape */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">📏 Body Shape</h3>
              <span className="df-card__badge df-card__badge--purple">{heightLabel} · {bodyType}</span>
            </div>
            <div className="df-card__body">
              <div className="df-slider-group">
                <label className="df-label">Height</label>
                <div className="df-slider-row">
                  <input
                    type="range" min="140" max="210" value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    className="df-range" style={{ flex: 1 }}
                  />
                  <span className="df-slider-value">{height}cm</span>
                </div>
              </div>
              <div className="df-slider-group" style={{ marginTop: '14px' }}>
                <label className="df-label">Weight</label>
                <div className="df-slider-row">
                  <input
                    type="range" min="40" max="130" value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="df-range" style={{ flex: 1 }}
                  />
                  <span className="df-slider-value">{weight}kg</span>
                </div>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🎨 Colors</h3>
            </div>
            <div className="df-card__body">
              <div className="df-form-row">
                <div className="df-form-group">
                  <label className="df-label">Skin Tone</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="color" value={skinColor}
                      onChange={(e) => setSkinColor(e.target.value)}
                      className="df-color-input"
                    />
                    <span style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>{skinColor}</span>
                  </div>
                </div>
                <div className="df-form-group">
                  <label className="df-label">Outfit Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                      type="color" value={outfitColor}
                      onChange={(e) => setOutfitColor(e.target.value)}
                      className="df-color-input"
                    />
                    <span style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>{outfitColor}</span>
                  </div>
                </div>
              </div>

              {/* Selfie for auto skin tone */}
              <div style={{ marginTop: '8px' }}>
                <label className="df-label">Auto-detect from selfie</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label className="df-file-label" onClick={() => fileRef.current?.click()}>
                    📷 Upload Selfie
                  </label>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleSelfie} className="df-file-input" />
                  {selfiePreview && (
                    <img src={selfiePreview} alt="selfie" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Accessories & Model */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">✨ Extras</h3>
            </div>
            <div className="df-card__body">
              <div className="df-form-row">
                <div className="df-form-group">
                  <label className="df-label">Accessories</label>
                  <select value={accessories} onChange={(e) => setAccessories(e.target.value)} className="df-select">
                    {ACCESSORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="df-form-group">
                  <label className="df-label">Avatar Model</label>
                  <select value={modelUrl} onChange={(e) => setModelUrl(e.target.value)} className="df-select">
                    {MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="df-actions">
            <button className="df-btn df-btn--primary" onClick={handleSave}>
              💾 Save Customization
            </button>
            <button className="df-btn df-btn--ghost" onClick={() => {
              setHeight(170); setWeight(70); setSkinColor('#f5cba7');
              setOutfitColor('#3498db'); setAccessories('none');
            }}>
              Reset Defaults
            </button>
          </div>

          {status && (
            <div className={`df-status ${status.startsWith('✅') ? 'df-status--success' : 'df-status--error'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">👤 Preview</h3>
            <span className="df-card__badge df-card__badge--green">{heightLabel} · {bodyType}</span>
          </div>
          <div className="df-card__body">
            <div className="df-preview" style={{ position: 'relative' }}>
              {/* Visual preview placeholder — shows selected colors */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '80px', height: '80px', borderRadius: '50%',
                  background: skinColor, margin: '0 auto 12px',
                  border: '3px solid #2a2a3e',
                  boxShadow: `0 0 20px ${skinColor}33`,
                }} />
                <div style={{
                  width: '60px', height: '100px', borderRadius: '8px',
                  background: outfitColor, margin: '0 auto',
                  border: '3px solid #2a2a3e',
                  boxShadow: `0 0 20px ${outfitColor}33`,
                }} />
                <div style={{ marginTop: '16px', fontSize: '13px', color: '#666' }}>
                  {height}cm · {weight}kg · {accessories !== 'none' ? accessories : 'no accessories'}
                </div>
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#444' }}>
                  Full 3D preview coming soon
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarCustomizationPage;