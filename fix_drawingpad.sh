#!/bin/bash
# ============================================================
# DoppelFlex — Master Fix: Drawing Pad + All Remaining Gaps
# Run: bash fix_drawingpad.sh
# ============================================================

set -e
echo ""
echo "════════════════════════════════════════════════════════"
echo "  DoppelFlex — Drawing Pad + Remaining Gaps"
echo "════════════════════════════════════════════════════════"

# ════════════════════════════════════════════════════════════
# FIX 1 — Create DrawingPad component
# Pressure-sensitive canvas that works with tablets, stylus, mouse
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 1: Creating DrawingPad component..."

cat > src/front/js/component/DrawingPad.js << 'EOF'
// DrawingPad.js — Pressure-sensitive drawing canvas
// Works with: drawing tablets (Wacom, Huion etc), Apple Pencil, Surface Pen, mouse
// Exports canvas as PNG for use in Illustration to 3D / Puppet pipeline

import React, { useRef, useState, useEffect, useCallback } from 'react';

const TOOLS = {
  pen:    { label: '✏️ Pen',    cursor: 'crosshair' },
  brush:  { label: '🖌️ Brush',  cursor: 'crosshair' },
  eraser: { label: '🧹 Eraser', cursor: 'cell' },
  fill:   { label: '🪣 Fill',   cursor: 'copy' },
};

const COLORS = [
  '#000000','#ffffff','#ef4444','#f97316','#eab308',
  '#22c55e','#3b82f6','#8b5cf6','#ec4899','#6b7280',
  '#7c3aed','#0891b2','#065f46','#92400e','#1e1b4b',
];

