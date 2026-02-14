// src/front/js/pages/ProfilePage.js
// Restyled: Dark theme, reads userId from localStorage, session gallery, quick links

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const ProfilePage = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const userId = localStorage.getItem('user_id') || '1';
  const username = localStorage.getItem('username') || 'Creator';

  useEffect(() => {
    setLoading(true);
    fetch(`${BACKEND}/api/get-user-sessions/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        setSessions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[ProfilePage]', err);
        setLoading(false);
      });
  }, [userId]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this session?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/delete-session/${id}`, { method: 'DELETE' });
      if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleReplay = (session) => {
    localStorage.setItem('replay_session', JSON.stringify(session));
  };

  const filtered = sessions.filter((s) =>
    (s.name || `Session #${s.id}`).toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="df-page">
      {/* Profile Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0d0d14 0%, #1a1a2e 100%)',
        borderRadius: '16px',
        border: '1px solid #2a2a3e',
        padding: '32px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
      }}>
        {/* Avatar circle */}
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '28px',
          fontWeight: 800,
          color: '#fff',
          flexShrink: 0,
        }}>
          {username.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: '#e0e0e0', margin: '0 0 4px', fontSize: '1.4rem' }}>
            {username}
          </h2>
          <p style={{ color: '#777', fontSize: '13px', margin: 0 }}>
            {sessions.length} saved session{sessions.length !== 1 ? 's' : ''} · User #{userId}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/account-settings" className="df-btn df-btn--ghost" style={{ textDecoration: 'none', fontSize: '13px' }}>
            ⚙️ Settings
          </Link>
          <Link to="/avatar-customization" className="df-btn df-btn--ghost" style={{ textDecoration: 'none', fontSize: '13px' }}>
            🎨 Customize Avatar
          </Link>
          <Link to="/my-outfits" className="df-btn df-btn--ghost" style={{ textDecoration: 'none', fontSize: '13px' }}>
            👕 My Outfits
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Link to="/upload" className="df-btn df-btn--primary" style={{ textDecoration: 'none' }}>📸 New Avatar</Link>
        <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>🎥 Motion Capture</Link>
        <Link to="/dance-sync" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>💃 Dance Sync</Link>
        <Link to="/export-avatar" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>📦 Export</Link>
        <Link to="/stripe-pricing" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>💳 Plans</Link>
      </div>

      {/* Sessions */}
      <div className="df-card">
        <div className="df-card__header">
          <h3 className="df-card__title">🎞️ Saved Sessions</h3>
          <span className="df-card__badge df-card__badge--green">{sessions.length}</span>
        </div>
        <div className="df-card__body">
          {/* Filter */}
          {sessions.length > 3 && (
            <input
              className="df-input"
              placeholder="Filter sessions by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ marginBottom: '14px' }}
            />
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '32px' }}>
              <div className="df-spinner" />
              <p style={{ color: '#888', marginTop: '10px', fontSize: '13px' }}>Loading sessions…</p>
            </div>
          )}

          {/* Empty */}
          {!loading && sessions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎬</div>
              <p style={{ color: '#888', fontSize: '13px' }}>No sessions yet. Start a motion capture to see them here.</p>
            </div>
          )}

          {/* Session Grid */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
              {filtered.map((s) => (
                <div
                  key={s.id}
                  style={{
                    background: '#111118',
                    border: '1px solid #2a2a3e',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '13px' }}>
                      {s.name || `Session #${s.id}`}
                    </span>
                    <span style={{ fontSize: '10px', color: '#666' }}>
                      #{s.id}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: '#777', marginBottom: '10px' }}>
                    {s.created_at && `📅 ${new Date(s.created_at).toLocaleString()}`}
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <Link
                      to={`/replay-session/${s.id}`}
                      className="df-btn df-btn--primary"
                      style={{ textDecoration: 'none', fontSize: '11px', padding: '5px 10px' }}
                      onClick={() => handleReplay(s)}
                    >
                      ▶ Replay
                    </Link>
                    <button
                      className="df-btn df-btn--danger"
                      style={{ fontSize: '11px', padding: '5px 10px' }}
                      onClick={() => handleDelete(s.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No filter matches */}
          {!loading && sessions.length > 0 && filtered.length === 0 && (
            <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
              No sessions match "{filter}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;