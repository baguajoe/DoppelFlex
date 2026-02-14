// src/front/js/pages/MotionSessionList.js
// FIX: Reads userId from localStorage instead of expecting a prop
// Added: dark theme, delete, replay links, empty state, loading spinner

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const MotionSessionList = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Read userId from localStorage (set at login) or fall back to 1
  const userId = localStorage.getItem('user_id') || '1';

  useEffect(() => {
    setLoading(true);
    fetch(`${BACKEND}/api/motion-sessions/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[MotionSessionList]', err);
        setError('Failed to load sessions.');
        setLoading(false);
      });
  }, [userId]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this session?')) return;
    try {
      const res = await fetch(`${BACKEND}/api/delete-session/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎞️ Motion Sessions</h2>
        <p className="df-page__subtitle">
          All your saved motion capture and dance sessions in one place.
        </p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Link to="/motion" className="df-btn df-btn--primary" style={{ textDecoration: 'none' }}>
          🎥 New Live Capture
        </Link>
        <Link to="/motion-from-video" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          📹 From Video
        </Link>
        <Link to="/dance-sync" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
          💃 Dance Sync
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <div className="df-card">
          <div className="df-card__body" style={{ textAlign: 'center', padding: '40px' }}>
            <div className="df-spinner" />
            <p style={{ color: '#888', marginTop: '12px' }}>Loading sessions…</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="df-card">
          <div className="df-card__body">
            <div className="df-status df-status--error">{error}</div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && sessions.length === 0 && (
        <div className="df-card">
          <div className="df-card__body" style={{ textAlign: 'center', padding: '48px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
            <h3 style={{ color: '#ccc', marginBottom: '8px' }}>No sessions yet</h3>
            <p style={{ color: '#777', fontSize: '13px' }}>
              Start a live motion capture or upload a video to create your first session.
            </p>
          </div>
        </div>
      )}

      {/* Session List */}
      {!loading && sessions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
          {sessions.map((s) => (
            <div key={s.id} className="df-card" style={{ position: 'relative' }}>
              <div className="df-card__header">
                <h3 className="df-card__title" style={{ fontSize: '14px' }}>
                  {s.name || `Session #${s.id}`}
                </h3>
                <span className={`df-card__badge ${s.source_type === 'live_webcam' ? 'df-card__badge--green' : 'df-card__badge--purple'}`}>
                  {s.source_type === 'live_webcam' ? '🟢 Live' : s.source_type === 'recorded' ? '🎬 Recorded' : s.source_type || 'Session'}
                </span>
              </div>
              <div className="df-card__body">
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                  {s.created_at && (
                    <span>📅 {new Date(s.created_at).toLocaleString()}</span>
                  )}
                  {s.avatar_id && (
                    <span style={{ marginLeft: '12px' }}>🧍 Avatar #{s.avatar_id}</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Link
                    to={`/replay-session/${s.id}`}
                    className="df-btn df-btn--primary"
                    style={{ textDecoration: 'none', fontSize: '12px', padding: '6px 12px' }}
                  >
                    ▶ Replay
                  </Link>

                  {s.pose_data_url && (
                    <a
                      href={`${BACKEND}${s.pose_data_url}`}
                      download
                      className="df-btn df-btn--ghost"
                      style={{ fontSize: '12px', padding: '6px 12px' }}
                    >
                      ⬇ JSON
                    </a>
                  )}

                  <button
                    className="df-btn df-btn--danger"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => handleDelete(s.id)}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MotionSessionList;