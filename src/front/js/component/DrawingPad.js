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
