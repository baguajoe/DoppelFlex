// src/front/js/component/sidebar.js
import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "../../styles/sidebar.css";

const sidebarSections = [
  {
    label: "Create",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"/>
      </svg>
    ),
    links: [
      { to: "/upload", label: "Upload Selfie" },
      { to: "/customize", label: "Customize" },
      { to: "/rig", label: "Rig Avatar" },
      { to: "/avatar-export", label: "Export" },
    ],
  },
  {
    label: "Animate",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
        <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
      </svg>
    ),
    links: [
      { to: "/motion", label: "Live Motion" },
      { to: "/live-avatar", label: "Live Avatar" },
      { to: "/motion-from-video", label: "From Video" },
      { to: "/replay", label: "Replay Session" },
      { to: "/dance-sync", label: "Dance Sync" },
      { to: "/beat-editor", label: "Beat Editor" },
      { to: "/beatmap-editor", label: "BeatMap Editor" },
    ],
  },
  {
    label: "Wardrobe",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M7.21.8C7.69.295 8 0 8 0c.109.363.234.708.371 1.038.812 1.946 2.073 3.35 3.197 4.6C12.878 7.096 14 8.345 14 10a6 6 0 0 1-12 0C2 6.668 5.58 2.517 7.21.8zm.413 1.021A31.25 31.25 0 0 0 5.171 4.91C3.806 6.505 3 8.14 3 10a5 5 0 0 0 10 0c0-1.185-.762-2.218-1.935-3.558C9.88 5.065 8.607 3.64 7.623 1.82z"/>
      </svg>
    ),
    links: [
      { to: "/clothing-match", label: "Clothing Match" },
      { to: "/my-outfits", label: "My Outfits" },
      { to: "/avatar-customization", label: "Style Editor" },
    ],
  },
  {
    label: "Account",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/>
        <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/>
      </svg>
    ),
    links: [
      { to: "/profile", label: "Profile" },
      { to: "/motion-sessions", label: "All Sessions" },
      { to: "/video-upload", label: "Video Upload" },
      { to: "/account-settings", label: "Settings" },
    ],
  },
];

const Sidebar = () => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState(
    // Open the section that contains the current route by default
    sidebarSections.reduce((acc, section) => {
      const isActiveSection = section.links.some(
        (link) => link.to === location.pathname
      );
      acc[section.label] = isActiveSection;
      return acc;
    }, {})
  );

  const toggleSection = (label) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenSections((prev) => ({ ...prev, [label]: true }));
      return;
    }
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path) => location.pathname === path;

  return (
    <aside className={`df-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Collapse Toggle */}
      <button
        className="df-sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`df-sidebar-toggle-icon ${collapsed ? "flipped" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"
          />
        </svg>
      </button>

      {/* Navigation Sections */}
      <nav className="df-sidebar-nav">
        {sidebarSections.map((section) => (
          <div key={section.label} className="df-sidebar-section">
            <button
              className={`df-sidebar-section-header ${
                openSections[section.label] ? "open" : ""
              }`}
              onClick={() => toggleSection(section.label)}
              title={collapsed ? section.label : undefined}
            >
              <span className="df-sidebar-section-icon">{section.icon}</span>
              {!collapsed && (
                <>
                  <span className="df-sidebar-section-label">
                    {section.label}
                  </span>
                  <svg
                    className={`df-sidebar-section-chevron ${
                      openSections[section.label] ? "open" : ""
                    }`}
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                  >
                    <path
                      d="M2.5 4.5l3.5 3.5 3.5-3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </>
              )}
            </button>

            {/* Section Links */}
            {!collapsed && openSections[section.label] && (
              <div className="df-sidebar-links">
                {section.links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`df-sidebar-link ${
                      isActive(link.to) ? "active" : ""
                    }`}
                  >
                    <span className="df-sidebar-link-indicator" />
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      {!collapsed && (
        <div className="df-sidebar-footer">
          <Link to="/stripe-pricing" className="df-sidebar-upgrade">
            <div className="df-sidebar-upgrade-icon">✦</div>
            <div>
              <div className="df-sidebar-upgrade-title">Upgrade Plan</div>
              <div className="df-sidebar-upgrade-desc">
                Unlock all features
              </div>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;