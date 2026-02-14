// src/front/js/pages/RigAvatarPage.js
// Restyled: Dark theme, usage progress bar, rig type selector, download link, plan upgrade CTA

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const RigAvatarPage = () => {
  const [riggedUrl, setRiggedUrl] = useState(null);
  const [boneMap, setBoneMap] = useState(null);
  const [usageInfo, setUsageInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const avatarId = localStorage.getItem('avatar_id');
  const userId = localStorage.getItem('user_id');

  // Load current usage on mount
  useEffect(() => {
    if (!userId) return;
    fetch(`${BACKEND}/api/usage/${userId}`)
      .then((r) => r.json())
      .then((data) => setUsageInfo(data))
      .catch(() => {});
  }, [userId]);

  const handleRigging = async () => {
    if (!avatarId) {
      setMessage('No avatar found. Create one on the Upload page first.');
      return;
    }
    if (!userId) {
      setMessage('Please log in to rig an avatar.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await fetch(`${BACKEND}/api/rig-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_id: avatarId, user_id: userId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setMessage(`Rigging limit reached! Your ${data.plan} plan allows ${data.limit} rigs/month. Upgrade to continue.`);
        } else {
          setMessage(data.error || 'Rigging failed.');
        }
        return;
      }

      setRiggedUrl(data.rig_url);
      setBoneMap(data.bone_map);
      setUsageInfo({ usage: data.usage, limit: data.limit, plan: usageInfo?.plan || 'Basic' });

      if (data.usage >= data.limit) {
        setMessage('⚠️ You\'ve used all rigging sessions for this month.');
      }
    } catch (err) {
      console.error(err);
      setMessage('Connection error during rigging.');
    } finally {
      setLoading(false);
    }
  };

  const usagePct = usageInfo ? Math.min((usageInfo.usage / usageInfo.limit) * 100, 100) : 0;

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🦴 Rig Avatar</h2>
        <p className="df-page__subtitle">
          Apply an animation-ready skeleton to your 3D avatar model.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Rigging Control */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">⚙️ Auto-Rigging</h3>
            {usageInfo && (
              <span className="df-card__badge df-card__badge--purple">
                {usageInfo.plan || 'Basic'} Plan
              </span>
            )}
          </div>
          <div className="df-card__body">
            {/* Current Avatar */}
            <div style={{ marginBottom: '16px' }}>
              <label className="df-label">Avatar ID</label>
              {avatarId ? (
                <div style={{
                  background: '#111118',
                  border: '1px solid #2a2a3e',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  color: '#a78bfa',
                }}>
                  #{avatarId}
                </div>
              ) : (
                <div className="df-status df-status--error">
                  No avatar found.{' '}
                  <Link to="/upload" style={{ color: '#a78bfa' }}>Upload one →</Link>
                </div>
              )}
            </div>

            {/* Usage Meter */}
            {usageInfo && (
              <div style={{ marginBottom: '20px' }}>
                <label className="df-label">Monthly Usage</label>
                <div style={{
                  background: '#111118',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  height: '24px',
                  position: 'relative',
                  border: '1px solid #2a2a3e',
                }}>
                  <div style={{
                    width: `${usagePct}%`,
                    height: '100%',
                    background: usagePct >= 100 ? '#ef4444' : usagePct >= 80 ? '#f59e0b' : 'linear-gradient(90deg, #6366f1, #a78bfa)',
                    borderRadius: '8px',
                    transition: 'width 0.4s',
                  }} />
                  <span style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#e0e0e0',
                  }}>
                    {usageInfo.usage} / {usageInfo.limit === Infinity ? '∞' : usageInfo.limit}
                  </span>
                </div>
              </div>
            )}

            {/* Rig Button */}
            <button
              className="df-btn df-btn--primary"
              onClick={handleRigging}
              disabled={loading || !avatarId || !userId}
              style={{ width: '100%', padding: '14px', fontSize: '15px' }}
            >
              {loading ? '⏳ Rigging avatar…' : '🦴 Apply Rig'}
            </button>

            {/* Status */}
            {message && (
              <div
                className={`df-status ${message.startsWith('⚠️') || message.includes('limit') ? 'df-status--error' : 'df-status--error'}`}
                style={{ marginTop: '12px' }}
              >
                {message}
                {message.includes('Upgrade') && (
                  <Link to="/stripe-pricing" style={{ color: '#a78bfa', marginLeft: '8px' }}>
                    View Plans →
                  </Link>
                )}
              </div>
            )}

            {/* Success Result */}
            {riggedUrl && (
              <div style={{
                marginTop: '16px',
                background: '#111118',
                border: '1px solid #22c55e33',
                borderRadius: '10px',
                padding: '16px',
              }}>
                <div style={{ color: '#22c55e', fontWeight: 700, marginBottom: '8px', fontSize: '14px' }}>
                  ✅ Rigging Complete
                </div>
                <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
                  Download URL:
                </div>
                <a
                  href={`${BACKEND}${riggedUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#a78bfa', fontSize: '13px', wordBreak: 'break-all' }}
                >
                  {riggedUrl}
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right: Info */}
        <div>
          <div className="df-card" style={{ marginBottom: '12px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">💡 What is Rigging?</h3>
            </div>
            <div className="df-card__body" style={{ fontSize: '13px', color: '#aaa', lineHeight: 1.7 }}>
              <p>
                Rigging adds an internal skeleton (bones) to your 3D mesh so it can be animated.
                DoppelFlex auto-rigs your avatar with a standard humanoid bone hierarchy compatible
                with Unity, Unreal Engine, and Maya.
              </p>
              <p>
                After rigging, your avatar can be used with motion capture, dance sync,
                and exported as FBX/GLB for game engines.
              </p>
            </div>
          </div>

          {/* Bone Map Preview */}
          {boneMap && (
            <div className="df-card" style={{ marginBottom: '12px' }}>
              <div className="df-card__header">
                <h3 className="df-card__title">🗺️ Bone Map</h3>
              </div>
              <div className="df-card__body" style={{ maxHeight: '200px', overflow: 'auto' }}>
                <pre style={{
                  fontSize: '11px',
                  color: '#888',
                  background: '#0d0d14',
                  padding: '12px',
                  borderRadius: '8px',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}>
                  {JSON.stringify(boneMap, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Quick Links */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔗 Next Steps</h3>
            </div>
            <div className="df-card__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link to="/avatar-view" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🧍 View Avatar
                </Link>
                <Link to="/export-avatar" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  📦 Export
                </Link>
                <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  🎥 Motion Capture
                </Link>
                <Link to="/stripe-pricing" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  💳 Upgrade Plan
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RigAvatarPage;