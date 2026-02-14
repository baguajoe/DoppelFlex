// src/front/js/pages/MyOutfitsPage.js
// Restyled: Dark theme, fixed env var to REACT_APP_BACKEND_URL,
// uses localStorage token (works even when store hasn't hydrated),
// grid layout with preview, favorite, delete, export, download

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const MyOutfitsPage = () => {
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedOutfit, setSelectedOutfit] = useState(null);
  const [actionMsg, setActionMsg] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ── Fetch outfits on mount ──
  useEffect(() => {
    if (!token) {
      setError('Please log in to view your outfits.');
      setLoading(false);
      return;
    }

    const fetchOutfits = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/my-outfits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch outfits.');
        const data = await res.json();
        setOutfits(data.outfits || []);
      } catch (err) {
        console.error(err);
        setError('Unable to load outfits.');
      }
      setLoading(false);
    };

    fetchOutfits();
  }, [token]);

  // ── Actions ──
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this outfit?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/delete-outfit/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setOutfits(outfits.filter((o) => o.id !== id));
        setActionMsg('Outfit deleted.');
        if (selectedOutfit?.id === id) setSelectedOutfit(null);
      } else {
        setActionMsg('Failed to delete outfit.');
      }
    } catch (err) {
      setActionMsg('Network error deleting outfit.');
    }
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleFavorite = async (id) => {
    try {
      const res = await fetch(`${BACKEND}/api/favorite-outfit/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setActionMsg('⭐ Outfit favorited!');
        setOutfits(outfits.map((o) => (o.id === id ? { ...o, is_favorite: true } : o)));
      } else {
        setActionMsg('Failed to favorite outfit.');
      }
    } catch (err) {
      setActionMsg('Network error.');
    }
    setTimeout(() => setActionMsg(''), 3000);
  };

  const handleDownload = (outfit) => {
    const link = document.createElement('a');
    link.href = `${BACKEND}/static/outfits/${outfit.file}`;
    link.download = outfit.file;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCombined = async (outfitFile) => {
    const avatarId = localStorage.getItem('avatar_id');
    if (!avatarId) {
      setActionMsg('No avatar selected. Upload one first.');
      setTimeout(() => setActionMsg(''), 3000);
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/export-combined-avatar`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ avatar_id: avatarId, outfit_file: outfitFile }),
      });

      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'combined_avatar.glb';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setActionMsg('Failed to export combined avatar.');
      setTimeout(() => setActionMsg(''), 3000);
    }
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="df-page" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div className="df-spinner" />
        <p style={{ color: '#888', marginTop: '12px' }}>Loading outfits...</p>
      </div>
    );
  }

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">👕 My Outfits</h2>
        <p className="df-page__subtitle">
          Your saved wardrobe — preview, favorite, export, or delete outfits.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="df-status df-status--error" style={{ marginBottom: '16px' }}>
          {error}
          {error.includes('log in') && (
            <Link to="/login" style={{ color: '#a78bfa', marginLeft: '8px' }}>Log in →</Link>
          )}
        </div>
      )}

      {/* Action message */}
      {actionMsg && (
        <div className="df-status df-status--success" style={{ marginBottom: '16px' }}>
          {actionMsg}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Link to="/clothing-match" className="df-btn df-btn--primary" style={{ textDecoration: 'none' }}>
          🧠 Match New Outfit
        </Link>
        <Link to="/avatar-view" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          🧍 View Avatar
        </Link>
      </div>

      {/* Empty state */}
      {!error && outfits.length === 0 && (
        <div className="df-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>👕</div>
          <p style={{ color: '#888', marginBottom: '12px' }}>No outfits saved yet.</p>
          <Link to="/clothing-match" className="df-btn df-btn--primary" style={{ textDecoration: 'none' }}>
            🧠 AI Style Match
          </Link>
        </div>
      )}

      {/* Outfit Grid */}
      {outfits.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {outfits.map((outfit) => (
            <div
              key={outfit.id}
              className="df-card"
              style={{
                border: selectedOutfit?.id === outfit.id ? '2px solid #a78bfa' : '1px solid #2a2a3e',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedOutfit(outfit)}
            >
              <div className="df-card__body" style={{ padding: '16px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#e0e0e0', margin: 0 }}>
                    {outfit.is_favorite && '⭐ '}{outfit.name}
                  </h4>
                  <span className="df-card__badge">{outfit.style || 'Custom'}</span>
                </div>

                {/* File */}
                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 12px', fontFamily: 'monospace' }}>
                  {outfit.file}
                </p>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="df-btn df-btn--ghost" style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => handleDownload(outfit)}>
                    📥 Download
                  </button>
                  <button className="df-btn df-btn--ghost" style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => navigate(`/rig?outfit=${encodeURIComponent(outfit.file)}`)}>
                    🦴 Rig
                  </button>
                  <button className="df-btn df-btn--ghost" style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => handleExportCombined(outfit.file)}>
                    📦 Export
                  </button>
                  <button className="df-btn df-btn--ghost" style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => handleFavorite(outfit.id)}>
                    ⭐ Fav
                  </button>
                  <button className="df-btn df-btn--danger" style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => handleDelete(outfit.id)}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Outfit Preview */}
      {selectedOutfit && (
        <div className="df-card" style={{ marginTop: '16px' }}>
          <div className="df-card__header">
            <h3 className="df-card__title">👀 Preview: {selectedOutfit.name}</h3>
          </div>
          <div className="df-card__body" style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ color: '#888', fontSize: '13px' }}>
              3D preview requires AvatarPreview component with Three.js.
            </p>
            <p style={{ color: '#666', fontSize: '12px', fontFamily: 'monospace' }}>
              File: {selectedOutfit.file}
            </p>
            <button
              className="df-btn df-btn--primary"
              style={{ marginTop: '12px' }}
              onClick={() => handleExportCombined(selectedOutfit.file)}
            >
              📦 Export Avatar + This Outfit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyOutfitsPage;