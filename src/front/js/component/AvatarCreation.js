// src/front/js/component/AvatarCreation.js
import React, { useState, useRef, useCallback } from "react";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

// Pipeline steps
const STEPS = {
  UPLOAD: 0,
  DETECTING: 1,
  FACE_DETECTED: 2,
  MESHING: 3,
  MESH_PREVIEW: 4,
  BUILDING_3D: 5,
  AVATAR_READY: 6,
};

const STEP_LABELS = [
  "Upload Selfie",
  "Face Detection",
  "Review Face",
  "Face Mesh",
  "Review Mesh",
  "3D Reconstruction",
  "Avatar Ready",
];

const AvatarCreation = ({ onAvatarCreated }) => {
  // File state
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Pipeline state
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  // Result state from each pipeline stage
  const [faceDetectionUrl, setFaceDetectionUrl] = useState(null); // processed image with face boxes
  const [avatarDbId, setAvatarDbId] = useState(null);             // avatar row ID in DB
  const [faceMeshUrl, setFaceMeshUrl] = useState(null);           // .glb face mesh URL
  const [fullAvatarUrl, setFullAvatarUrl] = useState(null);       // final 3D avatar URL

  // Validation
  const supportedTypes = ["image/jpeg", "image/png", "image/gif"];
  const maxSize = 5 * 1024 * 1024; // 5MB

  // ──────────────────────────────────────────────
  // Step 1: File Selection
  // ──────────────────────────────────────────────
  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    if (!supportedTypes.includes(selected.type)) {
      return setError("Invalid file type. Please upload JPEG, PNG, or GIF.");
    }
    if (selected.size > maxSize) {
      return setError("File too large. Maximum size is 5MB.");
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError("");
    // Reset downstream state
    setFaceDetectionUrl(null);
    setAvatarDbId(null);
    setFaceMeshUrl(null);
    setFullAvatarUrl(null);
    setStep(STEPS.UPLOAD);
  };

  // ──────────────────────────────────────────────
  // Step 2: Face Detection (/api/create-avatar)
  //   - Uploads image + user_id
  //   - MediaPipe detects face, draws bounding boxes
  //   - Saves avatar record in DB
  //   - Returns: avatar_url (processed image), avatar row in DB
  // ──────────────────────────────────────────────
  const handleDetectFace = useCallback(async () => {
    if (!file) return setError("Please select an image first.");

    const user_id = localStorage.getItem("user_id");
    if (!user_id) {
      return setError("You must be logged in. Please log in first.");
    }

    setStep(STEPS.DETECTING);
    setIsLoading(true);
    setError("");
    setProgress("Uploading image and detecting face...");

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("user_id", user_id);

      const res = await fetch(`${BACKEND}/api/create-avatar`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Face detection failed.");
      }

      // Build full URL for the processed face image
      const faceUrl = data.avatar_url.startsWith("http")
        ? data.avatar_url
        : `${BACKEND}${data.avatar_url}`;

      setFaceDetectionUrl(faceUrl);
      setAvatarDbId(data.avatar_id || null);
      setStep(STEPS.FACE_DETECTED);
      setProgress("");
    } catch (err) {
      console.error("Face detection error:", err);
      setError(err.message);
      setStep(STEPS.UPLOAD);
    } finally {
      setIsLoading(false);
    }
  }, [file]);

  // ──────────────────────────────────────────────
  // Step 3: Generate Face Mesh (/api/generate-avatar)
  //   - Sends image to MediaPipe FaceMesh (468 landmarks)
  //   - Builds triangulated mesh via Poisson reconstruction
  //   - Exports as .glb
  //   - Returns: avatar_model_url (.glb file)
  // ──────────────────────────────────────────────
  const handleGenerateMesh = useCallback(async () => {
    if (!file) return;

    setStep(STEPS.MESHING);
    setIsLoading(true);
    setError("");
    setProgress("Extracting 468 facial landmarks and building 3D face mesh...");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`${BACKEND}/api/generate-avatar`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Face mesh generation failed.");
      }

      const meshUrl = data.avatar_model_url.startsWith("http")
        ? data.avatar_model_url
        : `${BACKEND}${data.avatar_model_url}`;

      setFaceMeshUrl(meshUrl);
      setStep(STEPS.MESH_PREVIEW);
      setProgress("");
    } catch (err) {
      console.error("Mesh generation error:", err);
      setError(err.message);
      setStep(STEPS.FACE_DETECTED);
    } finally {
      setIsLoading(false);
    }
  }, [file]);

  // ──────────────────────────────────────────────
  // Step 4: Full 3D Reconstruction (/api/generate-depth-avatar)
  //   - Removes background (rembg)
  //   - Estimates depth map (MiDaS)
  //   - Generates point cloud → Poisson mesh
  //   - Exports .ply/.glb
  //   Falls back to /api/generate-avatar mesh if depth endpoint unavailable
  // ──────────────────────────────────────────────
  const handleBuildFullAvatar = useCallback(async () => {
    if (!file) return;

    setStep(STEPS.BUILDING_3D);
    setIsLoading(true);
    setError("");
    setProgress("Removing background → Estimating depth → Building 3D model...");

    try {
      const formData = new FormData();
      formData.append("image", file);

      // Try the depth-based reconstruction first
      let res = await fetch(`${BACKEND}/api/generate-depth-avatar`, {
        method: "POST",
        body: formData,
      });

      // Fallback: if depth endpoint doesn't exist, use generate-full-avatar
      if (res.status === 404) {
        setProgress("Using alternative reconstruction pipeline...");
        const formData2 = new FormData();
        formData2.append("image", file);
        res = await fetch(`${BACKEND}/api/generate-full-avatar`, {
          method: "POST",
          body: formData2,
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "3D reconstruction failed.");
      }

      // Handle both JSON response and blob response
      const contentType = res.headers.get("content-type") || "";
      let avatarUrl;

      if (contentType.includes("application/json")) {
        const data = await res.json();
        avatarUrl = data.avatar_model_url || data.avatar_url || data.model_url;
        if (avatarUrl && !avatarUrl.startsWith("http")) {
          avatarUrl = `${BACKEND}${avatarUrl}`;
        }
      } else {
        // Binary response (direct file download)
        const blob = await res.blob();
        avatarUrl = URL.createObjectURL(blob);
      }

      if (!avatarUrl) {
        throw new Error("No avatar URL returned from server.");
      }

      setFullAvatarUrl(avatarUrl);
      setStep(STEPS.AVATAR_READY);
      setProgress("");

      // Notify parent
      if (onAvatarCreated) {
        onAvatarCreated(avatarUrl, avatarDbId);
      }
    } catch (err) {
      console.error("3D reconstruction error:", err);
      setError(err.message);
      setStep(STEPS.MESH_PREVIEW);
    } finally {
      setIsLoading(false);
    }
  }, [file, avatarDbId, onAvatarCreated]);

  // ──────────────────────────────────────────────
  // Reset everything
  // ──────────────────────────────────────────────
  const handleStartOver = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setFaceDetectionUrl(null);
    setAvatarDbId(null);
    setFaceMeshUrl(null);
    setFullAvatarUrl(null);
    setStep(STEPS.UPLOAD);
    setError("");
    setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ──────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────
  const renderStepIndicator = () => (
    <div className="d-flex justify-content-between mb-4 flex-wrap gap-1">
      {STEP_LABELS.map((label, i) => {
        const isCompleted = step > i;
        const isCurrent = step === i;
        return (
          <div key={i} className="text-center" style={{ flex: "1 1 0", minWidth: "70px" }}>
            <div
              className={`rounded-circle d-inline-flex align-items-center justify-content-center mb-1 ${
                isCompleted
                  ? "bg-success text-white"
                  : isCurrent
                  ? "bg-primary text-white"
                  : "bg-light text-muted border"
              }`}
              style={{ width: "32px", height: "32px", fontSize: "12px" }}
            >
              {isCompleted ? "✓" : i + 1}
            </div>
            <div
              className={`small ${isCurrent ? "fw-bold text-primary" : isCompleted ? "text-success" : "text-muted"}`}
              style={{ fontSize: "11px" }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderLoadingOverlay = () =>
    isLoading && (
      <div className="card p-4 mb-3 text-center bg-light">
        <div className="spinner-border text-primary mb-3" role="status" />
        <p className="mb-0 fw-semibold">{progress || "Processing..."}</p>
        <p className="text-muted small mt-1">This may take 15–60 seconds depending on the step.</p>
      </div>
    );

  // ──────────────────────────────────────────────
  // Main render
  // ──────────────────────────────────────────────
  return (
    <div className="card p-4 mb-4" style={{ maxWidth: "700px" }}>
      <h4 className="mb-1">📸 Selfie → 3D Avatar</h4>
      <p className="text-muted small mb-3">
        Upload a clear front-facing photo. We'll detect your face, build a 3D mesh, and generate a full avatar.
      </p>

      {renderStepIndicator()}

      {/* Error display */}
      {error && (
        <div className="alert alert-danger py-2 small d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <button className="btn-close btn-sm" onClick={() => setError("")} />
        </div>
      )}

      {/* Loading overlay */}
      {renderLoadingOverlay()}

      {/* ── STEP 1: Upload ── */}
      {step === STEPS.UPLOAD && !isLoading && (
        <div>
          <label className="form-label fw-semibold">Select a selfie (JPEG, PNG, GIF — max 5MB)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif"
            onChange={handleFileChange}
            className="form-control mb-3"
          />

          {preview && (
            <div className="text-center mb-3">
              <img
                src={preview}
                alt="Selfie preview"
                className="rounded shadow-sm"
                style={{ maxWidth: "280px", maxHeight: "280px", objectFit: "cover" }}
              />
              <div className="mt-1 text-muted small">
                {file?.name} ({(file?.size / 1024 / 1024).toFixed(1)} MB)
              </div>
            </div>
          )}

          <button
            onClick={handleDetectFace}
            disabled={!file}
            className="btn btn-primary w-100"
          >
            🔍 Detect Face &amp; Continue
          </button>
        </div>
      )}

      {/* ── STEP 2: Face Detection Result ── */}
      {step === STEPS.FACE_DETECTED && !isLoading && (
        <div>
          <h5 className="mb-3">✅ Face Detected</h5>

          <div className="row g-3 mb-3">
            {/* Original */}
            <div className="col-6 text-center">
              <p className="small fw-semibold mb-1">Original</p>
              <img
                src={preview}
                alt="Original selfie"
                className="rounded border"
                style={{ maxWidth: "100%", maxHeight: "220px", objectFit: "cover" }}
              />
            </div>
            {/* Face detection overlay */}
            <div className="col-6 text-center">
              <p className="small fw-semibold mb-1">Face Detected</p>
              <img
                src={faceDetectionUrl}
                alt="Face detection result"
                className="rounded border"
                style={{ maxWidth: "100%", maxHeight: "220px", objectFit: "cover" }}
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
          </div>

          <p className="text-muted small">
            Face landmarks identified. Next we'll build a detailed 3D mesh from 468 facial points.
          </p>

          <div className="d-flex gap-2">
            <button onClick={handleGenerateMesh} className="btn btn-primary flex-grow-1">
              🧠 Generate Face Mesh
            </button>
            <button onClick={handleStartOver} className="btn btn-outline-secondary">
              🔄 Re-upload
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Face Mesh Preview ── */}
      {step === STEPS.MESH_PREVIEW && !isLoading && (
        <div>
          <h5 className="mb-3">🧩 Face Mesh Generated</h5>

          <div className="text-center mb-3 p-3 bg-light rounded">
            {faceMeshUrl ? (
              <div>
                <p className="small text-muted mb-2">
                  3D face mesh exported. Preview it below or continue to full avatar.
                </p>
                <a
                  href={faceMeshUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-primary mb-2"
                >
                  🔗 Open Face Mesh (.glb)
                </a>
                {/* If you have an AvatarViewer component, uncomment: */}
                {/* <AvatarViewer modelUrl={faceMeshUrl} /> */}
              </div>
            ) : (
              <p className="text-muted">No mesh preview available.</p>
            )}
          </div>

          <p className="text-muted small">
            Next step: remove background, estimate depth with MiDaS neural network, 
            and reconstruct a full 3D avatar with color and geometry.
          </p>

          <div className="d-flex gap-2">
            <button onClick={handleBuildFullAvatar} className="btn btn-primary flex-grow-1">
              🧍 Build Full 3D Avatar
            </button>
            <button onClick={() => setStep(STEPS.FACE_DETECTED)} className="btn btn-outline-secondary">
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Avatar Ready ── */}
      {step === STEPS.AVATAR_READY && !isLoading && (
        <div>
          <h5 className="text-success mb-3">🎉 Your 3D Avatar is Ready!</h5>

          <div className="text-center mb-3 p-3 bg-light rounded">
            {fullAvatarUrl && (
              <div>
                <p className="small text-muted mb-2">Full 3D avatar with depth, color, and geometry.</p>
                {/* If you have an AvatarViewer component, uncomment: */}
                {/* <AvatarViewer modelUrl={fullAvatarUrl} /> */}
                <a
                  href={fullAvatarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-primary"
                >
                  🔗 View 3D Model
                </a>
              </div>
            )}
          </div>

          <div className="d-flex flex-wrap gap-2">
            <a href={fullAvatarUrl} download className="btn btn-success flex-grow-1">
              ⬇️ Download Avatar
            </a>
            <a href="/customize" className="btn btn-outline-primary">
              🎨 Customize
            </a>
            <a href="/rig" className="btn btn-outline-primary">
              🦴 Rig for Animation
            </a>
            <a href="/motion" className="btn btn-outline-primary">
              🎬 Motion Capture
            </a>
            <button onClick={handleStartOver} className="btn btn-outline-secondary">
              🔄 Create Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvatarCreation;