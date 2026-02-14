// src/front/js/pages/CustomizePage.js
// Dark theme, saves customization to backend, reads avatarId from localStorage

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AvatarCustomizer from '../component/AvatarCustomizer';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const CustomizePage = () => {
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const avatarId = localStorage.getItem('avatar_id') || '';

  const handleCustomization = async (customization) => {
    if (!avatarId) {
      setStatus('⚠️ No avatar found. Upload a selfie first.');
      return;
    }

    setSaving(true);
    setStatus('');

    try {
      const res = await fetch(`${BACKEND}/api/save-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_id: avatarId,
          ...customization,
        }),
      });

      if (res.ok) {
        setStatus('✅ Customization saved!');
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(`❌ ${err.error || 'Save failed'}`);
      }
    } catch (err) {
      console.error('[CustomizePage]', err);
      setStatus('❌ Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎨 Customize Avatar</h2>
        <p className="df-page__subtitle">
          Adjust body proportions, skin tone, outfit colors, and accessories.
        </p>
      </div>

      {!avatarId && (
        <div className="df-card" style={{ marginBottom: '16px' }}>
          <div className="df-card__body">
            <div className="df-status df-status--error">
              No avatar loaded.{' '}
              <Link to="/upload" style={{ color: '#a78bfa' }}>Create one first →</Link>
            </div>
          </div>
        </div>
      )}

      <div className="df-grid-2">
        {/* Left: Customizer */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">⚙️ Customization</h3>
          </div>
          <div className="df-card__body">
            <AvatarCustomizer onCustomize={handleCustomization} darkTheme />
          </div>

          {saving && (
            <div className="df-card__body" style={{ paddingTop: 0 }}>
              <div className="df-status df-status--info">
                <div className="df-spinner" /> Saving…
              </div>
            </div>
          )}

          {status && !saving && (
            <div className="df-card__body" style={{ paddingTop: 0 }}>
              <div className={`df-status ${status.includes('✅') ? 'df-status--success' : 'df-status--error'}`}>
                {status}
              </div>
            </div>
          )}
        </div>

        {/* Right: Tips + Links */}
        <div>
          <div className="df-card" style={{ marginBottom: '12px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">💡 Tips</h3>
            </div>
            <div className="df-card__body" style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.8' }}>
              <p><strong style={{ color: '#e0e0e0' }}>Height & Weight</strong> — These affect avatar proportions if your model supports morph targets.</p>
              <p><strong style={{ color: '#e0e0e0' }}>Skin Color</strong> — Applied to the base mesh material. Works best with unlit or toon-shaded models.</p>
              <p><strong style={{ color: '#e0e0e0' }}>Accessories</strong> — Attach items like glasses, hats, or jewelry to predefined bone positions.</p>
            </div>
          </div>

          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔗 Quick Links</h3>
            </div>
            <div className="df-card__body" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Link to="/avatar-view" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>🧍 View Avatar</Link>
              <Link to="/clothing-match" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>👗 Clothing Match</Link>
              <Link to="/export-avatar" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>📦 Export</Link>
              <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>🎥 Motion Capture</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomizePage;