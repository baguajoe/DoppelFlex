// DrawingPadPage.js — In-app drawing pad with tablet/stylus support
// Draw directly in DoppelFlex → convert to 3D or puppet

import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DrawingPad from '../component/DrawingPad';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const DrawingPadPage = () => {
  const navigate = useNavigate();
  const [exportedFile, setExportedFile]     = useState(null);
  const [exportedPreview, setExportedPreview] = useState(null);
  const [converting, setConverting]         = useState(false);
  const [convertResult, setConvertResult]   = useState(null);
  const [convertType, setConvertType]       = useState('full_body');
  const [status, setStatus]                 = useState('');

  // Called when user clicks Export in DrawingPad
  const handleExport = useCallback((file, dataUrl) => {
    setExportedFile(file);
    setExportedPreview(dataUrl);
    setConvertResult(null);
    setStatus('Drawing exported — choose action below');
  }, []);

  // Convert drawing to 3D
  const handleConvertTo3D = async () => {
    if (!exportedFile) return;
    setConverting(true);
    setStatus('Converting to 3D...');
    const formData = new FormData();
    formData.append('image', exportedFile);
    formData.append('type', convertType);
    formData.append('format', 'glb');
    formData.append('add_back', 'true');
    try {
      const res = await fetch(`${BACKEND}/api/illustration-to-3d`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) { setStatus(`❌ ${data.error}`); return; }
      const modelUrl = `${BACKEND}${data.model_url}`;
      localStorage.setItem('avatar_url', modelUrl);
      setConvertResult({ modelUrl, depthUrl: `${BACKEND}${data.depth_preview_url}`, stats: data.stats });
      setStatus('✅ Converted! Model ready.');
    } catch (err) {
      setStatus(`❌ ${err.message}`);
    } finally {
      setConverting(false);
    }
  };

  // Send to puppet pipeline
  const handleSendToPuppet = () => {
    if (!exportedPreview) return;
    // Store drawing as the illustration for puppet segmentation
    localStorage.setItem('drawing_pad_image', exportedPreview);
    navigate('/illustration-puppet');
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">✏️ Drawing Pad</h2>
        <p className="df-page__subtitle">
          Draw directly in DoppelFlex — supports drawing tablets, Apple Pencil, Surface Pen, and mouse.
          Export to convert to 3D or use as a puppet.
        </p>
      </div>

      <div style={{ display:'flex', gap:'16px', flexWrap:'wrap' }}>
        {/* Left: Drawing Pad */}
        <div style={{ flex:'1 1 600px' }}>
          <DrawingPad onExport={handleExport} width={700} height={550} />
        </div>

        {/* Right: Actions */}
        <div style={{ flex:'0 0 260px', display:'flex', flexDirection:'column', gap:'12px' }}>

          {/* Preview */}
          {exportedPreview && (
            <div className="df-card">
              <div className="df-card__header">
                <h3 className="df-card__title">🖼 Exported Drawing</h3>
              </div>
              <div className="df-card__body">
                <img src={exportedPreview} alt="Drawing export"
                  style={{ width:'100%', borderRadius:'8px', border:'1px solid #2a2a3e' }} />
              </div>
            </div>
          )}

          {/* Convert actions */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🚀 Convert Drawing</h3>
            </div>
            <div className="df-card__body" style={{ display:'flex', flexDirection:'column', gap:'10px' }}>

              <div>
                <label className="df-label">Illustration Type</label>
                <select className="df-select" value={convertType} onChange={e => setConvertType(e.target.value)}>
                  <option value="full_body">Full Body Character</option>
                  <option value="head">Head / Face Portrait</option>
                </select>
              </div>

              <button
                onClick={handleConvertTo3D}
                disabled={!exportedFile || converting}
                className="df-btn df-btn--primary"
              >
                {converting ? '⏳ Converting...' : '🧊 Convert to 3D Model'}
              </button>

              <button
                onClick={handleSendToPuppet}
                disabled={!exportedFile}
                className="df-btn df-btn--ghost"
              >
                🎭 Send to Puppet Builder
              </button>

              {status && (
                <div style={{
                  fontSize:'12px', padding:'8px', borderRadius:'6px',
                  background: status.startsWith('✅') ? '#052e16' : status.startsWith('❌') ? '#1a0a0a' : '#1a1a2e',
                  color: status.startsWith('✅') ? '#4ade80' : status.startsWith('❌') ? '#f87171' : '#aaa',
                }}>
                  {status}
                </div>
              )}
            </div>
          </div>

          {/* Result */}
          {convertResult && (
            <div className="df-card">
              <div className="df-card__header">
                <h3 className="df-card__title">✅ 3D Model Ready</h3>
              </div>
              <div className="df-card__body" style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                <img src={convertResult.depthUrl} alt="Depth map"
                  style={{ width:'100%', borderRadius:'6px', border:'1px solid #1a1a2e' }} />
                <div style={{ fontSize:'11px', color:'#666' }}>
                  {convertResult.stats?.vertices?.toLocaleString()} vertices · {convertResult.stats?.format?.toUpperCase()}
                </div>
                <Link to="/avatar-view" className="df-btn df-btn--primary" style={{ textDecoration:'none', textAlign:'center' }}>
                  🧍 View 3D Model
                </Link>
                <a href={convertResult.modelUrl} download className="df-btn df-btn--ghost" style={{ textAlign:'center' }}>
                  📥 Download GLB
                </a>
                <Link to="/motion" className="df-btn df-btn--ghost" style={{ textDecoration:'none', textAlign:'center' }}>
                  🎥 Use in Motion Capture
                </Link>
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="df-card">
            <div className="df-card__header"><h3 className="df-card__title">🔗 Quick Links</h3></div>
            <div className="df-card__body" style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
              <Link to="/illustration-to-3d" className="df-btn df-btn--ghost" style={{ textDecoration:'none' }}>📁 Upload Existing Drawing</Link>
              <Link to="/illustration-puppet" className="df-btn df-btn--ghost" style={{ textDecoration:'none' }}>🎭 Drawing to Puppet</Link>
              <Link to="/upload" className="df-btn df-btn--ghost" style={{ textDecoration:'none' }}>📸 Upload Selfie Instead</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrawingPadPage;
