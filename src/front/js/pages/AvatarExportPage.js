// src/front/js/pages/AvatarExportPage.js
// FIX: Reads avatar model URL from localStorage instead of hardcoded path
// Added: dark theme, proper env var, status feedback, format descriptions

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const RIG_OPTIONS = [
  { value: 'unity', label: 'Unity Humanoid', desc: 'Standard humanoid rig for Unity game engine' },
  { value: 'unreal', label: 'Unreal Skeleton', desc: 'Compatible with Unreal Engine mannequin' },
  { value: 'maya', label: 'Maya', desc: 'Autodesk Maya bone hierarchy' },
];

const FORMAT_OPTIONS = [
  { value: 'fbx', label: 'FBX', desc: 'Industry standard for game engines' },
  { value: 'glb', label: 'glTF / GLB', desc: 'Web-friendly, compact binary format' },
  { value: 'obj', label: 'OBJ', desc: 'Universal mesh format (no bones)' },
];

const AvatarExportPage = () => {
  const [rigType, setRigType] = useState('unity');
  const [fileType, setFileType] = useState('fbx');
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState('');

  // Read avatar model URL from localStorage (set by UploadPage, CustomizePage, or AvatarViewPage)
  const avatarModelUrl = localStorage.getItem('avatar_url') || '';

  const handleExport = async () => {
    if (!avatarModelUrl) {
      setStatus('No avatar model found. Please create or upload an avatar first.');
      return;
    }

    setExporting(true);
    setStatus('');

    const riggingPreset = rigType;
    const exportData = {
      riggingPreset,
      avatarModel: avatarModelUrl,
      fileType,
    };

    try {
      const res = await fetch(`${BACKEND}/api/export-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      // Download the blob
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avatar_${riggingPreset}.${fileType}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus('✅ Export downloaded!');
    } catch (err) {
      console.error('[Export]', err);
      setStatus(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">📦 Export Avatar</h2>
        <p className="df-page__subtitle">
          Download your rigged avatar for Unity, Unreal Engine, or Maya.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Export Settings */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">⚙️ Export Settings</h3>
          </div>
          <div className="df-card__body">
            {/* Current Avatar */}
            <div style={{ marginBottom: '20px' }}>
              <label className="df-label">Current Avatar</label>
              {avatarModelUrl ? (
                <div style={{
                  background: '#111118',
                  border: '1px solid #2a2a3e',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: '#a78bfa',
                  wordBreak: 'break-all',
                }}>
                  {avatarModelUrl}
                </div>
              ) : (
                <div className="df-status df-status--error" style={{ marginTop: '4px' }}>
                  No avatar loaded.{' '}
                  <Link to="/upload" style={{ color: '#a78bfa' }}>Create one →</Link>
                </div>
              )}
            </div>

            {/* Rigging Type */}
            <div style={{ marginBottom: '20px' }}>
              <label className="df-label">Rigging Preset</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {RIG_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      background: rigType === opt.value ? '#1a1a2e' : '#111118',
                      border: `1px solid ${rigType === opt.value ? '#a78bfa' : '#2a2a3e'}`,
                      borderRadius: '8px',
                      padding: '10px 14px',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <input
                      type="radio"
                      name="rigType"
                      value={opt.value}
                      checked={rigType === opt.value}
                      onChange={(e) => setRigType(e.target.value)}
                      style={{ marginTop: '3px' }}
                    />
                    <div>
                      <div style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '13px' }}>{opt.label}</div>
                      <div style={{ color: '#777', fontSize: '11px' }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* File Format */}
            <div style={{ marginBottom: '20px' }}>
              <label className="df-label">File Format</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`df-tag ${fileType === opt.value ? 'df-tag--active' : ''}`}
                    onClick={() => setFileType(opt.value)}
                    title={opt.desc}
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    .{opt.value}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                {FORMAT_OPTIONS.find((o) => o.value === fileType)?.desc}
              </div>
            </div>

            {/* Export Button */}
            <button
              className="df-btn df-btn--primary"
              onClick={handleExport}
              disabled={exporting || !avatarModelUrl}
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
            >
              {exporting ? '⏳ Exporting…' : `📥 Download .${fileType}`}
            </button>

            {status && (
              <div
                className={`df-status ${status.startsWith('✅') ? 'df-status--success' : 'df-status--error'}`}
                style={{ marginTop: '12px' }}
              >
                {status}
              </div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div>
          <div className="df-card" style={{ marginBottom: '12px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">💡 Export Tips</h3>
            </div>
            <div className="df-card__body" style={{ fontSize: '13px', color: '#aaa', lineHeight: '1.7' }}>
              <p><strong style={{ color: '#e0e0e0' }}>Unity:</strong> Use FBX format. Import into Unity and set the rig type to "Humanoid" in the Inspector for Mecanim compatibility.</p>
              <p><strong style={{ color: '#e0e0e0' }}>Unreal:</strong> Use FBX. Import and retarget to the UE4/UE5 mannequin skeleton for animation blueprint support.</p>
              <p><strong style={{ color: '#e0e0e0' }}>Web / Three.js:</strong> Use GLB format for the smallest file size and fastest loading in browser-based 3D scenes.</p>
              <p><strong style={{ color: '#e0e0e0' }}>OBJ:</strong> Exports mesh only (no skeleton or animations). Best for static renders or 3D printing.</p>
            </div>
          </div>

          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔗 Quick Links</h3>
            </div>
            <div className="df-card__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link to="/avatar-view" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🧍 View Avatar
                </Link>
                <Link to="/rig" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🦴 Rig Avatar
                </Link>
                <Link to="/customize" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🎨 Customize
                </Link>
                <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🎥 Motion Capture
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvatarExportPage;