// src/front/js/pages/BeatEditorPage.js
// Fixed: WaveSurfer loaded from CDN (avoids Babel ES6 class issue), dark theme

import React, { useState, useRef, useEffect } from 'react';
import '../../styles/Wardrobe.css';

const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
};

const BeatEditorPage = () => {
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const [audioFile, setAudioFile] = useState(null);
  const [beatMarkers, setBeatMarkers] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');

      if (!mounted || !waveformRef.current || wavesurferRef.current) return;

      wavesurferRef.current = window.WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4a4a6a',
        progressColor: '#4ade80',
        cursorColor: '#8b5cf6',
        height: 100,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
      });

      wavesurferRef.current.on('ready', () => setReady(true));

      wavesurferRef.current.on('timeupdate', (time) => {
        setCurrentTime(time);
      });
    };

    init();

  

  const deleteMarker = (idx) => {
    setBeatMarkers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!beatMarkers.length) { setStatus('No markers to save'); return; }
    const token = localStorage.getItem('token');
    if (!token) { setStatus('Login required'); return; }
    try {
      const res = await fetch(`${BACKEND}/api/save-beatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song_name: songName || 'Untitled', beat_markers: beatMarkers }),
      });
      const data = await res.json();
      setStatus(res.ok ? `✅ Saved (ID: ${data.id})` : `❌ ${data.error}`);
      if (res.ok) loadSavedBeatmaps();
    } catch (err) { setStatus(`❌ ${err.message}`); }
  };

  const loadSavedBeatmaps = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoadingMaps(true);
    try {
      const res = await fetch(`${BACKEND}/api/load-beatmaps`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setSavedBeatmaps(data);
    } catch {} finally { setLoadingMaps(false); }
  };

  const handleDeleteBeatmap = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    await fetch(`${BACKEND}/api/delete-beatmap/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSavedBeatmaps(prev => prev.filter(b => b.id !== id));
  };

  return () => {
      mounted = false;
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
        wavesurferRef.current = null;
      }
    };
  }, []);

  const handleAudioUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAudioFile(file);
    setReady(false);
    setBeatMarkers([]);
    if (wavesurferRef.current) {
      wavesurferRef.current.loadBlob(file);
    }
  };

  const handleAddBeat = () => {
    if (!wavesurferRef.current) return;
    const time = wavesurferRef.current.getCurrentTime();
    setBeatMarkers((prev) => [...prev, parseFloat(time.toFixed(3))]);
  };

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
      setIsPlaying(!isPlaying);
    }
  };

  const handleExportBeats = () => {
    const data = {
      beats: beatMarkers.map((t, i) => ({ index: i, time: t })),
      count: beatMarkers.length,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'beat_timestamps.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedBeats = [...beatMarkers].sort((a, b) => a - b);



  const deleteMarker = (idx) => {
    setBeatMarkers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!beatMarkers.length) { setStatus('No markers to save'); return; }
    const token = localStorage.getItem('token');
    if (!token) { setStatus('Login required'); return; }
    try {
      const res = await fetch(`${BACKEND}/api/save-beatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song_name: songName || 'Untitled', beat_markers: beatMarkers }),
      });
      const data = await res.json();
      setStatus(res.ok ? `✅ Saved (ID: ${data.id})` : `❌ ${data.error}`);
      if (res.ok) loadSavedBeatmaps();
    } catch (err) { setStatus(`❌ ${err.message}`); }
  };

  const loadSavedBeatmaps = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoadingMaps(true);
    try {
      const res = await fetch(`${BACKEND}/api/load-beatmaps`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) setSavedBeatmaps(data);
    } catch {} finally { setLoadingMaps(false); }
  };

  const handleDeleteBeatmap = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    await fetch(`${BACKEND}/api/delete-beatmap/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSavedBeatmaps(prev => prev.filter(b => b.id !== id));
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🥁 Beat Editor</h2>
        <p className="df-page__subtitle">
          Play audio and tap to mark beats at the current playback position. Export beat timestamps as JSON.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Waveform */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🎧 Audio</h3>
              {audioFile && <span className="df-card__badge df-card__badge--green">{audioFile.name}</span>}
            </div>
            <div className="df-card__body">
              <label className="df-file-label">
                📁 Choose Audio
                <input type="file" accept="audio/*" onChange={handleAudioUpload} className="df-file-input" />
              </label>

              <div className="df-waveform" style={{ marginTop: '12px' }}>
                <div ref={waveformRef} className="df-waveform__container" />
              </div>

              <div className="df-toolbar" style={{ marginTop: '12px' }}>
                <button className="df-btn df-btn--primary df-btn--sm" onClick={handlePlayPause} disabled={!ready}>
                  {isPlaying ? '⏸ Pause' : '▶️ Play'}
                </button>

                <div className="df-separator" />

                <button className="df-btn df-btn--success df-btn--sm" onClick={handleAddBeat} disabled={!ready}>
                  ➕ Mark Beat at {currentTime.toFixed(2)}s
                </button>

                <div className="df-separator" />

                <button className="df-btn df-btn--ghost df-btn--sm" onClick={() => setBeatMarkers([])} disabled={beatMarkers.length === 0}>
                  🗑 Clear All
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Beat List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">⏱ Beats</h3>
              <span className="df-card__badge df-card__badge--purple">{beatMarkers.length} marked</span>
            </div>
            <div className="df-card__body">
              {beatMarkers.length === 0 ? (
                <div className="df-empty">
                  <div className="df-empty__icon">🎯</div>
                  <div className="df-empty__text">Play audio and click "Mark Beat" to add timestamps</div>
                </div>
              ) : (
                <div className="df-beat-list">
                  {sortedBeats.map((t, i) => (
                    <span key={i} className="df-beat-chip">{i + 1}. {t.toFixed(3)}s</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="df-actions">
            <button className="df-btn df-btn--primary" onClick={handleExportBeats} disabled={beatMarkers.length === 0}>
              📥 Export JSON
            </button>
            <button
              className="df-btn df-btn--ghost"
              onClick={() => setBeatMarkers((prev) => prev.slice(0, -1))}
              disabled={beatMarkers.length === 0}
            >
              ↩ Undo Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeatEditorPage;