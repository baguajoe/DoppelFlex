// src/front/js/pages/LoginPage.js
// Restyled: Dark theme centered card, sets localStorage properly, redirects on success

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const LoginPage = () => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch(`${BACKEND}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Login failed');

      // Store auth data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('username', data.username || '');

      setMessage('✅ Login successful! Redirecting…');
      setTimeout(() => navigate('/'), 800);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="df-page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '40px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #a78bfa, #6366f1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '6px',
          }}>
            Welcome Back
          </h1>
          <p style={{ color: '#777', fontSize: '13px' }}>Log in to your DoppelFlex account</p>
        </div>

        {/* Card */}
        <div className="df-card">
          <div className="df-card__body" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Email */}
              <div>
                <label className="df-label">Email</label>
                <input
                  className="df-input"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div>
                <label className="df-label">Password</label>
                <input
                  className="df-input"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                  autoComplete="current-password"
                />
              </div>

              {/* Submit */}
              <button
                className="df-btn df-btn--primary"
                onClick={handleSubmit}
                disabled={loading || !form.email || !form.password}
                style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
              >
                {loading ? '⏳ Logging in…' : '🔑 Log In'}
              </button>

              {/* Message */}
              {message && (
                <div className={`df-status ${message.startsWith('✅') ? 'df-status--success' : 'df-status--error'}`}>
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '13px', color: '#777' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#a78bfa', textDecoration: 'none' }}>Sign up →</Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;