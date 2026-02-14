// src/front/js/pages/SignupPage.js
// Restyled: Dark theme centered card, matches LoginPage, redirects to /login on success

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const SignupPage = () => {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');

    if (form.password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setMessage('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${BACKEND}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Signup failed');

      setMessage('✅ Account created! Redirecting to login…');
      setTimeout(() => navigate('/login'), 1200);
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
            Create Account
          </h1>
          <p style={{ color: '#777', fontSize: '13px' }}>Join DoppelFlex — free to start, no credit card required</p>
        </div>

        {/* Card */}
        <div className="df-card">
          <div className="df-card__body" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Username */}
              <div>
                <label className="df-label">Username</label>
                <input
                  className="df-input"
                  name="username"
                  type="text"
                  placeholder="yourname"
                  value={form.username}
                  onChange={handleChange}
                  required
                  autoComplete="username"
                />
              </div>

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
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={handleChange}
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label className="df-label">Confirm Password</label>
                <input
                  className="df-input"
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Submit */}
              <button
                className="df-btn df-btn--primary"
                onClick={handleSubmit}
                disabled={loading || !form.username || !form.email || !form.password || !confirmPassword}
                style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
              >
                {loading ? '⏳ Creating account…' : '🚀 Sign Up'}
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
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#a78bfa', textDecoration: 'none' }}>Log in →</Link>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;