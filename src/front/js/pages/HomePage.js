// src/front/js/pages/HomePage.js
import React, { useContext } from "react";
import { Link } from "react-router-dom";
import { Context } from "../store/appContext";
import "../../styles/HomePage.css";

const HomePage = () => {
  const { store } = useContext(Context);

  return (
    <div className="df-home">
      {/* Hero Section */}
      <section className="df-hero">
        <div className="df-hero-glow" />
        <div className="df-hero-content df-fade-in">
          <span className="df-badge df-badge-accent" style={{ marginBottom: 16 }}>
            ✦ Now with real-time motion capture
          </span>
          <h1 className="df-hero-title">
            Your selfie.
            <br />
            <span className="df-glow-text">Your avatar.</span>
            <br />
            Your moves.
          </h1>
          <p className="df-hero-subtitle">
            Transform any photo into a fully rigged 3D avatar. 
            Capture your motion in real-time. Dance, animate, and export — all in one place.
          </p>
          <div className="df-hero-actions">
            <Link to="/upload" className="df-btn df-btn-primary df-btn-lg">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
              </svg>
              Upload a Selfie
            </Link>
            <Link to="/motion" className="df-btn df-btn-ghost df-btn-lg">
              Try Motion Capture →
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="df-features df-stagger">
        <div className="df-feature-card df-card df-card-glow">
          <div className="df-feature-icon df-feature-icon-create">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.002 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
              <path d="M2.002 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2h-12zm12 1a1 1 0 0 1 1 1v6.5l-3.777-1.947a.5.5 0 0 0-.577.093l-3.71 3.71-2.66-1.772a.5.5 0 0 0-.63.062L1.002 12V3a1 1 0 0 1 1-1h12z"/>
            </svg>
          </div>
          <h3>Selfie to 3D</h3>
          <p>Upload a photo and watch it transform into a detailed 3D mesh with depth estimation, face detection, and Poisson surface reconstruction.</p>
          <Link to="/upload" className="df-feature-link">
            Start creating
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
            </svg>
          </Link>
        </div>

        <div className="df-feature-card df-card df-card-glow">
          <div className="df-feature-icon df-feature-icon-motion">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.251.068a.5.5 0 0 1 .227.58L9.677 6.5H13a.5.5 0 0 1 .364.843l-8 8.5a.5.5 0 0 1-.842-.49L6.323 9.5H3a.5.5 0 0 1-.364-.843l8-8.5a.5.5 0 0 1 .615-.09z"/>
            </svg>
          </div>
          <h3>Real-Time Motion</h3>
          <p>Your webcam becomes a motion capture studio. MediaPipe tracks 33 body landmarks and maps them to your avatar's skeleton in real time.</p>
          <Link to="/motion" className="df-feature-link">
            Open mocap
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
            </svg>
          </Link>
        </div>

        <div className="df-feature-card df-card df-card-glow">
          <div className="df-feature-icon df-feature-icon-dance">
            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 13c0 1.105-1.12 2-2.5 2S1 14.105 1 13c0-1.104 1.12-2 2.5-2s2.5.896 2.5 2zm9-2c0 1.105-1.12 2-2.5 2s-2.5-.895-2.5-2 1.12-2 2.5-2 2.5.895 2.5 2z"/>
              <path fillRule="evenodd" d="M14 11V2h-1v9h1zM6 3v10H5V3h1z"/>
              <path d="M5 2.905a1 1 0 0 1 .9-.995l8-.8a1 1 0 0 1 1.1.995V3L5 4V2.905z"/>
            </svg>
          </div>
          <h3>Dance Sync</h3>
          <p>Sync your avatar's movements to music with beat detection. Record sessions, play them back, and fine-tune timing with the beat editor.</p>
          <Link to="/dance-sync" className="df-feature-link">
            Start dancing
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8z"/>
            </svg>
          </Link>
        </div>
      </section>

      {/* Pipeline Overview */}
      <section className="df-pipeline">
        <h2>How it works</h2>
        <div className="df-stepper" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { num: "1", label: "Upload" },
            { num: "2", label: "Detect" },
            { num: "3", label: "Depth Map" },
            { num: "4", label: "Mesh" },
            { num: "5", label: "Rig" },
            { num: "6", label: "Animate" },
            { num: "7", label: "Export" },
          ].map((step, i, arr) => (
            <React.Fragment key={step.num}>
              <div className="df-step completed">
                <div className="df-step-dot">{step.num}</div>
                <span className="df-step-label">{step.label}</span>
              </div>
              {i < arr.length - 1 && <div className="df-step-line completed" />}
            </React.Fragment>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="df-stats df-stagger">
        {[
          { value: "33", label: "Body landmarks tracked" },
          { value: "7", label: "Pipeline stages" },
          { value: "<100ms", label: "Pose detection latency" },
          { value: "GLB/OBJ", label: "Export formats" },
        ].map((stat) => (
          <div key={stat.label} className="df-stat-card df-card-flat">
            <div className="df-stat-value df-glow-text">{stat.value}</div>
            <div className="df-stat-label">{stat.label}</div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default HomePage;