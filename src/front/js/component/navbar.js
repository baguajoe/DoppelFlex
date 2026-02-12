// src/front/js/component/navbar.js
import React, { useState, useContext, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Context } from "../store/appContext";
import "../../styles/navbar.css";

const Navbar = () => {
  const [authStatus, setAuthStatus] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { store, actions } = useContext(Context);
  const location = useLocation();
  const userMenuRef = useRef(null);

  useEffect(() => {
    const authUpdate = async () => {
      setAuthStatus(await actions.authenticate());
    };
    authUpdate();
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="df-navbar">
      {/* Gradient line at top */}
      <div className="df-navbar-accent-line" />

      <div className="df-navbar-inner">
        {/* Brand */}
        <Link to="/" className="df-navbar-brand">
          <div className="df-navbar-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="2" width="24" height="24" rx="6" 
                stroke="url(#logo-grad)" strokeWidth="2.5" fill="none" />
              <circle cx="14" cy="11" r="4" fill="url(#logo-grad)" />
              <path d="M8 22c0-3.3 2.7-6 6-6s6 2.7 6 6" 
                stroke="url(#logo-grad)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#7c6aef" />
                  <stop offset="1" stopColor="#00e5c3" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="df-navbar-brand-text">
            Doppel<span className="df-navbar-brand-highlight">Flex</span>
          </span>
        </Link>

        {/* Primary Nav Links */}
        <div className={`df-navbar-links ${mobileMenuOpen ? "open" : ""}`}>
          <Link 
            to="/upload" 
            className={`df-navbar-link ${isActive("/upload") ? "active" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 1z"/>
            </svg>
            Create Avatar
          </Link>
          <Link 
            to="/motion" 
            className={`df-navbar-link ${isActive("/motion") ? "active" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.5 6.027a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-1.5 1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm2.5-.5a.5.5 0 1 1-1 0 .5.5 0 0 1 1 0zm-1.5 1.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1zm-6.5-3h1v1h-1v-1zm2 0h1v1h-1v-1zm2 0h1v1h-1v-1zM4.5 3a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-7zM2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9z"/>
            </svg>
            Motion Capture
          </Link>
          <Link 
            to="/dance-sync" 
            className={`df-navbar-link ${isActive("/dance-sync") ? "active" : ""}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13c0-1.104 1.12-2 2.5-2s2.5.896 2.5 2zm9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2z"/>
              <path fillRule="evenodd" d="M14 11V2h-1v9h1zM6 3v10H5V3h1z"/>
              <path d="M5 2.905a1 1 0 0 1 .9-.995l8-.8a1 1 0 0 1 1.1.995V3L5 4V2.905z"/>
            </svg>
            Dance Sync
          </Link>
          <Link 
            to="/stripe-pricing" 
            className={`df-navbar-link ${isActive("/stripe-pricing") ? "active" : ""}`}
          >
            Pricing
          </Link>
        </div>

        {/* Right Side */}
        <div className="df-navbar-right">
          {authStatus ? (
            <div className="df-navbar-user" ref={userMenuRef}>
              <button 
                className="df-navbar-avatar-btn"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="df-navbar-avatar">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/>
                  </svg>
                </div>
                <svg className={`df-navbar-chevron ${userMenuOpen ? "open" : ""}`} 
                  width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" 
                    strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              </button>

              {/* User Dropdown */}
              {userMenuOpen && (
                <div className="df-navbar-dropdown">
                  <Link to="/profile" className="df-navbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4z"/>
                    </svg>
                    Profile
                  </Link>
                  <Link to="/motion-sessions" className="df-navbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
                    </svg>
                    My Sessions
                  </Link>
                  <Link to="/account-settings" className="df-navbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
                      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319z"/>
                    </svg>
                    Settings
                  </Link>
                  <div className="df-navbar-dropdown-divider" />
                  <button className="df-navbar-dropdown-item df-navbar-dropdown-logout"
                    onClick={() => actions.logout()}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path fillRule="evenodd" d="M10 12.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 .5.5v2a.5.5 0 0 0 1 0v-2A1.5 1.5 0 0 0 9.5 2h-8A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h8a1.5 1.5 0 0 0 1.5-1.5v-2a.5.5 0 0 0-1 0v2z"/>
                      <path fillRule="evenodd" d="M15.854 8.354a.5.5 0 0 0 0-.708l-3-3a.5.5 0 0 0-.708.708L14.293 7.5H5.5a.5.5 0 0 0 0 1h8.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3z"/>
                    </svg>
                    Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="df-navbar-auth">
              <Link to="/login" className="df-btn df-btn-ghost df-btn-sm">
                Log In
              </Link>
              <Link to="/signup" className="df-btn df-btn-primary df-btn-sm">
                Sign Up
              </Link>
            </div>
          )}

          {/* Mobile hamburger */}
          <button 
            className="df-navbar-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`df-hamburger-bar ${mobileMenuOpen ? "open" : ""}`} />
            <span className={`df-hamburger-bar ${mobileMenuOpen ? "open" : ""}`} />
            <span className={`df-hamburger-bar ${mobileMenuOpen ? "open" : ""}`} />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;