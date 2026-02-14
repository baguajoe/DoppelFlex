// src/front/js/pages/MyOutfitsPage.js
// Reworked: dark theme, fixed env vars (REACT_APP_BACKEND_URL), card layout

import React, { useEffect, useState, useContext } from 'react';
import { Context } from '../store/appContext';
import { useNavigate } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const MyOutfitsPage = () => {
  const { store } = useContext(Context);
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOutfits = async () => {
      if (!store?.token) {
        setError('Log in to view your saved outfits.');
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${BACKEND}/api/my-outfits`, {
          headers: { Authorization: `Bearer ${store.token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch outfits.');
        const data = await res.json();
        setOutfits(data.outfits || []);
      } catch (err) {
        console.error(err);
        setError('Unable to load outfits from server.');
      }
      setLoading(false);
    };

    fetchOutfits();
  }, [store?.token]);

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${BACKEND}/api/delete-outfit/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${store.token}` },
      });
      if (res.ok) {
        setOutfits(outfits.filter((o) => o.id !== id));
        setStatus('Outfit deleted.');
      }
    } catch {
      setStatus('Failed to delete outfit.');
    }
  };

  const handleFavorite = async (id) => {
    try {
      const res = await fetch(`${BACKEND}/api/favorite-outfit/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${store.token}` },
      });
      if (res.ok) setStatus('⭐ Outfit favorited!');
    } catch {
      setStatus('Failed to favorite.');
    }
  };

  const handleDownload = (outfit) => {
    const link = document.createElement('a');
    link.href = `${BACKEND}/static/outfits/${outfit.file}`;
    link.download = outfit.file;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleExport = async (outfitFile) => {
    try {
      const res = await fetch(`${BACKEND}/api/export-combined-avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${store.token}`,
        },
        body: JSON.stringify({
          avatar_id: store.userAvatarId,
          outfit_file: outfitFile,
        }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'combined_avatar.glb';
      a.click();
    } catch {
      setStatus('Export failed — check backend connection.');
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">👗 My Outfits</h2>
        <p className="df-page__subtitle">
          View, preview, and manage your saved outfits. Download or apply them to your avatar.
        </p>
      </div>

      {/* Status */}
      {status && (
        <div className={`df-status ${status.startsWith('⭐') || status.includes('deleted') ? 'df-status--success' : 'df-status--error'}`}
          style={{ marginBottom: '16px' }}
        >
          {status}
          <button onClick={() => setStatus('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="df-loading">
          <div className="df-spinner" />
          Loading outfits...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="df-status df-status--error">{error}</div>
      )}

      {/* Empty */}
      {!loading && !error && outfits.length === 0 && (
        <div className="df-card">
          <div className="df-card__body">
            <div className="df-empty">
              <div className="df-empty__icon">🧵</div>
              <div className="df-empty__text">No outfits saved yet</div>
              <button
                className="df-btn df-btn--primary"
                style={{ marginTop: '16px' }}
                onClick={() => navigate('/clothing-match')}
              >
                🔍 Find Outfits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outfit Grid */}
      {outfits.length > 0 && (
        <div className="df-grid-3">
          {outfits.map((outfit) => (
            <div key={outfit.id} className="df-outfit-card">
              <h4 className="df-outfit-card__name">{outfit.name}</h4>
              <p className="df-outfit-card__style">
                {outfit.style || 'No style info'}
              </p>
              <div style={{ fontSize: '11px', color: '#555', fontFamily: 'monospace', marginBottom: '10px' }}>
                {outfit.file}
              </div>
              <div className="df-outfit-card__actions">
                <button className="df-btn df-btn--sm df-btn--primary" onClick={() => handleDownload(outfit)}>
                  📥 Download
                </button>
                <button className="df-btn df-btn--sm df-btn--success" onClick={() => handleExport(outfit.file)}>
                  🧍 Export w/ Avatar
                </button>
                <button className="df-btn df-btn--sm df-btn--warning" onClick={() => handleFavorite(outfit.id)}>
                  ⭐
                </button>
                <button className="df-btn df-btn--sm df-btn--ghost" onClick={() => navigate(`/rig?outfit=${encodeURIComponent(outfit.file)}`)}>
                  🦴 Rig
                </button>
                <button className="df-btn df-btn--sm df-btn--danger" onClick={() => handleDelete(outfit.id)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyOutfitsPage;