// src/front/js/pages/UploadPage.js
// Complete Selfie-to-Avatar Upload Flow

import React, { useState, useCallback } from 'react';
import AvatarUpload from '../component/AvatarUpload';
import AvatarViewer from '../component/AvatarViewer';
import FaceDetectionPreview from '../component/FaceDetectionPreview';
import '../../styles/UploadPage.css';

const UploadPage = () => {
  // State management
  const [uploadedFile, setUploadedFile] = useState(null);
  const [facePreviewUrl, setFacePreviewUrl] = useState(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMeshUrl, setFaceMeshUrl] = useState(null);
  const [meshApproved, setMeshApproved] = useState(false);
  const [fullAvatarUrl, setFullAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [quality, setQuality] = useState('medium');
  const [debugInfo, setDebugInfo] = useState(null);

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

  // Step 1: Handle image upload
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

  // Step 2: Generate 3D mesh from face
  const handleGenerateMesh = async () => {
    if (!uploadedFile) return;
    
    setLoading(true);
    setLoadingStep('Generating 3D mesh...');
    setError('');
    
    const formData = new FormData();
    formData.append('image', uploadedFile);
    formData.append('quality', quality);

    try {
      const res = await fetch(`${backendUrl}/api/generate-avatar`, {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (res.ok && data.avatar_model_url) {
        const url = data.avatar_model_url.startsWith('http') 
          ? data.avatar_model_url 
          : `${backendUrl}${data.avatar_model_url}`;
        setFaceMeshUrl(url);
        setDebugInfo(prev => ({
          ...prev,
          meshUrl: url,
          depthMap: data.depth_map_url
        }));
        showToast('✅ 3D mesh generated successfully!');
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
    setFacePreviewUrl(null);
    setFaceDetected(false);
    setFaceMeshUrl(null);
    setMeshApproved(false);
    setFullAvatarUrl(null);
    setError('');
    setDebugInfo(null);
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

      {/* Step 1: Upload */}
      {!facePreviewUrl && (
        <div className="step-section">
          <h2 className="step-title">📸 Step 1: Upload Your Selfie</h2>
          <p className="step-description">
            Take a clear front-facing photo with good lighting. 
            Your face should be clearly visible.
          </p>
          <AvatarUpload onUploadComplete={handleUploadComplete} />
          
          <div className="tips-card">
            <h4>💡 Tips for best results:</h4>
            <ul>
              <li>Use natural lighting (avoid harsh shadows)</li>
              <li>Face the camera directly</li>
              <li>Keep a neutral expression</li>
              <li>Plain background works best</li>
            </ul>
          </div>
        </div>
      )}

      {/* Face Preview */}
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
            
            <div className="action-buttons">
              <button onClick={handleReset} className="btn-secondary">
                🔁 Upload Different Photo
              </button>
            </div>
          </div>

          {/* Quality Selection */}
          {faceDetected && (
            <div className="quality-section">
              <h3>Step 2: Generate 3D Mesh</h3>
              <p>Choose quality level and generate your 3D avatar mesh.</p>
              
              <div className="quality-options">
                <label className={`quality-option ${quality === 'low' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    value="low"
                    checked={quality === 'low'}
                    onChange={(e) => setQuality(e.target.value)}
                  />
                  <span className="quality-label">⚡ Fast</span>
                  <span className="quality-desc">Lower detail, quick processing</span>
                </label>
                
                <label className={`quality-option ${quality === 'medium' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    value="medium"
                    checked={quality === 'medium'}
                    onChange={(e) => setQuality(e.target.value)}
                  />
                  <span className="quality-label">⭐ Balanced</span>
                  <span className="quality-desc">Good detail, moderate time</span>
                </label>
                
                <label className={`quality-option ${quality === 'high' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    value="high"
                    checked={quality === 'high'}
                    onChange={(e) => setQuality(e.target.value)}
                  />
                  <span className="quality-label">💎 High Quality</span>
                  <span className="quality-desc">Best detail, longer processing</span>
                </label>
              </div>
              
              <button
                onClick={handleGenerateMesh}
                className="btn-primary btn-large"
                disabled={loading || !faceDetected}
              >
                {loading ? '⏳ Processing...' : '🧠 Generate 3D Mesh'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mesh Preview */}
      {faceMeshUrl && !meshApproved && (
        <div className="step-section">
          <h2 className="step-title">🎭 Step 3: Preview Your Mesh</h2>
          <p>Rotate the model to check all angles. Does it look good?</p>
          
          <div className="mesh-preview">
            <AvatarViewer modelUrl={faceMeshUrl} />
            
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