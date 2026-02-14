// src/front/js/pages/AccountSettingsPage.js
// Restyled: Dark theme, fixed env var, JWT auth headers, plan display

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const AccountSettingsPage = () => {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [plan, setPlan] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem('token');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ── Load account info on mount ──
  useEffect(() => {
    if (!token) {
      setMessage({ text: 'Please log in to view account settings.', type: 'error' });
      setLoading(false);
      return;
    }

    const loadInfo = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/account-info`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setEmail(data.email || '');
          setUsername(data.username || '');
          setPlan(data.plan || 'Basic');
        } else {
          setMessage({ text: 'Failed to load account info.', type: 'error' });
        }
      } catch (err) {
        console.error(err);
        setMessage({ text: 'Network error loading account info.', type: 'error' });
      }
      setLoading(false);
    };

    loadInfo();
  }, [token]);

  // ── Email update ──
  const handleEmailChange = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    try {
      const res = await fetch(`${BACKEND}/api/update-email`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setMessage({
        text: res.ok ? '✅ Email updated successfully.' : `❌ ${data.error || 'Failed to update email.'}`,
        type: res.ok ? 'success' : 'error',
      });
    } catch (err) {
      setMessage({ text: '❌ Network error.', type: 'error' });
    }
  };

  // ── Password update ──
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });

    if (newPassword.length < 6) {
      setMessage({ text: '❌ Password must be at least 6 characters.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: '❌ Passwords do not match.', type: 'error' });
      return;
    }

    try {
      const res = await fetch(`${BACKEND}/api/update-password`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ current_password: password, new_password: newPassword }),
      });
      const data = await res.json();
      setMessage({
        text: res.ok ? '✅ Password updated successfully.' : `❌ ${data.error || 'Failed to update password.'}`,
        type: res.ok ? 'success' : 'error',
      });
      if (res.ok) {
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setMessage({ text: '❌ Network error.', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="df-page" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div className="df-spinner" />
        <p style={{ color: '#888', marginTop: '12px' }}>Loading account settings...</p>
      </div>
    );
  }

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">⚙️ Account Settings</h2>
        <p className="df-page__subtitle">Manage your email, password, and subscription plan.</p>
      </div>

      {/* Status Message */}
      {message.text && (
        <div className={`df-status df-status--${message.type}`} style={{ marginBottom: '16px' }}>
          {message.text}
        </div>
      )}

      <div className="df-grid-2">
        {/* Left Column: Email + Password */}
        <div>
          {/* Email Card */}
          <div className="df-card" style={{ marginBottom: '16px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">📧 Email</h3>
            </div>
            <div className="df-card__body">
              <form onSubmit={handleEmailChange}>
                <label className="df-label">Email Address</label>
                <input
                  type="email"
                  className="df-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button type="submit" className="df-btn df-btn--primary" style={{ marginTop: '12px' }}>
                  Update Email
                </button>
              </form>
            </div>
          </div>

          {/* Password Card */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔒 Change Password</h3>
            </div>
            <div className="df-card__body">
              <form onSubmit={handlePasswordChange}>
                <label className="df-label">Current Password</label>
                <input
                  type="password"
                  className="df-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <label className="df-label" style={{ marginTop: '10px' }}>New Password</label>
                <input
                  type="password"
                  className="df-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />

                <label className="df-label" style={{ marginTop: '10px' }}>Confirm New Password</label>
                <input
                  type="password"
                  className="df-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />

                <button type="submit" className="df-btn df-btn--primary" style={{ marginTop: '12px' }}>
                  Update Password
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Right Column: Account Info + Quick Links */}
        <div>
          {/* Account Info */}
          <div className="df-card" style={{ marginBottom: '16px' }}>
            <div className="df-card__header">
              <h3 className="df-card__title">👤 Account Info</h3>
            </div>
            <div className="df-card__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a2e' }}>
                  <span style={{ color: '#888' }}>Username</span>
                  <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{username}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a2e' }}>
                  <span style={{ color: '#888' }}>Email</span>
                  <span style={{ color: '#e0e0e0' }}>{email}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a2e' }}>
                  <span style={{ color: '#888' }}>Plan</span>
                  <span className="df-card__badge">{plan}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ color: '#888' }}>User ID</span>
                  <span style={{ color: '#666', fontSize: '11px' }}>{localStorage.getItem('user_id')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔗 Quick Links</h3>
            </div>
            <div className="df-card__body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link to="/stripe-pricing" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  💳 Upgrade Plan
                </Link>
                <Link to="/my-outfits" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  👕 My Outfits
                </Link>
                <Link to="/profile" className="df-btn df-btn--ghost" style={{ textDecoration: 'none' }}>
                  👤 Profile
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettingsPage;