// src/front/js/pages/UploadPage.js
// Complete Selfie-to-Avatar Upload Flow
// Now with template deformation + texture projection + multi-angle photos

import React, { useState, useCallback } from 'react';
import AvatarUpload from '../component/AvatarUpload';
import AvatarViewer from '../component/AvatarViewer';
import FaceDetectionPreview from '../component/FaceDetectionPreview';
import MultiPhotoUpload from '../component/MultiPhotoUpload';
import '../../styles/UploadPage.css';

const UploadPage = () => {
  // State management
  const [uploadedFile, setUploadedFile] = useState(null);
  const [sidePhotos, setSidePhotos] = useState({ left: null, right: null });
  const [facePreviewUrl, setFacePreviewUrl] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMeshUrl, setFaceMeshUrl] = useState(null);
  const [meshApproved, setMeshApproved] = useState(false);
  const [fullAvatarUrl, setFullAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [quality, setQuality] = useState('balanced');
  const [debugInfo, setDebugInfo] = useState(null);
  const [skinColor, setSkinColor] = useState(null);
  const [detectedSkinColor, setDetectedSkinColor] = useState(null);
  const [customSkinColor, setCustomSkinColor] = useState(null);

  // NEW: Template + texture state
  const [template, setTemplate] = useState('neutral');
  const [textureStyle, setTextureStyle] = useState('realistic');
  const [useTexture, setUseTexture] = useState(true);
  const [hairStyle, setHairStyle] = useState('short');
  const [hairColor, setHairColor] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';

  // Toast notification
  const showToast = (msg, isError = false) => {
    setToast(msg);
    if (isError) setError(msg);
    setTimeout(() => {
      setToast('');
      if (!isError) setError('');
    }, 4000);
  };

  // Progress tracking
  const getCurrentStep = () => {
    if (!facePreviewUrl) return 0;
    if (!faceDetected) return 0;
    if (!faceMeshUrl) return 1;
    if (!meshApproved) return 2;
    if (!fullAvatarUrl) return 3;
    return 4;
  };

  // Step 1: Handle image upload (single photo — legacy support)
  const handleUploadComplete = useCallback((previewUrl, file) => {
    setFacePreviewUrl(previewUrl);
    setUploadedFile(file);
    setFaceDetected(false);
    setFaceMeshUrl(null);
    setMeshApproved(false);
    setFullAvatarUrl(null);
    setError('');
    showToast('✅ Image uploaded - detecting face...');

    // Auto-detect face
    detectFace(file);
  }, []);

  // Handle multi-photo updates from MultiPhotoUpload
  const handlePhotosReady = useCallback((photos) => {
    if (photos.front && photos.front !== uploadedFile) {
      // New front photo
      const previewUrl = URL.createObjectURL(photos.front);
      setFacePreviewUrl(previewUrl);
      setUploadedFile(photos.front);
      setFaceDetected(false);
      setFaceMeshUrl(null);
      setMeshApproved(false);
      setFullAvatarUrl(null);
      setError('');
      showToast('✅ Front photo uploaded - detecting face...');
      detectFace(photos.front);
    }
    setSidePhotos({ left: photos.left || null, right: photos.right || null });
  }, [uploadedFile]);

  // Handle skin color change from picker
  const handleSkinColorChange = useCallback((hex) => {
    setCustomSkinColor(hex);
    setSkinColor(hex);
  }, []);

  // Step 1b: Detect face in image
  const detectFace = async (file) => {
    setLoading(true);
    setLoadingStep('Detecting face...');

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${backendUrl}/api/detect-face`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.detected) {
        setFaceDetected(true);
        setDebugInfo({
          confidence: (data.confidence * 100).toFixed(1) + '%',
          boundingBox: data.bounding_box
        });
        showToast(`✅ Face detected (${(data.confidence * 100).toFixed(0)}% confidence)`);
      } else {
        setFaceDetected(false);
        showToast(data.error || '❌ No face detected - try a clearer photo', true);
      }
    } catch (err) {
      console.error('Face detection error:', err);
      // If endpoint doesn't exist, assume face is there
      setFaceDetected(true);
      showToast('⚠️ Face detection unavailable - proceeding anyway');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Step 2: Generate 3D mesh — USES V2 TEMPLATE ENDPOINT
  const handleGenerateMesh = async () => {
    if (!uploadedFile) return;

    setLoading(true);
    setLoadingStep('Generating 3D head mesh...');
    setError('');

    const formData = new FormData();
    formData.append('image', uploadedFile);
    formData.append('quality', quality);
    formData.append('template', template);
    formData.append('texture_style', textureStyle);
    formData.append('use_texture', useTexture ? 'true' : 'false');
    formData.append('hair_style', hairStyle);

    // Add side photos if available
    if (sidePhotos.left) {
      formData.append('left', sidePhotos.left);
      setLoadingStep('Generating 3D head mesh (with side profiles)...');
    }
    if (sidePhotos.right) {
      formData.append('right', sidePhotos.right);
    }

    // Add color overrides if user customized
    if (customSkinColor) {
      formData.append('skin_color', customSkinColor);
    }
    if (hairColor) {
      formData.append('hair_color', hairColor);
    }

    try {
      const res = await fetch(`${backendUrl}/api/generate-avatar-v2`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.avatar_model_url) {
        const url = data.avatar_model_url.startsWith('http')
          ? data.avatar_model_url
          : `${backendUrl}${data.avatar_model_url}`;
        setFaceMeshUrl(url);

        // Store detected skin color from backend
        if (data.skin_color) {
          setDetectedSkinColor(data.skin_color.hex);
          if (!customSkinColor) {
            setSkinColor(data.skin_color.hex);
          }
        }

        // Store detected hair color
        if (data.hair_color) {
          setHairColor(data.hair_color.hex);
        }

        setDebugInfo(prev => ({
          ...prev,
          meshUrl: url,
          vertices: data.vertices,
          faces: data.faces,
          skinColor: data.skin_color,
          hairColor: data.hair_color,
          hairStyle: data.hair_style,
          textureStyle: data.texture_style,
          template: data.template,
          method: data.method,
        }));

        showToast(`✅ 3D head generated! (${data.method || 'template'})`);
      } else {
        throw new Error(data.error || 'Mesh generation failed');
      }
    } catch (err) {
      console.error('Mesh generation error:', err);
      showToast(`❌ ${err.message}`, true);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Step 3: Generate full body avatar
  const handleGenerateFullAvatar = async () => {
    if (!uploadedFile) return;

    setLoading(true);
    setLoadingStep('Building full avatar...');
    setError('');

    const formData = new FormData();
    formData.append('image', uploadedFile);
    formData.append('auto_rig', 'true');
    if (skinColor) {
      formData.append('skin_color', skinColor);
    }

    try {
      const res = await fetch(`${backendUrl}/api/generate-full-avatar`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok && data.avatar_url) {
        const url = data.avatar_url.startsWith('http')
          ? data.avatar_url
          : `${backendUrl}${data.avatar_url}`;
        setFullAvatarUrl(url);
        setDebugInfo(prev => ({
          ...prev,
          fullAvatarUrl: url,
          bones: data.bones
        }));
        showToast('🎉 Full avatar created!');
      } else {
        throw new Error(data.error || 'Avatar generation failed');
      }
    } catch (err) {
      console.error('Full avatar error:', err);
      showToast(`❌ ${err.message}`, true);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Export avatar
  const handleExport = async (format = 'glb') => {
    if (!fullAvatarUrl && !faceMeshUrl) return;

    setLoading(true);
    setLoadingStep(`Exporting as ${format.toUpperCase()}...`);

    try {
      const avatarPath = fullAvatarUrl || faceMeshUrl;

      const res = await fetch(`${backendUrl}/api/export-avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_path: avatarPath.replace(backendUrl, ''),
          format: format,
          rigging_preset: 'unity'
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my_avatar.${format}`;
        a.click();
        showToast(`✅ Downloaded as ${format.toUpperCase()}`);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }
    } catch (err) {
      console.error('Export error:', err);
      showToast(`❌ Export failed: ${err.message}`, true);
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Reset to start
  const handleReset = () => {
    setUploadedFile(null);
    setSidePhotos({ left: null, right: null });
    setFacePreviewUrl(null);
    setFaceDetected(false);
    setFaceMeshUrl(null);
    setMeshApproved(false);
    setFullAvatarUrl(null);
    setError('');
    setDebugInfo(null);
    setSkinColor(null);
    setDetectedSkinColor(null);
    setCustomSkinColor(null);
    setHairColor(null);
  };

  // ─── Shared styles for option selectors ───
  const optionCardStyle = (isSelected) => ({
    flex: 1,
    padding: '10px 8px',
    border: `1px solid ${isSelected ? 'rgba(139, 92, 246, 0.6)' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: '8px',
    background: isSelected ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.02)',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.2s',
    minWidth: '0',
  });

  const optionLabelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: '2px',
  };

  const optionDescStyle = {
    display: 'block',
    fontSize: '10px',
    color: '#777',
  };

  const sectionBoxStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '10px',
    padding: '14px',
    margin: '12px 0',
  };

  const sectionTitleStyle = {
    fontSize: '13px',
    fontWeight: 600,
    color: '#aaa',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const stepLabels = ['Upload', 'Detect', 'Mesh', 'Approve', 'Avatar'];

  return (
    <div className="upload-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-message ${error ? 'toast-error' : ''}`}>
          {toast}
        </div>
      )}

      {/* Progress Bar */}
      <div className="progress-bar">
        {stepLabels.map((label, index) => (
          <div key={index} className="progress-step-container">
            <div className={`progress-step ${getCurrentStep() >= index ? 'active' : ''}`}>
              {getCurrentStep() > index ? '✓' : index + 1}
            </div>
            <span className="step-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>{loadingStep}</p>
        </div>
      )}

      {/* Step 1: Upload (Multi-Photo) */}
      {!facePreviewUrl && (
        <div className="step-section">
          <h2 className="step-title">📸 Step 1: Upload Your Photos</h2>
          <p className="step-description">
            Upload a front-facing photo (required). Add side profiles for better 3D accuracy.
          </p>

          {/* Multi-Photo Upload Component */}
          <MultiPhotoUpload
            onPhotosReady={handlePhotosReady}
            onSkinColorChange={handleSkinColorChange}
            detectedSkinColor={detectedSkinColor}
          />

          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '16px 0', color: '#444', fontSize: '12px'
          }}>
            <div style={{ flex: 1, height: '1px', background: '#2a2a3e' }} />
            <span>or use single photo</span>
            <div style={{ flex: 1, height: '1px', background: '#2a2a3e' }} />
          </div>

          {/* Legacy single upload */}
          <AvatarUpload onUploadComplete={handleUploadComplete} />

          <div className="tips-card">
            <h4>💡 Tips for best results:</h4>
            <ul>
              <li>Use natural lighting (avoid harsh shadows)</li>
              <li>Face the camera directly for the front photo</li>
              <li>Keep a neutral expression</li>
              <li>Plain background works best</li>
              <li>Side photos: turn ~45° and keep face visible</li>
            </ul>
          </div>
        </div>
      )}

      {/* Face Preview + Skin Color */}
      {facePreviewUrl && !faceMeshUrl && (
        <div className="step-section">
          <h2 className="step-title">
            {faceDetected ? '✅ Face Detected!' : '🔍 Checking Image...'}
          </h2>

          <div className="preview-section">
            <FaceDetectionPreview imageUrl={facePreviewUrl} />

            {debugInfo?.confidence && (
              <div className="detection-info">
                <span className="confidence-badge">
                  Confidence: {debugInfo.confidence}
                </span>
              </div>
            )}

            {/* Skin Color Display */}
            {skinColor && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 14px', background: 'rgba(255,255,255,0.03)',
                borderRadius: '8px', margin: '10px 0',
              }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: skinColor, border: '2px solid rgba(255,255,255,0.15)',
                }} />
                <div style={{ fontSize: '12px', color: '#888' }}>
                  Skin tone: <span style={{ color: '#aaa', fontFamily: 'monospace' }}>{skinColor}</span>
                  {customSkinColor ? ' (custom)' : ' (auto-detected)'}
                </div>
              </div>
            )}

            {/* Side photos status */}
            {(sidePhotos.left || sidePhotos.right) && (
              <div style={{
                fontSize: '12px', color: '#10b981', padding: '6px 0',
              }}>
                📐 Side profile{sidePhotos.left && sidePhotos.right ? 's' : ''} added — enhanced 3D accuracy
              </div>
            )}

            <div className="action-buttons">
              <button onClick={handleReset} className="btn-secondary">
                🔁 Upload Different Photo
              </button>
            </div>
          </div>

          {/* Skin Color Customization */}
          {faceDetected && (
            <div style={sectionBoxStyle}>
              <MultiPhotoUpload
                onPhotosReady={handlePhotosReady}
                onSkinColorChange={handleSkinColorChange}
                detectedSkinColor={detectedSkinColor}
                existingFrontPhoto={uploadedFile}
              />
            </div>
          )}

          {/* ─── Generation Options ─── */}
          {faceDetected && (
            <div className="quality-section">
              <h3>Step 2: Generate 3D Head</h3>
              <p>Choose your options and generate your full 3D head mesh.</p>

              {/* Template Selection */}
              <div style={sectionBoxStyle}>
                <div style={sectionTitleStyle}>🧑 Base Template</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { id: 'neutral', label: '🧑 Neutral', desc: 'Balanced' },
                    { id: 'male', label: '👨 Male', desc: 'Wider jaw' },
                    { id: 'female', label: '👩 Female', desc: 'Softer features' },
                  ].map((t) => (
                    <div
                      key={t.id}
                      style={optionCardStyle(template === t.id)}
                      onClick={() => setTemplate(t.id)}
                    >
                      <span style={optionLabelStyle}>{t.label}</span>
                      <span style={optionDescStyle}>{t.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Texture Style */}
              <div style={sectionBoxStyle}>
                <div style={sectionTitleStyle}>🎨 Texture Style</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'realistic', label: '📷 Realistic', desc: 'Your actual face' },
                    { id: 'cartoon', label: '🖊️ Cartoon', desc: 'Bold outlines' },
                    { id: 'anime', label: '✨ Anime', desc: 'Smooth & stylized' },
                    { id: 'pixel', label: '👾 Pixel', desc: 'Retro 8-bit' },
                    { id: 'oil_paint', label: '🖌️ Oil Paint', desc: 'Artistic' },
                  ].map((s) => (
                    <div
                      key={s.id}
                      style={{ ...optionCardStyle(textureStyle === s.id && useTexture), flex: '1 1 calc(33% - 8px)' }}
                      onClick={() => { setTextureStyle(s.id); setUseTexture(true); }}
                    >
                      <span style={optionLabelStyle}>{s.label}</span>
                      <span style={optionDescStyle}>{s.desc}</span>
                    </div>
                  ))}
                  <div
                    style={{ ...optionCardStyle(!useTexture), flex: '1 1 calc(33% - 8px)' }}
                    onClick={() => setUseTexture(false)}
                  >
                    <span style={optionLabelStyle}>🎭 Solid Color</span>
                    <span style={optionDescStyle}>Skin tone only</span>
                  </div>
                </div>
              </div>

              {/* Hair Style */}
              <div style={sectionBoxStyle}>
                <div style={sectionTitleStyle}>💇 Hair Style</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'bald', label: '🧑‍🦲 Bald' },
                    { id: 'buzz', label: '✂️ Buzz' },
                    { id: 'short', label: '👦 Short' },
                    { id: 'medium', label: '🧑 Medium' },
                    { id: 'long', label: '👩 Long' },
                    { id: 'afro', label: '🧑‍🦱 Afro' },
                  ].map((h) => (
                    <div
                      key={h.id}
                      style={{ ...optionCardStyle(hairStyle === h.id), flex: '1 1 calc(33% - 8px)' }}
                      onClick={() => setHairStyle(h.id)}
                    >
                      <span style={{ ...optionLabelStyle, fontSize: '12px' }}>{h.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quality Selection */}
              <div style={sectionBoxStyle}>
                <div style={sectionTitleStyle}>⚙️ Quality</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { id: 'fast', label: '⚡ Fast', desc: 'Quick preview' },
                    { id: 'balanced', label: '⭐ Balanced', desc: 'Good detail' },
                    { id: 'high', label: '💎 High', desc: 'Max quality' },
                  ].map((q) => (
                    <div
                      key={q.id}
                      style={optionCardStyle(quality === q.id)}
                      onClick={() => setQuality(q.id)}
                    >
                      <span style={optionLabelStyle}>{q.label}</span>
                      <span style={optionDescStyle}>{q.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerateMesh}
                className="btn-primary btn-large"
                disabled={loading || !faceDetected}
                style={{ marginTop: '12px', width: '100%' }}
              >
                {loading ? '⏳ Processing...' : '🧠 Generate 3D Head'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mesh Preview */}
      {faceMeshUrl && !meshApproved && (
        <div className="step-section">
          <h2 className="step-title">🎭 Step 3: Preview Your Head Mesh</h2>
          <p>Rotate the model to check all angles. Does it look good?</p>

          <div className="mesh-preview">
            <AvatarViewer modelUrl={faceMeshUrl} />

            {/* Show skin color swatch next to preview */}
            {skinColor && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                justifyContent: 'center', padding: '8px 0',
              }}>
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  background: skinColor, border: '2px solid rgba(255,255,255,0.15)',
                }} />
                <span style={{ fontSize: '11px', color: '#666' }}>
                  Skin: {skinColor}
                </span>
              </div>
            )}

            <div className="action-buttons">
              <button
                onClick={() => setMeshApproved(true)}
                className="btn-primary"
              >
                ✅ Looks Good → Continue
              </button>
              <button
                onClick={() => {
                  setFaceMeshUrl(null);
                  setQuality('high');
                }}
                className="btn-secondary"
              >
                🔄 Try Again (Higher Quality)
              </button>
              <button onClick={handleReset} className="btn-ghost">
                ↩️ Start Over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Avatar Generation */}
      {meshApproved && !fullAvatarUrl && (
        <div className="step-section">
          <h2 className="step-title">🧍 Step 4: Create Full Body Avatar</h2>
          <p>We'll attach your face to a body template and add rigging for animation.</p>

          <div className="avatar-options">
            <button
              onClick={handleGenerateFullAvatar}
              className="btn-primary btn-large"
              disabled={loading}
            >
              {loading ? '⏳ Building Avatar...' : '🧍 Create Full Body Avatar'}
            </button>

            <p className="option-note">
              Or skip this step and export just the head mesh:
            </p>
            <button
              onClick={() => handleExport('glb')}
              className="btn-secondary"
              disabled={loading}
            >
              💾 Export Head Only (GLB)
            </button>
          </div>
        </div>
      )}

      {/* Final Avatar */}
      {fullAvatarUrl && (
        <div className="step-section">
          <h2 className="step-title">🎉 Your Avatar is Ready!</h2>

          <div className="final-avatar">
            <AvatarViewer modelUrl={fullAvatarUrl} />

            <div className="export-section">
              <h4>Download Your Avatar:</h4>
              <div className="export-buttons">
                <button onClick={() => handleExport('glb')} className="btn-primary">
                  📦 GLB (Recommended)
                </button>
                <button onClick={() => handleExport('obj')} className="btn-secondary">
                  📄 OBJ
                </button>
                <button onClick={() => handleExport('gltf')} className="btn-secondary">
                  🗂️ GLTF
                </button>
              </div>

              <p className="export-note">
                GLB works with Unity, Unreal, Blender, Three.js, and most 3D software.
              </p>
            </div>

            <div className="next-steps">
              <h4>What's Next?</h4>
              <div className="next-links">
                <a href="/motion" className="next-link">
                  🎥 Try Motion Capture
                </a>
                <a href="/dance-sync" className="next-link">
                  🎵 Dance Sync Mode
                </a>
                <a href="/avatar-customization" className="next-link">
                  👔 Customize Outfit
                </a>
              </div>
            </div>

            <button onClick={handleReset} className="btn-ghost">
              ➕ Create Another Avatar
            </button>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {debugInfo && (
        <details className="debug-panel">
          <summary>🔧 Debug Information</summary>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

export default UploadPage;