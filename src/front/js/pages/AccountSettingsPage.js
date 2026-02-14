// src/front/js/pages/AccountSettingsPage.js
// Fixed: REACT_APP_BACKEND_URL, dark theme, proper layout

import React, { useState, useEffect, useContext } from 'react';
import { Context } from '../store/appContext';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const AccountSettingsPage = () => {
  const { store } = useContext(Context);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [cardInfo, setCardInfo] = useState('');

  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/account-info`, {
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        });
        const data = await res.json();
        if (res.ok) setEmail(data.email);
      } catch {
        // Backend not reachable — skip
      }
    };
    loadUserInfo();
  }, []);

  const handleEmailChange = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND}/api/update-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('token'),
        },
        body: JSON.stringify({ email }),
      });
      setMessage(res.ok ? '✅ Email updated' : '❌ Failed to update email');
    } catch {
      setMessage('⚠️ Backend not reachable');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage('❌ Passwords do not match');
      return;
    }
    try {
      const res = await fetch(`${BACKEND}/api/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('token'),
        },
        body: JSON.stringify({ current_password: password, new_password: newPassword }),
      });
      setMessage(res.ok ? '✅ Password updated' : '❌ Failed to update password');
    } catch {
      setMessage('⚠️ Backend not reachable');
    }
  };

  const handleCardSave = (e) => {
    e.preventDefault();
    setMessage('💳 Card info saved (placeholder — integrate Stripe)');
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">⚙️ Account Settings</h2>
        <p className="df-page__subtitle">Update your email, password, and payment information.</p>
      </div>

      <div className="df-grid-2">
        {/* Email */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">📧 Email</h3>
          </div>
          <div className="df-card__body">
            <form onSubmit={handleEmailChange}>
              <div className="df-form-group" style={{ marginBottom: '12px' }}>
                <label className="df-label">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="df-input"
                  placeholder="your@email.com"
                />
              </div>
              <button type="submit" className="df-btn df-btn--primary">Update Email</button>
            </form>
          </div>
        </div>

        {/* Password */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">🔒 Password</h3>
          </div>
          <div className="df-card__body">
            <form onSubmit={handlePasswordChange}>
              <div className="df-form-group" style={{ marginBottom: '12px' }}>
                <label className="df-label">Current Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="df-input"
                />
              </div>
              <div className="df-form-group" style={{ marginBottom: '12px' }}>
                <label className="df-label">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="df-input"
                />
              </div>
              <div className="df-form-group" style={{ marginBottom: '12px' }}>
                <label className="df-label">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="df-input"
                />
              </div>
              <button type="submit" className="df-btn df-btn--warning">Update Password</button>
            </form>
          </div>
        </div>

        {/* Payment */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">💳 Payment</h3>
            <span className="df-card__badge df-card__badge--purple">Placeholder</span>
          </div>
          <div className="df-card__body">
            <form onSubmit={handleCardSave}>
              <div className="df-form-group" style={{ marginBottom: '12px' }}>
                <label className="df-label">Card Info</label>
                <input
                  type="text"
                  value={cardInfo}
                  onChange={(e) => setCardInfo(e.target.value)}
                  className="df-input"
                  placeholder="Integrate with Stripe checkout"
                />
              </div>
              <button type="submit" className="df-btn df-btn--ghost">Save Card Info</button>
            </form>
          </div>
        </div>

        {/* Plan Info */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">📋 Subscription</h3>
          </div>
          <div className="df-card__body">
            <p style={{ color: '#888', fontSize: '13px' }}>
              Current Plan: <strong style={{ color: '#a78bfa' }}>{store?.user?.subscription_plan || 'Basic'}</strong>
            </p>
            <a href="/stripe-pricing" className="df-btn df-btn--primary df-btn--sm" style={{ textDecoration: 'none' }}>
              ✦ Upgrade Plan
            </a>
          </div>
        </div>
      </div>

      {message && (
        <div className={`df-status ${message.startsWith('✅') ? 'df-status--success' : message.startsWith('💳') ? 'df-status--info' : 'df-status--error'}`}
          style={{ marginTop: '20px' }}
        >
          {message}
        </div>
      )}
    </div>
  );
};

export default AccountSettingsPage;