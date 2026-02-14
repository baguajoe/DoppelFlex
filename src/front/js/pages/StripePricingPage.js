// src/front/js/pages/StripePricingPage.js
// Restyled: Dark theme pricing cards, feature lists, highlighted recommended plan, fixed API path

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const PLANS = [
  {
    name: 'Basic',
    price: 9.99,
    limit: 5,
    badge: null,
    color: '#6366f1',
    features: [
      '5 avatar rigs / month',
      'Live webcam motion capture',
      'Video pose extraction',
      'GLB export',
      'Community support',
    ],
  },
  {
    name: 'Pro',
    price: 19.99,
    limit: 20,
    badge: 'Most Popular',
    color: '#a78bfa',
    features: [
      '20 avatar rigs / month',
      'Everything in Basic',
      'Dance sync with beat detection',
      'FBX + GLB + OBJ export',
      'Priority support',
      'Custom outfit matching',
    ],
  },
  {
    name: 'Premium',
    price: 29.99,
    limit: Infinity,
    badge: 'Unlimited',
    color: '#f59e0b',
    features: [
      'Unlimited avatar rigs',
      'Everything in Pro',
      'Multi-camera support (coming)',
      'API access (coming)',
      'White-label export',
      'Dedicated support',
    ],
  },
];

const StripePricingPage = () => {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const userId = localStorage.getItem('user_id');

  const handleSubscribe = async (planName) => {
    if (!userId) {
      setError('Please log in first to subscribe.');
      return;
    }

    setLoading(planName);
    setError('');

    try {
      const res = await fetch(`${BACKEND}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planName, user_id: userId }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Checkout failed');

      // Redirect to Stripe checkout
      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header" style={{ textAlign: 'center' }}>
        <h2 className="df-page__title">💳 Choose Your Plan</h2>
        <p className="df-page__subtitle">
          Start free, upgrade when you need more rigs and features.
        </p>
      </div>

      {error && (
        <div className="df-status df-status--error" style={{ maxWidth: '500px', margin: '0 auto 20px' }}>
          {error}
          {error.includes('log in') && (
            <Link to="/login" style={{ color: '#a78bfa', marginLeft: '8px' }}>Log in →</Link>
          )}
        </div>
      )}

      {/* Pricing Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        maxWidth: '960px',
        margin: '0 auto',
      }}>
        {PLANS.map((plan) => {
          const isPopular = plan.badge === 'Most Popular';
          return (
            <div
              key={plan.name}
              className="df-card"
              style={{
                border: isPopular ? `2px solid ${plan.color}` : '1px solid #2a2a3e',
                position: 'relative',
                overflow: 'visible',
              }}
            >
              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: 'absolute',
                  top: '-12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: plan.color,
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 14px',
                  borderRadius: '12px',
                  whiteSpace: 'nowrap',
                }}>
                  {plan.badge}
                </div>
              )}

              <div className="df-card__body" style={{ padding: '28px', textAlign: 'center' }}>
                {/* Plan Name */}
                <h3 style={{ color: plan.color, fontSize: '1.3rem', fontWeight: 800, marginBottom: '4px' }}>
                  {plan.name}
                </h3>

                {/* Price */}
                <div style={{ marginBottom: '20px' }}>
                  <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#e0e0e0' }}>
                    ${plan.price}
                  </span>
                  <span style={{ color: '#777', fontSize: '14px' }}> / month</span>
                </div>

                {/* Limit */}
                <div style={{
                  background: '#111118',
                  border: '1px solid #2a2a3e',
                  borderRadius: '8px',
                  padding: '8px',
                  fontSize: '13px',
                  color: '#aaa',
                  marginBottom: '20px',
                }}>
                  {plan.limit === Infinity ? '♾️ Unlimited rigs' : `${plan.limit} rigs / month`}
                </div>

                {/* Features */}
                <div style={{ textAlign: 'left', marginBottom: '24px' }}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '5px 0',
                      fontSize: '13px',
                      color: '#bbb',
                      borderBottom: i < plan.features.length - 1 ? '1px solid #1a1a2e' : 'none',
                    }}>
                      <span style={{ color: plan.color, flexShrink: 0 }}>✓</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                {/* Subscribe Button */}
                <button
                  className={`df-btn ${isPopular ? 'df-btn--primary' : 'df-btn--ghost'}`}
                  onClick={() => handleSubscribe(plan.name)}
                  disabled={loading === plan.name}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '14px',
                    ...(isPopular ? {} : { borderColor: plan.color, color: plan.color }),
                  }}
                >
                  {loading === plan.name ? '⏳ Redirecting…' : `Subscribe to ${plan.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Note */}
      <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#555' }}>
        All plans include a 7-day free trial. Cancel anytime. Powered by Stripe.
      </div>
    </div>
  );
};

export default StripePricingPage;