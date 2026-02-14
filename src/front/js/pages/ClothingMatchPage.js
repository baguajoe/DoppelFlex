// src/front/js/pages/ClothingMatchPage.js
// Reworked: dark theme, fixed env vars, functional without external AI API

import React, { useState, useContext, useRef } from 'react';
import { Context } from '../store/appContext';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

// ── Built-in outfit catalog (works without backend) ──
const OUTFIT_CATALOG = [
  { name: 'Red Hoodie', file: 'red_hoodie.glb', tags: ['casual', 'hoodie', 'red', 'streetwear', 'urban'] },
  { name: 'Blue Jeans', file: 'blue_jeans.glb', tags: ['casual', 'jeans', 'blue', 'denim', 'classic'] },
  { name: 'Black Suit', file: 'black_suit.glb', tags: ['formal', 'suit', 'black', 'business', 'elegant'] },
  { name: 'Summer Dress', file: 'summer_dress.glb', tags: ['casual', 'dress', 'summer', 'floral', 'feminine'] },
  { name: 'White T-Shirt', file: 'white_tshirt.glb', tags: ['casual', 't-shirt', 'white', 'basic', 'minimal'] },
  { name: 'Leather Jacket', file: 'leather_jacket.glb', tags: ['edgy', 'jacket', 'leather', 'biker', 'cool'] },
  { name: 'Futuristic Armor', file: 'future_armor.glb', tags: ['futuristic', 'armor', 'sci-fi', 'cyberpunk', 'glow'] },
  { name: 'Track Suit', file: 'track_suit.glb', tags: ['athletic', 'sport', 'track', 'running', 'gym'] },
  { name: 'Kimono Robe', file: 'kimono.glb', tags: ['traditional', 'kimono', 'japanese', 'elegant', 'robe'] },
  { name: 'Punk Vest', file: 'punk_vest.glb', tags: ['punk', 'vest', 'edgy', 'chains', 'rebellion'] },
];

function matchOutfits(query) {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  const scored = OUTFIT_CATALOG.map((outfit) => {
    const score = words.reduce((acc, word) => {
      const match = outfit.tags.some((tag) => tag.includes(word) || word.includes(tag));
      return acc + (match ? 1 : 0);
    }, 0);
    return { ...outfit, score };
  });
  return scored.filter((o) => o.score > 0).sort((a, b) => b.score - a.score);
}