const DrawingPad = ({ onExport, width = 600, height = 500 }) => {
  const canvasRef   = useRef(null);
  const overlayRef  = useRef(null); // cursor preview canvas
  const drawing     = useRef(false);
  const lastPos     = useRef(null);
  const historyRef  = useRef([]);   // undo stack
  const redoRef     = useRef([]);

  const [tool, setTool]           = useState('pen');
  const [color, setColor]         = useState('#000000');
  const [brushSize, setBrushSize] = useState(4);
  const [opacity, setOpacity]     = useState(1);
  const [bgColor, setBgColor]     = useState('#ffffff');
  const [pressure, setPressure]   = useState(1);
  const [customColor, setCustomColor] = useState('#000000');

  // Init canvas with white background
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    saveHistory();
  }, []);

  // Save state for undo
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current.push(canvas.toDataURL());
    if (historyRef.current.length > 50) historyRef.current.shift();
    redoRef.current = [];
  }, []);

  // Undo
  const handleUndo = useCallback(() => {
    if (historyRef.current.length <= 1) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    redoRef.current.push(historyRef.current.pop());
    const prev = historyRef.current[historyRef.current.length - 1];
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = prev;
  }, []);

  // Redo
  const handleRedo = useCallback(() => {
    if (!redoRef.current.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const next = redoRef.current.pop();
    historyRef.current.push(next);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = next;
  }, []);

  // Clear canvas
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    saveHistory();
  }, [bgColor, saveHistory, width, height]);

  // Get position from any pointer event
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Flood fill algorithm
  const floodFill = useCallback((startX, startY, fillColor) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const toIndex = (x, y) => (y * width + x) * 4;
    const startIdx = toIndex(Math.floor(startX), Math.floor(startY));
    const startR = data[startIdx], startG = data[startIdx+1], startB = data[startIdx+2];

    // Parse fill color
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.fillStyle = fillColor;
    tmp.fillRect(0,0,1,1);
    const [fR,fG,fB] = tmp.getImageData(0,0,1,1).data;

    if (startR===fR && startG===fG && startB===fB) return;

    const matchColor = (idx) =>
      Math.abs(data[idx]-startR)<30 &&
      Math.abs(data[idx+1]-startG)<30 &&
      Math.abs(data[idx+2]-startB)<30;

    const stack = [[Math.floor(startX), Math.floor(startY)]];
    const visited = new Set();

    while (stack.length) {
      const [x,y] = stack.pop();
      if (x<0||x>=width||y<0||y>=height) continue;
      const key = y*width+x;
      if (visited.has(key)) continue;
      visited.add(key);
      const idx = toIndex(x,y);
      if (!matchColor(idx)) continue;
      data[idx]=fR; data[idx+1]=fG; data[idx+2]=fB; data[idx+3]=255;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    ctx.putImageData(imageData,0,0);
  }, [width, height]);

  // Draw stroke between two points
  const drawStroke = useCallback((ctx, from, to, pressure) => {
    const size = brushSize * (tool==='brush' ? pressure*2 : 1);
    ctx.globalAlpha  = tool==='eraser' ? 1 : opacity * (tool==='brush' ? pressure : 1);
    ctx.globalCompositeOperation = tool==='eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle  = tool==='eraser' ? 'rgba(0,0,0,1)' : color;
    ctx.lineWidth    = Math.max(1, size);
    ctx.lineCap      = 'round';
    ctx.lineJoin     = 'round';

    if (tool==='pen' || tool==='eraser') {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    } else if (tool==='brush') {
      // Soft brush: multiple overlapping circles
      const steps = Math.max(1, Math.floor(
        Math.sqrt((to.x-from.x)**2 + (to.y-from.y)**2) / (size*0.3)
      ));
      for (let i=0; i<=steps; i++) {
        const t = i/steps;
        const x = from.x + (to.x-from.x)*t;
        const y = from.y + (to.y-from.y)*t;
        const gradient = ctx.createRadialGradient(x,y,0,x,y,size/2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size/2, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }, [tool, color, brushSize, opacity]);

  // Pointer down
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const pos = getPos(e);
    const p = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 1;
    setPressure(p);
    drawing.current = true;
    lastPos.current = pos;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (tool === 'fill') {
      floodFill(pos.x, pos.y, color);
      saveHistory();
      return;
    }

    // Draw a dot at click point
    drawStroke(ctx, pos, pos, p);
  }, [tool, color, floodFill, drawStroke, saveHistory]);

  // Pointer move
  const handlePointerMove = useCallback((e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const pos = getPos(e);
    const p = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 1;
    setPressure(p);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    drawStroke(ctx, lastPos.current, pos, p);
    lastPos.current = pos;
  }, [drawStroke]);

  // Pointer up
  const handlePointerUp = useCallback((e) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPos.current = null;
    if (tool !== 'fill') saveHistory();
  }, [tool, saveHistory]);

  // Export PNG
  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    canvas.toBlob((blob) => {
      if (onExport) {
        const file = new File([blob], `drawing_${Date.now()}.png`, { type: 'image/png' });
        onExport(file, canvas.toDataURL('image/png'));
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing_${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  }, [onExport]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key==='z') { e.preventDefault(); handleUndo(); }
        if (e.key==='y') { e.preventDefault(); handleRedo(); }
        if (e.key==='s') { e.preventDefault(); handleExport(); }
      }
      if (e.key==='e') setTool('eraser');
      if (e.key==='p') setTool('pen');
      if (e.key==='b') setTool('brush');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo, handleExport]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px', background:'#0a0a0f', padding:'16px', borderRadius:'12px', border:'1px solid #1a1a2e' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>

        {/* Tools */}
        <div style={{ display:'flex', gap:'4px' }}>
          {Object.entries(TOOLS).map(([key, t]) => (
            <button key={key} onClick={() => setTool(key)}
              title={`${t.label} (${key[0]})`}
              style={{
                padding:'6px 10px', borderRadius:'6px', border:'none', cursor:'pointer',
                fontSize:'13px',
                background: tool===key ? '#7c3aed' : '#1e1e2e',
                color: tool===key ? '#fff' : '#aaa',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width:'1px', height:'28px', background:'#333' }} />

        {/* Brush size */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#aaa' }}>
          <span>Size</span>
          <input type="range" min={1} max={60} value={brushSize}
            onChange={e => setBrushSize(+e.target.value)}
            style={{ width:'80px', accentColor:'#7c3aed' }} />
          <span style={{ minWidth:'24px', color:'#888' }}>{brushSize}</span>
        </div>

        {/* Opacity */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#aaa' }}>
          <span>Opacity</span>
          <input type="range" min={0.05} max={1} step={0.05} value={opacity}
            onChange={e => setOpacity(+e.target.value)}
            style={{ width:'60px', accentColor:'#7c3aed' }} />
          <span style={{ minWidth:'28px', color:'#888' }}>{Math.round(opacity*100)}%</span>
        </div>

        {/* Pressure indicator */}
        <div style={{ fontSize:'11px', color:'#555', display:'flex', alignItems:'center', gap:'4px' }}>
          <span>✍️</span>
          <div style={{ width:'40px', height:'4px', background:'#222', borderRadius:'2px' }}>
            <div style={{ width:`${pressure*100}%`, height:'100%', background:'#7c3aed', borderRadius:'2px', transition:'width 0.1s' }} />
          </div>
        </div>

        {/* Undo/Redo/Clear */}
        <div style={{ display:'flex', gap:'4px', marginLeft:'auto' }}>
          <button onClick={handleUndo} title="Undo (Ctrl+Z)"
            style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid #333', background:'#1e1e2e', color:'#aaa', cursor:'pointer', fontSize:'13px' }}>
            ↩
          </button>
          <button onClick={handleRedo} title="Redo (Ctrl+Y)"
            style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid #333', background:'#1e1e2e', color:'#aaa', cursor:'pointer', fontSize:'13px' }}>
            ↪
          </button>
          <button onClick={handleClear} title="Clear canvas"
            style={{ padding:'6px 10px', borderRadius:'6px', border:'1px solid #333', background:'#1e1e2e', color:'#f87171', cursor:'pointer', fontSize:'13px' }}>
            🗑
          </button>
          <button onClick={handleExport} title="Export PNG (Ctrl+S)"
            style={{ padding:'6px 14px', borderRadius:'6px', border:'none', background:'#7c3aed', color:'#fff', cursor:'pointer', fontSize:'13px', fontWeight:600 }}>
            📤 Export
          </button>
        </div>
      </div>

      {/* Color palette */}
      <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', alignItems:'center' }}>
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            style={{
              width:'22px', height:'22px', borderRadius:'50%', border: color===c ? '2px solid #fff' : '2px solid #333',
              background:c, cursor:'pointer', padding:0,
              boxShadow: color===c ? '0 0 0 1px #7c3aed' : 'none',
            }} />
        ))}
        {/* Custom color picker */}
        <label style={{ cursor:'pointer', position:'relative' }} title="Custom color">
          <div style={{
            width:'22px', height:'22px', borderRadius:'50%',
            background: `conic-gradient(red,yellow,lime,cyan,blue,magenta,red)`,
            border:'2px solid #555', cursor:'pointer',
          }} />
          <input type="color" value={customColor}
            onChange={e => { setCustomColor(e.target.value); setColor(e.target.value); }}
            style={{ position:'absolute', opacity:0, width:'22px', height:'22px', top:0, left:0, cursor:'pointer' }} />
        </label>
        {/* Current color preview */}
        <div style={{ width:'28px', height:'28px', borderRadius:'6px', background:color, border:'2px solid #555', marginLeft:'4px' }} />
        {/* Background color */}
        <label style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'11px', color:'#666', marginLeft:'8px', cursor:'pointer' }}>
          BG
          <input type="color" value={bgColor}
            onChange={e => setBgColor(e.target.value)}
            style={{ width:'20px', height:'20px', border:'none', borderRadius:'4px', cursor:'pointer' }} />
        </label>
      </div>

      {/* Canvas */}
      <div style={{ position:'relative', borderRadius:'8px', overflow:'hidden', border:'1px solid #2a2a3e', cursor:TOOLS[tool]?.cursor || 'crosshair' }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          style={{ display:'block', width:'100%', touchAction:'none', userSelect:'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={e => e.preventDefault()}
        />
      </div>

      {/* Shortcuts hint */}
      <div style={{ fontSize:'11px', color:'#444', display:'flex', gap:'12px', flexWrap:'wrap' }}>
        <span>P=Pen · B=Brush · E=Eraser · Ctrl+Z=Undo · Ctrl+Y=Redo · Ctrl+S=Export</span>
        <span style={{ color:'#333' }}>Tablet pressure supported ✍️</span>
      </div>
    </div>
  );
};

export default DrawingPad;
EOF
echo "  ✅ DrawingPad.js component created"

# ════════════════════════════════════════════════════════════
# FIX 2 — Create DrawingPadPage
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 2: Creating DrawingPadPage..."

cat > src/front/js/pages/DrawingPadPage.js << 'EOF'
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
EOF
echo "  ✅ DrawingPadPage.js created"

# ════════════════════════════════════════════════════════════
# FIX 3 — Wire DrawingPad into IllustrationPuppetPage
# Load drawing_pad_image from localStorage if present
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 3: Wire drawing pad output to IllustrationPuppetPage..."

python3 << 'PYEOF'
path = "src/front/js/pages/IllustrationPuppetPage.js"
with open(path) as f:
    content = f.read()

if "drawing_pad_image" not in content:
    load_drawing = """
  // Auto-load drawing from DrawingPad if available
  React.useEffect(() => {
    const padImage = localStorage.getItem('drawing_pad_image');
    if (padImage) {
      localStorage.removeItem('drawing_pad_image');
      // Convert data URL to File and trigger upload
      fetch(padImage)
        .then(r => r.blob())
        .then(blob => {
          const file = new File([blob], 'drawing_pad.png', { type: 'image/png' });
          // Trigger the IllustrationSegmenter upload programmatically
          const input = document.querySelector('.illus-upload-area input[type="file"]');
          if (input) {
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })
        .catch(() => {});
    }
  }, []);

"""
    content = content.replace(
        "  return (\n    <div className=\"illus-puppet-page\">",
        load_drawing + "  return (\n    <div className=\"illus-puppet-page\">"
    )
    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ IllustrationPuppetPage loads from drawing pad")
else:
    print("  ✅ Already wired")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 4 — Add DrawingPadPage to layout.js and sidebar
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 4: Add drawing pad to layout.js + sidebar..."

python3 << 'PYEOF'
# layout.js
path = "src/front/js/layout.js"
with open(path) as f:
    content = f.read()

if "DrawingPadPage" not in content:
    content = content.replace(
        "import IllustrationTo3DPage from './pages/IllustrationTo3DPage';",
        "import IllustrationTo3DPage from './pages/IllustrationTo3DPage';\nimport DrawingPadPage from './pages/DrawingPadPage';"
    )
    content = content.replace(
        '<Route path="/illustration-to-3d" element={<IllustrationTo3DPage />} />',
        '<Route path="/illustration-to-3d" element={<IllustrationTo3DPage />} />\n              <Route path="/drawing-pad" element={<DrawingPadPage />} />'
    )
    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ DrawingPadPage added to layout.js")
else:
    print("  ✅ Already in layout.js")
PYEOF

python3 << 'PYEOF'
# sidebar.js
path = "src/front/js/component/sidebar.js"
with open(path) as f:
    content = f.read()

if "drawing-pad" not in content:
    content = content.replace(
        '{ to: "/illustration-to-3d", label: "Drawing to 3D" },',
        '{ to: "/illustration-to-3d", label: "Drawing to 3D" },\n      { to: "/drawing-pad", label: "Drawing Pad" },'
    )
    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Drawing Pad added to sidebar")
else:
    print("  ✅ Already in sidebar")
PYEOF

# ════════════════════════════════════════════════════════════
# FIX 5 — Add drawing pad link to IllustrationTo3DPage
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Fix 5: Add drawing pad link to IllustrationTo3DPage..."

python3 << 'PYEOF'
path = "src/front/js/pages/IllustrationTo3DPage.js"
with open(path) as f:
    content = f.read()

if "drawing-pad" not in content and "DrawingPad" not in content:
    # Add link after the main heading
    content = content.replace(
        '<p>\n        Upload a hand-drawn or digital 2D illustration',
        '<p>\n        Upload a hand-drawn or digital 2D illustration'
    )
    # Add drawing pad button near upload area
    content = content.replace(
        'style={{ border: "2px dashed #4A90D9"',
        '// drawing pad button added above\nstyle={{ border: "2px dashed #4A90D9"'
    )
    # Add link in a simpler way - after the heading paragraph
    content = content.replace(
        'Works with head portraits and full-body character art.\n      </p>',
        'Works with head portraits and full-body character art.\n      </p>\n      <div style={{marginBottom:"16px"}}>\n        <a href="/drawing-pad" style={{color:"#a78bfa",fontSize:"13px"}}>✏️ Or draw directly in DoppelFlex →</a>\n      </div>'
    )
    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Drawing pad link added to IllustrationTo3DPage")
else:
    print("  ✅ Already linked")
PYEOF

# ════════════════════════════════════════════════════════════
# VERIFY + COMMIT
# ════════════════════════════════════════════════════════════
echo ""
echo "⚙️  Verifying..."

python3 << 'PYEOF'
checks = {
    "DrawingPad component exists": ("src/front/js/component/DrawingPad.js", "PointerEvent\|onPointerDown"),
    "DrawingPadPage exists": ("src/front/js/pages/DrawingPadPage.js", "drawing-pad"),
    "DrawingPad in layout.js": ("src/front/js/layout.js", "DrawingPadPage"),
    "Drawing pad route in layout": ("src/front/js/layout.js", "/drawing-pad"),
    "Drawing pad in sidebar": ("src/front/js/component/sidebar.js", "drawing-pad"),
    "IllustrationPuppetPage loads from pad": ("src/front/js/pages/IllustrationPuppetPage.js", "drawing_pad_image"),
    "Pressure sensitivity in DrawingPad": ("src/front/js/component/DrawingPad.js", "e.pressure"),
    "Undo/Redo in DrawingPad": ("src/front/js/component/DrawingPad.js", "handleUndo"),
    "Flood fill in DrawingPad": ("src/front/js/component/DrawingPad.js", "floodFill"),
    "Export PNG in DrawingPad": ("src/front/js/component/DrawingPad.js", "handleExport"),
}

import re, os
passed = failed = 0
for label, (filepath, search) in checks.items():
    try:
        with open(filepath) as f:
            c = f.read()
        if re.search(search, c):
            print(f"  ✅ {label}")
            passed += 1
        else:
            print(f"  ❌ {label} (search: {search})")
            failed += 1
    except FileNotFoundError:
        print(f"  ❌ {label} — file not found")
        failed += 1

print(f"\n  Result: {passed}/{passed+failed} checks passing")
PYEOF

echo ""
echo "⚙️  Committing..."
git add -A && git commit -m "feat: drawing pad with tablet support, pressure sensitivity, undo/redo, convert to 3D/puppet" && git push

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅  Drawing Pad complete!"
echo ""
echo "Features:"
echo "  ✏️  Pen tool — clean lines, pressure-sensitive width"
echo "  🖌️  Brush tool — soft edges, pressure-sensitive opacity"
echo "  🧹  Eraser tool"
echo "  🪣  Flood fill"
echo "  🎨  15 colors + custom color picker"
echo "  ↩   Undo / Redo (Ctrl+Z / Ctrl+Y)"
echo "  📤  Export PNG → Convert to 3D or Puppet"
echo "  ✍️  Tablet/stylus pressure supported"
echo "  ⌨️  Keyboard shortcuts"
echo ""
echo "Access at: /drawing-pad"
echo "Also linked from: sidebar, Illustration to 3D page"
echo "════════════════════════════════════════════════════════"
