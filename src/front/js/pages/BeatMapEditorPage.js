// src/front/js/pages/BeatMapEditorPage.js
// Reworked: dark theme, CDN WaveSurfer (avoids Babel ES6 issue), styled controls

import React, { useState, useRef, useEffect } from 'react';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

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

const BeatmapEditorPage = () => {
  const [audioFile, setAudioFile] = useState(null);
  const [beatMarkers, setBeatMarkers] = useState([]);
  const [songName, setSongName] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');

  const waveformRef = useRef(null);
  const timelineRef = useRef(null);
  const wavesurferRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await loadScript('https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js');
      await loadScript('https://unpkg.com/wavesurfer.js@7/dist/plugins/timeline.min.js');

      if (!mounted || !waveformRef.current || wavesurferRef.current) return;

      const WaveSurfer = window.WaveSurfer;
      const TimelinePlugin = window.WaveSurfer.Timeline;

      wavesurferRef.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: '#4a4a6a',
        progressColor: '#8b5cf6',
        cursorColor: '#4ade80',
        height: 100,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        plugins: [
          TimelinePlugin.create({ container: timelineRef.current })
        ]
      });

      wavesurferRef.current.on('ready', () => setReady(true));

      wavesurferRef.current.on('click', (relativeX) => {
        const duration = wavesurferRef.current.getDuration();
        const time = relativeX * duration;
        setBeatMarkers((prev) => [...prev, parseFloat(time.toFixed(3))]);
      });
    };

    init();

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
    setSongName(file.name.replace(/\.[^.]+$/, ''));
    setReady(false);
    if (wavesurferRef.current) {
      wavesurferRef.current.empty();
      wavesurferRef.current.loadBlob(file);
      setBeatMarkers([]);
    }
  };

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
      setIsPlaying(!isPlaying);
    }
  };

  const handleZoom = (e) => {
    const value = Number(e.target.value);
    setZoomLevel(value);
    if (wavesurferRef.current) wavesurferRef.current.zoom(value);
  };

  const handleRemoveLast = () => {
    setBeatMarkers((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    setBeatMarkers([]);
  };

  const handleSaveBeats = async () => {
    if (!audioFile || !songName) {
      setStatus('Upload audio and enter a song name first.');
      return;
    }

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('song_name', songName);
    formData.append('beat_times', JSON.stringify(beatMarkers));

    try {
      const res = await fetch(`${BACKEND}/api/save-beat-map`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setStatus(res.ok ? '✅ Beatmap saved!' : `Error: ${data.error || 'Save failed'}`);
    } catch {
      setStatus('⚠️ Backend not reachable.');
    }
  };

  const handleExportJSON = () => {
    const data = {
      song_name: songName,
      beat_count: beatMarkers.length,
      beats: beatMarkers.map((t, i) => ({ index: i, time: t })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beatmap_${songName || 'untitled'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedBeats = [...beatMarkers].sort((a, b) => a - b);

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎵 BeatMap Editor</h2>
        <p className="df-page__subtitle">
          Upload audio, click the waveform to place beat markers, then save or export your beatmap.
        </p>
      </div>

      <div className="df-grid-2">
        {/* Left: Audio + Waveform */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Upload */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🎧 Audio Source</h3>
              {audioFile && <span className="df-card__badge df-card__badge--green">{audioFile.name}</span>}
            </div>
            <div className="df-card__body">
              <div className="df-form-row">
                <div className="df-form-group">
                  <label className="df-label">Audio File</label>
                  <label className="df-file-label">
                    📁 Choose Audio
                    <input type="file" accept="audio/*" onChange={handleAudioUpload} className="df-file-input" />
                  </label>
                </div>
                <div className="df-form-group">
                  <label className="df-label">Song Name</label>
                  <input
                    className="df-input"
                    placeholder="Enter song name"
                    value={songName}
                    onChange={(e) => setSongName(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🔊 Waveform</h3>
              <span className="df-card__badge df-card__badge--purple">
                {ready ? 'Click to add beats' : 'Upload audio first'}
              </span>
            </div>
            <div className="df-card__body">
              <div className="df-waveform">
                <div ref={waveformRef} className="df-waveform__container" />
                <div ref={timelineRef} className="df-waveform__timeline" />
              </div>

              {/* Playback Controls */}
              <div className="df-toolbar" style={{ marginTop: '12px' }}>
                <button className="df-btn df-btn--primary df-btn--sm" onClick={handlePlayPause} disabled={!ready}>
                  {isPlaying ? '⏸ Pause' : '▶️ Play'}
                </button>

                <div className="df-separator" />

                <div className="df-toolbar__group">
                  <span className="df-toolbar__label">Zoom:</span>
                  <input type="range" min="0" max="200" value={zoomLevel} onChange={handleZoom} className="df-range" />
                </div>

                <div className="df-separator" />

                <button className="df-btn df-btn--warning df-btn--sm" onClick={handleRemoveLast} disabled={beatMarkers.length === 0}>
                  ↩ Undo
                </button>
                <button className="df-btn df-btn--ghost df-btn--sm" onClick={handleClearAll} disabled={beatMarkers.length === 0}>
                  🗑 Clear All
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Beats + Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Beat Markers */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">⏱ Beat Markers</h3>
              <span className="df-card__badge df-card__badge--green">{beatMarkers.length} beats</span>
            </div>
            <div className="df-card__body">
              {beatMarkers.length === 0 ? (
                <div className="df-empty">
                  <div className="df-empty__icon">🥁</div>
                  <div className="df-empty__text">No beats yet — click the waveform to add</div>
                </div>
              ) : (
                <div className="df-beat-list">
                  {sortedBeats.map((t, i) => (
                    <span key={i} className="df-beat-chip">
                      {i + 1}. {t.toFixed(3)}s
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">💾 Save & Export</h3>
            </div>
            <div className="df-card__body">
              <div className="df-actions">
                <button
                  className="df-btn df-btn--success"
                  onClick={handleSaveBeats}
                  disabled={beatMarkers.length === 0 || !songName}
                >
                  💾 Save to Backend
                </button>
                <button
                  className="df-btn df-btn--primary"
                  onClick={handleExportJSON}
                  disabled={beatMarkers.length === 0}
                >
                  📥 Export JSON
                </button>
              </div>

              {status && (
                <div className={`df-status ${status.startsWith('✅') ? 'df-status--success' : 'df-status--error'}`}
                  style={{ marginTop: '12px' }}
                >
                  {status}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BeatmapEditorPage;