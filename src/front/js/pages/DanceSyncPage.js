// src/front/js/pages/DanceSyncPage.js
// Fixed: All process.env.BACKEND_URL → REACT_APP_BACKEND_URL, dark theme styling
// Preserves ALL original features: voice upload, handlePlay, audio+canvas recording, visemes

import React, { Suspense, useState, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import AnimatedAvatar from '../component/AnimatedAvatar';
import WaveformVisualizer from '../component/WaveformVisualizer';
import CustomAvatar from '../component/CustomAvatar';
import '../../styles/Wardrobe.css';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const DanceSyncPage = () => {
  const [beatTimes, setBeatTimes] = useState([]);
  const [tempo, setTempo] = useState(null);
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
      if (data.tempo) setTempo(data.tempo);
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
  const handlePlay = () => {
    const audio = audioRef.current;
    if (!audio || !beatTimes.length) return;

    audio.currentTime = 0;
    audio.play();

    beatTimes.forEach((time) => {
      setTimeout(() => {
        if (avatarRef.current && avatarRef.current.animate) {
          avatarRef.current.animate();
        }
      }, time * 1000);
    });
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
                  <Canvas
                    style={{ height: '100%', width: '100%' }}
                    onCreated={() => setCanvasReady(true)}
                  >
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[5, 5, 5]} intensity={0.8} />
                    {canvasReady && (
                      useCustomAvatar && uploadedModel ? (
                        <CustomAvatar url={uploadedModel} />
                      ) : (
                        <Stage environment="city" intensity={0.8}>
                          <AnimatedAvatar ref={avatarRef} style={danceStyle} />
                        </Stage>
                      )
                    )}
                    <OrbitControls />
                  </Canvas>
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