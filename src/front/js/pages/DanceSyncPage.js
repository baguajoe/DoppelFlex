// src/front/js/pages/DanceSyncPage.js
// Fixed: All process.env.BACKEND_URL → REACT_APP_BACKEND_URL, dark theme styling
// Preserves ALL original features: voice upload, handlePlay, audio+canvas recording, visemes

import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import AnimatedAvatar from '../component/AnimatedAvatar';
import WaveformVisualizer from '../component/WaveformVisualizer';
import AvatarRigPlayer3D from '../component/AvatarRigPlayer3D';
import CustomAvatar from '../component/CustomAvatar';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';



// Per-genre dance frame generator
function buildDanceFrames(genre, beatTimes) {
  const base = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
  const L_SHOULDER=11, R_SHOULDER=12, L_ELBOW=13, R_ELBOW=14;
  const L_WRIST=15, R_WRIST=16, L_HIP=23, R_HIP=24, L_KNEE=25, R_KNEE=26;

  return beatTimes.map((beatTime, i) => {
    const phase = i % 4;
    const lm = base();

    if (genre === 'slow') {
      const sway = Math.sin((i / beatTimes.length) * Math.PI * 2) * 0.04;
      lm[L_SHOULDER] = { x: 0.35 + sway, y: 0.35, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.65 + sway, y: 0.35, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: 0.25 + sway, y: 0.45, z: 0.05, visibility: 1 };
      lm[R_ELBOW]    = { x: 0.75 + sway, y: 0.45, z: 0.05, visibility: 1 };
      lm[L_HIP]      = { x: 0.44 + sway*0.5, y: 0.58, z: 0, visibility: 1 };
      lm[R_HIP]      = { x: 0.56 + sway*0.5, y: 0.58, z: 0, visibility: 1 };
    } else if (genre === 'hiphop') {
      const bounce = phase % 2 === 0 ? 0.02 : -0.01;
      const lean   = phase < 2 ? 0.03 : -0.03;
      lm[L_SHOULDER] = { x: 0.33, y: 0.33 + bounce, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.67, y: 0.33 + bounce, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: 0.22, y: 0.44 + lean, z: 0.1, visibility: 1 };
      lm[R_ELBOW]    = { x: 0.78, y: 0.44 - lean, z: 0.1, visibility: 1 };
      lm[L_WRIST]    = { x: 0.15, y: 0.52 + lean, z: 0.1, visibility: 1 };
      lm[R_WRIST]    = { x: 0.85, y: 0.52 - lean, z: 0.1, visibility: 1 };
      lm[L_HIP]      = { x: 0.43, y: 0.58 - bounce, z: 0, visibility: 1 };
      lm[R_HIP]      = { x: 0.57, y: 0.58 - bounce, z: 0, visibility: 1 };
      lm[L_KNEE]     = { x: 0.42, y: 0.72 + bounce*2, z: 0, visibility: 1 };
      lm[R_KNEE]     = { x: 0.58, y: 0.72 + bounce*2, z: 0, visibility: 1 };
    } else if (genre === 'pop') {
      const sway     = phase % 2 === 0 ? 0.04 : -0.04;
      const armRaise = phase === 0 || phase === 2 ? -0.08 : 0;
      lm[L_SHOULDER] = { x: 0.34, y: 0.32, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.66, y: 0.32, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: 0.22 + sway, y: 0.28 + armRaise, z: 0.05, visibility: 1 };
      lm[R_ELBOW]    = { x: 0.78 - sway, y: 0.28 - armRaise, z: 0.05, visibility: 1 };
      lm[L_WRIST]    = { x: 0.15 + sway, y: 0.22 + armRaise, z: 0.05, visibility: 1 };
      lm[R_WRIST]    = { x: 0.85 - sway, y: 0.22 - armRaise, z: 0.05, visibility: 1 };
      lm[L_HIP]      = { x: 0.43 + sway*0.3, y: 0.57, z: 0, visibility: 1 };
      lm[R_HIP]      = { x: 0.57 + sway*0.3, y: 0.57, z: 0, visibility: 1 };
    } else if (genre === 'edm') {
      const leftUp = phase === 0 || phase === 1;
      lm[L_SHOULDER] = { x: 0.32, y: 0.30, z: 0, visibility: 1 };
      lm[R_SHOULDER] = { x: 0.68, y: 0.30, z: 0, visibility: 1 };
      lm[L_ELBOW]    = { x: leftUp ? 0.24 : 0.20, y: leftUp ? 0.15 : 0.42, z: 0.1, visibility: 1 };
      lm[R_ELBOW]    = { x: !leftUp ? 0.76 : 0.80, y: !leftUp ? 0.15 : 0.42, z: 0.1, visibility: 1 };
      lm[L_WRIST]    = { x: leftUp ? 0.26 : 0.12, y: leftUp ? 0.08 : 0.50, z: 0.1, visibility: 1 };
      lm[R_WRIST]    = { x: !leftUp ? 0.74 : 0.88, y: !leftUp ? 0.08 : 0.50, z: 0.1, visibility: 1 };
      if (phase % 2 === 0) lm[L_KNEE] = { x: 0.42, y: 0.62, z: 0.05, visibility: 1 };
      else                  lm[R_KNEE] = { x: 0.58, y: 0.62, z: 0.05, visibility: 1 };
    } else {
      const flip = i % 2 === 0;
      lm[L_ELBOW] = { x: flip ? 0.20 : 0.30, y: flip ? 0.35 : 0.45, z: 0.1, visibility: 1 };
      lm[R_ELBOW] = { x: flip ? 0.80 : 0.70, y: flip ? 0.35 : 0.45, z: 0.1, visibility: 1 };
      lm[L_WRIST] = { x: flip ? 0.15 : 0.28, y: flip ? 0.28 : 0.40, z: 0.1, visibility: 1 };
      lm[R_WRIST] = { x: flip ? 0.85 : 0.72, y: flip ? 0.28 : 0.40, z: 0.1, visibility: 1 };
    }
    return { time: beatTime, landmarks: lm };
  });
}

// BPM → genre heuristic
function detectGenre(bpm) {
  if (!bpm) return 'pop';
  if (bpm < 75)  return 'slow';
  if (bpm < 100) return 'hiphop';
  if (bpm < 130) return 'pop';
  if (bpm < 160) return 'edm';
  return 'fast';
}

const DanceSyncPage = () => {
  const [beatTimes, setBeatTimes] = useState([]);
  const [tempo, setTempo] = useState(null);
  const [genre, setGenre] = useState('pop');
  const [danceFrames, setDanceFrames] = useState([]);
  const [liveFrame, setLiveFrame] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [danceStyle, setDanceStyle] = useState('bounce');
  const [recording, setRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [useCustomAvatar, setUseCustomAvatar] = useState(false);
  const [uploadedModel, setUploadedModel] = useState(null);
  const [visemes, setVisemes] = useState([]);
  const [canvasReady, setCanvasReady] = useState(false);

  const avatarRef = useRef();
  const frameIntervalRef = useRef(null);
  const frameIdxRef = useRef(0);
  const audioRef = useRef();
  const recorderRef = useRef(null);
  const voiceRef = useRef(null);

  // ── Upload music → analyze beats ──
  const handleAudioUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setAudioUrl(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const res = await fetch(`${BACKEND}/api/analyze-beats`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.beat_times) setBeatTimes(data.beat_times);
      if (data.tempo) { setTempo(data.tempo); setGenre(detectGenre(data.tempo)); }
    } catch (err) {
      console.error('Audio analysis failed:', err);
    }
  };

  // ── Upload voice → extract visemes for lip sync ──
  const handleVoiceUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('audio', file);

    try {
      const res = await fetch(`${BACKEND}/api/analyze-voice`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.visemes) setVisemes(data.visemes);
      if (voiceRef.current) voiceRef.current.src = URL.createObjectURL(file);
    } catch (err) {
      console.error('Voice analysis failed:', err);
    }
  };

  // ── Play audio + trigger avatar animation on every beat ──

  const handleSaveBeatmap = async () => {
    if (!beatTimes.length) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND}/api/save-beatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ song_name: fileName || 'Untitled', beat_markers: beatTimes, bpm: tempo }),
      });
      const data = await res.json();
      alert(res.ok ? `✅ Beatmap saved (ID: ${data.id})` : `❌ ${data.error}`);
    } catch (err) { alert(`❌ ${err.message}`); }
  };

  const handlePlay = () => {
    if (!audioRef.current || !danceFrames.length) return;
    if (frameIntervalRef.current) clearTimeout(frameIntervalRef.current);

    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});

    let beatIdx = 0;
    const scheduleNextBeat = () => {
      if (beatIdx >= beatTimes.length) return;
      const now       = audioRef.current.currentTime;
      const nextBeat  = beatTimes[beatIdx];
      const delay     = Math.max(0, (nextBeat - now) * 1000);
      frameIntervalRef.current = setTimeout(() => {
        const frame = danceFrames[beatIdx % danceFrames.length];
        if (frame) setLiveFrame({ landmarks: frame.landmarks });
        beatIdx++;
        scheduleNextBeat();
      }, delay);
    };
    scheduleNextBeat();
  };

  // ── Custom avatar model upload ──
  const handleModelUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedModel(URL.createObjectURL(file));
      setUseCustomAvatar(true);
    }
  };

  // ── Start recording: merge canvas video + audio tracks ──
  const startRecording = () => {
    setTimeout(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return alert('Canvas not ready');

      const canvasStream = canvas.captureStream(30);

      // Merge audio track from <audio> element if available
      let combinedStream;
      try {
        const audioStream = audioRef.current?.captureStream?.();
        if (audioStream && audioStream.getAudioTracks().length > 0) {
          combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioStream.getAudioTracks(),
          ]);
        } else {
          combinedStream = canvasStream;
        }
      } catch {
        combinedStream = canvasStream;
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      recorderRef.current = recorder;

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const localUrl = URL.createObjectURL(blob);
        setDownloadUrl(localUrl);
        setRecordedChunks(chunks);

        // Upload to backend
        const formData = new FormData();
        formData.append('video', blob, 'recording.webm');

        try {
          const uploadRes = await fetch(`${BACKEND}/api/upload-video`, {
            method: 'POST',
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (uploadData.video_url) {
            console.log('✅ Uploaded video:', uploadData.video_url);
            setDownloadUrl(uploadData.video_url);
          }
        } catch (err) {
          console.error('Video upload failed:', err);
        }
      };

      recorder.start();
      setRecording(true);
    }, 500);
  };

  const stopRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
    }
  };

  // ── Save dance session to database ──
  const saveSessionToDB = async () => {
    const sessionData = {
      user_id: 1,
      song_name: fileName,
      tempo,
      beat_times: beatTimes,
      style: danceStyle,
      video_url: downloadUrl,
    };

    try {
      await fetch(`${BACKEND}/api/save-dance-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData),
      });
      alert('🎉 Dance session saved to database!');
    } catch {
      alert('⚠️ Failed to save session');
    }
  };

  // ── Video format conversion (mp4, avi, mov) ──
  const convertVideo = async (format) => {
    if (!downloadUrl) return;
    const filename = downloadUrl.split('/').pop();
    try {
      const res = await fetch(`${BACKEND}/api/convert-to-${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      const url = data[`${format}_url`];
      if (url) window.open(url, '_blank');
    } catch {
      alert(`⚠️ Conversion to ${format} failed`);
    }
  };

  return (
    <div className="df-page">
      <div className="df-page__header">
        <h2 className="df-page__title">🎵 Dance Sync Studio</h2>
        <p className="df-page__subtitle">
          Upload audio, detect beats, and watch your avatar dance in sync. Record and export the performance.
        </p>
      </div>

      <div className="df-grid-2">
        {/* ═══ Left Column: Controls ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Audio Upload */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🎧 Audio</h3>
              {tempo && <span className="df-card__badge df-card__badge--green">{Math.round(tempo)} BPM</span>}
            </div>
            <div className="df-card__body">
              <label className="df-label">Upload Music File</label>
              <label className="df-file-label">
                📁 Choose Audio
                <input type="file" accept="audio/*" onChange={handleAudioUpload} className="df-file-input" />
              </label>
              {fileName && <div className="df-file-name">{fileName}</div>}

              {/* Beat info */}
              {tempo && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#888' }}>
                  <strong style={{ color: '#ccc' }}>File:</strong> {fileName} &nbsp;·&nbsp;
                  <strong style={{ color: '#ccc' }}>Tempo:</strong> {Math.round(tempo)} BPM &nbsp;·&nbsp;
                  <strong style={{ color: '#ccc' }}>Beats:</strong> {beatTimes.length}
                </div>
              )}

              {/* Audio player + Play with Avatar button */}
              {audioUrl && (
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <button className="df-btn df-btn--primary df-btn--sm" onClick={handlePlay} disabled={!beatTimes.length}>
                    ▶️ Play with Avatar
                  </button>
                  <audio ref={audioRef} src={audioUrl} controls style={{ flex: 1, minWidth: '180px', height: '32px' }} />
                </div>
              )}

              {/* Waveform visualizer */}
              {audioUrl && beatTimes.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <WaveformVisualizer
                    audioUrl={audioUrl}
                    beatTimes={beatTimes}
                    onManualTrigger={() => {
                      if (avatarRef.current && avatarRef.current.animate) {
                        avatarRef.current.animate();
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Voice Upload (Visemes) */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🗣 Voice / Lip Sync</h3>
              {visemes.length > 0 && <span className="df-card__badge df-card__badge--green">{visemes.length} visemes</span>}
            </div>
            <div className="df-card__body">
              <label className="df-label">Upload Voice Audio (for viseme extraction)</label>
              <label className="df-file-label">
                🎙 Choose Voice File
                <input type="file" accept="audio/*" onChange={handleVoiceUpload} className="df-file-input" />
              </label>
              {visemes.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#4ade80' }}>
                  ✅ {visemes.length} visemes extracted — ready for lip sync
                </div>
              )}
            </div>
          </div>

          {/* Avatar & Style */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🕺 Avatar & Style</h3>
            </div>
            <div className="df-card__body">
              <div className="df-form-row">
                <div className="df-form-group">
                  <label className="df-label">Avatar Source</label>
                  <select
                    className="df-select"
                    value={useCustomAvatar ? 'custom' : 'default'}
                    onChange={(e) => setUseCustomAvatar(e.target.value === 'custom')}
                  >
                    <option value="default">Use Built-in Avatar</option>
                    <option value="custom">Upload Custom Avatar</option>
                  </select>
                </div>
                <div className="df-form-group">
                  <label className="df-label">Dance Style</label>
                  <select className="df-select" value={danceStyle} onChange={(e) => setDanceStyle(e.target.value)}>
                    <option value="bounce">Bounce</option>
                    <option value="shuffle">Shuffle</option>
                    <option value="arms">Arms</option>
                    <option value="freestyle">Freestyle</option>
                  </select>
                </div>
              </div>

              {useCustomAvatar && (
                <div style={{ marginTop: '12px' }}>
                  <label className="df-label">Upload Custom Model (.glb)</label>
                  <label className="df-file-label">
                    📂 Choose Model
                    <input type="file" accept=".glb,.gltf" onChange={handleModelUpload} className="df-file-input" />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="df-card">
            <div className="df-card__header">
              <h3 className="df-card__title">🎬 Record</h3>
              {recording && (
                <span className="df-card__badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                  ● REC
                </span>
              )}
            </div>
            <div className="df-card__body">
              <div className="df-actions">
                {!recording ? (
                  <button className="df-btn df-btn--danger" onClick={startRecording} disabled={!audioUrl}>
                    🎥 Start Recording
                  </button>
                ) : (
                  <button className="df-btn df-btn--ghost" onClick={stopRecording}>
                    ⏹ Stop Recording
                  </button>
                )}

                {downloadUrl && (
                  <>
                    <a href={downloadUrl} download="avatar_dance.webm" className="df-btn df-btn--success" style={{ textDecoration: 'none' }}>
                      💾 Download Video
                    </a>
                    <button className="df-btn df-btn--primary df-btn--sm" onClick={saveSessionToDB}>
                      📥 Save Session to DB
                    </button>
                  </>
                )}
              </div>

              {/* Video conversion buttons */}
              {downloadUrl && (
                <div className="df-actions" style={{ marginTop: '10px' }}>
                  <span style={{ fontSize: '12px', color: '#666', marginRight: '4px' }}>Convert:</span>
                  <button className="df-btn df-btn--warning df-btn--sm" onClick={() => convertVideo('mp4')}>🎞 MP4</button>
                  <button className="df-btn df-btn--warning df-btn--sm" onClick={() => convertVideo('avi')}>🎞 AVI</button>
                  <button className="df-btn df-btn--warning df-btn--sm" onClick={() => convertVideo('mov')}>🎞 MOV</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ Right Column: 3D Viewport ═══ */}
        <div className="df-card">
          <div className="df-card__header">
            <h3 className="df-card__title">🎮 3D Preview</h3>
            <span className="df-card__badge df-card__badge--purple">{danceStyle}</span>
          </div>
          <div className="df-card__body" style={{ padding: 0 }}>
            <div style={{ height: '600px', background: '#080810', borderRadius: '0 0 12px 12px' }}>
              {typeof window !== 'undefined' && (
                <Suspense fallback={<div style={{ color: '#666', textAlign: 'center', paddingTop: '200px' }}>🌀 Loading 3D Canvas...</div>}>
                  <AvatarRigPlayer3D
          avatarUrl={useCustomAvatar && uploadedModel ? uploadedModel : `${BACKEND}/static/models/Y_Bot.glb`}
          liveFrame={liveFrame}
          recordedFrames={null}
          smoothingEnabled={true}
          visemes={visemes}
          audioRef={audioRef}
        />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden audio element for voice playback */}
      <audio ref={voiceRef} style={{ display: 'none' }} />
    </div>
  );
};

export default DanceSyncPage;