const ClothingMatchPage = () => {
  const { store } = useContext(Context);
  const [query, setQuery] = useState('');
  const [matchedOutfits, setMatchedOutfits] = useState([]);
  const [selectedOutfit, setSelectedOutfit] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);

  // ── Match by text description ──
  const handleMatch = () => {
    if (!query.trim()) return;
    const results = matchOutfits(query);
    setMatchedOutfits(results);
    setSelectedOutfit(null);
    setStatus(results.length > 0 ? '' : 'No matching outfits found. Try different keywords.');
  };

  // ── Upload image + extract basic color description ──
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);

      // Simple color analysis from image
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 40) {
          if (data[i + 3] < 128) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        if (count > 0) { r = r / count; g = g / count; b = b / count; }

        // Map dominant color to style keywords
        const keywords = [];
        if (r > 180 && g < 100 && b < 100) keywords.push('red', 'bold');
        else if (b > 180 && r < 100) keywords.push('blue', 'cool');
        else if (g > 180 && r < 100) keywords.push('green', 'natural');
        else if (r > 200 && g > 200 && b > 200) keywords.push('white', 'minimal', 'basic');
        else if (r < 60 && g < 60 && b < 60) keywords.push('black', 'formal', 'edgy');
        else if (r > 150 && g > 100 && b < 80) keywords.push('warm', 'casual');
        else keywords.push('casual');

        const autoQuery = keywords.join(' ');
        setQuery(autoQuery);
        const results = matchOutfits(autoQuery);
        setMatchedOutfits(results);
        setStatus(`Detected colors suggest: ${keywords.join(', ')}`);
      };
    };
    reader.readAsDataURL(file);
  };

  // ── Save outfit to backend ──
  const handleSave = async () => {
    if (!selectedOutfit) return;
    if (!store?.token) {
      setStatus('Log in to save outfits to your profile.');
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/save-outfit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${store.token}`,
        },
        body: JSON.stringify({
          name: selectedOutfit.name,
          file: selectedOutfit.file,
          style: query,
        }),
      });
      const data = await res.json();
      setStatus(res.ok ? '✅ Outfit saved!' : `Error: ${data.message}`);
    } catch {
      setStatus('Failed to connect to server.');
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🧠 Clothing Style Matcher</h2>
        <p className="df-page__subtitle">
          Upload an image or describe a style to find matching 3D outfits for your avatar.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Input */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">📸 Style Input</h3>
            <span className="df-card__badge df-card__badge--purple">Step 1</span>
          </div>
          <div className="df-card__body">
            {/* Image Upload */}
            <div
              className="df-upload-zone"
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" style={{ maxHeight: '160px', borderRadius: '8px' }} />
              ) : (
                <>
                  <span className="df-upload-zone__icon">👕</span>
                  <span className="df-upload-zone__text">Upload a clothing photo</span>
                  <span className="df-upload-zone__hint">We'll analyze colors to suggest matches</span>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="df-file-input"
              />
            </div>

            {/* Text Input */}
            <div style={{ marginTop: '16px' }}>
              <label className="df-label">Or describe a style</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="df-input"
                  placeholder="e.g. futuristic armor, casual streetwear, formal black suit"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMatch()}
                />
                <button className="df-btn df-btn--primary" onClick={handleMatch}>
                  Match
                </button>
              </div>
            </div>

            {/* Quick Tags */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
              {['casual', 'formal', 'edgy', 'futuristic', 'athletic', 'traditional'].map((tag) => (
                <button
                  key={tag}
                  className={`df-tag ${query.includes(tag) ? 'df-tag--active' : ''}`}
                  onClick={() => { setQuery(tag); setMatchedOutfits(matchOutfits(tag)); }}
                >
                  {tag}
                </button>
              ))}
            </div>

            {status && (
              <div className={`df-status ${status.startsWith('✅') ? 'df-status--success' : status.startsWith('No') || status.startsWith('Failed') || status.startsWith('Error') || status.startsWith('Log') ? 'df-status--error' : 'df-status--info'}`}>
                {status}
              </div>
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">🎽 Matching Outfits</h3>
            <span className="df-card__badge df-card__badge--green">{matchedOutfits.length} found</span>
          </div>
          <div className="df-card__body">
            {matchedOutfits.length === 0 ? (
              <div className="df-empty">
                <div className="df-empty__icon">👔</div>
                <div className="df-empty__text">Describe a style or upload a photo to see matches</div>
              </div>
            ) : (
              <div className="df-match-grid">
                {matchedOutfits.map((outfit, i) => (
                  <div
                    key={i}
                    className={`df-match-item ${selectedOutfit?.file === outfit.file ? 'df-match-item--selected' : ''}`}
                    onClick={() => setSelectedOutfit(outfit)}
                  >
                    <div className="df-match-item__icon">👕</div>
                    <div className="df-match-item__name">{outfit.name}</div>
                    <div className="df-match-item__file">{outfit.file}</div>
                    <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {outfit.tags.slice(0, 3).map((t) => (
                        <span key={t} className="df-tag" style={{ fontSize: '10px', padding: '2px 8px' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedOutfit && (
              <div className="df-actions">
                <button className="df-btn df-btn--success" onClick={handleSave}>
                  💾 Save to Profile
                </button>
                <button className="df-btn df-btn--ghost" onClick={() => setSelectedOutfit(null)}>
                  Clear Selection
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClothingMatchPage;