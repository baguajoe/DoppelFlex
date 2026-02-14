// src/front/js/pages/IllustrationTo3DPage.js
// Upload a 2D illustration (head or full body) and convert it to a 3D model
// Shows: upload → depth preview → 3D model viewer → export options

import React, { useState, useRef } from "react";
import AvatarViewer from "../component/AvatarViewer";

const IllustrationTo3DPage = () => {
  // State
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [illustrationType, setIllustrationType] = useState("full_body");
  const [exportFormat, setExportFormat] = useState("glb");
  const [addBack, setAddBack] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const fileInputRef = useRef(null);

  // Handle file selection
  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    // Validate
    const validTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!validTypes.includes(selected.type)) {
      setError("Please upload a PNG, JPG, or WEBP image.");
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setResult(null);
    setError("");
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) {
      const fakeEvent = { target: { files: [dropped] } };
      handleFileSelect(fakeEvent);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Convert illustration to 3D
  const handleConvert = async () => {
    if (!file) return;

    setLoading(true);
    setError("");
    setProgress("Removing background...");

    const formData = new FormData();
    formData.append("image", file);
    formData.append("type", illustrationType);
    formData.append("format", exportFormat);
    formData.append("add_back", addBack.toString());

    try {
      // Simulate progress steps (actual processing happens server-side)
      const progressSteps = [
        { msg: "Removing background...", delay: 1000 },
        { msg: "Enhancing illustration edges...", delay: 1500 },
        { msg: "Estimating depth map...", delay: 2000 },
        { msg: "Building 3D point cloud...", delay: 2500 },
        { msg: "Reconstructing mesh surface...", delay: 1500 },
        { msg: "Finalizing model...", delay: 1000 },
      ];

      // Run progress animation alongside fetch
      const progressPromise = (async () => {
        for (const step of progressSteps) {
          setProgress(step.msg);
          await new Promise((r) => setTimeout(r, step.delay));
        }
      })();

      const fetchPromise = fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/illustration-to-3d`,
        { method: "POST", body: formData }
      );

      const [, response] = await Promise.all([progressPromise, fetchPromise]);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        setResult(null);
      } else {
        setResult({
          modelUrl: `${process.env.REACT_APP_BACKEND_URL}${data.model_url}`,
          depthPreviewUrl: `${process.env.REACT_APP_BACKEND_URL}${data.depth_preview_url}`,
          stats: data.stats,
        });
        setProgress("✅ Conversion complete!");
      }
    } catch (err) {
      console.error("Conversion error:", err);
      setError("Failed to convert illustration. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Reset everything
  const handleReset = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
    setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Current step for progress indicator
  const getStep = () => {
    if (!file) return 0;
    if (!result) return 1;
    return 2;
  };

  const stepLabels = ["Upload", "Convert", "Preview & Export"];

  return (
    <div className="container mt-4">
      <h2>🎨 Illustration to 3D</h2>
      <p>
        Upload a hand-drawn or digital 2D illustration and convert it into a 3D
        model. Works with head portraits and full-body character art.
      </p>

      {/* Progress Steps */}
      <div className="d-flex gap-2 mb-4">
        {stepLabels.map((label, i) => (
          <div key={i} className="d-flex align-items-center">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: getStep() >= i ? "#4A90D9" : "#333",
                color: "white",
                fontWeight: "bold",
                fontSize: 14,
              }}
            >
              {getStep() > i ? "✓" : i + 1}
            </div>
            <span className="ms-1 me-3" style={{ color: getStep() >= i ? "#fff" : "#666" }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {!result && (
        <div className="row">
          <div className="col-md-6">
            {/* Upload Area */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed #4A90D9",
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                cursor: "pointer",
                background: previewUrl ? "transparent" : "#1a1a2e",
                minHeight: 300,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: 400,
                    borderRadius: 8,
                    objectFit: "contain",
                  }}
                />
              ) : (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🖼️</div>
                  <p>Drag & drop your illustration here</p>
                  <p className="text-muted small">or click to browse (PNG, JPG, WEBP)</p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />

            {previewUrl && (
              <button className="btn btn-outline-secondary btn-sm mt-2" onClick={handleReset}>
                🔄 Choose Different Image
              </button>
            )}
          </div>

          {/* Settings */}
          <div className="col-md-6">
            <div
              style={{
                background: "#1a1a2e",
                borderRadius: 12,
                padding: 24,
                border: "1px solid #333",
              }}
            >
              <h5>⚙️ Conversion Settings</h5>

              {/* Illustration Type */}
              <div className="mb-3">
                <label className="form-label">Illustration Type</label>
                <div className="d-flex gap-2">
                  <button
                    className={`btn ${illustrationType === "head" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setIllustrationType("head")}
                  >
                    🗣️ Head / Face
                  </button>
                  <button
                    className={`btn ${illustrationType === "full_body" ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setIllustrationType("full_body")}
                  >
                    🧍 Full Body
                  </button>
                </div>
                <small className="text-muted">
                  {illustrationType === "head"
                    ? "Higher detail depth estimation for facial features"
                    : "Optimized for full character proportions"}
                </small>
              </div>

              {/* Export Format */}
              <div className="mb-3">
                <label className="form-label">Export Format</label>
                <select
                  className="form-select"
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  style={{ background: "#2a2a3e", color: "#fff", border: "1px solid #444" }}
                >
                  <option value="glb">GLB (Universal - Three.js, Unity, Blender)</option>
                  <option value="obj">OBJ (Blender, Maya, 3ds Max)</option>
                  <option value="ply">PLY (Point Cloud / Research)</option>
                </select>
              </div>

              {/* Back Face Toggle */}
              <div className="mb-3 form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="addBackCheck"
                  checked={addBack}
                  onChange={(e) => setAddBack(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="addBackCheck">
                  Add back face (makes model solid instead of flat)
                </label>
              </div>

              {/* Tips */}
              <div
                style={{
                  background: "#2a2a3e",
                  borderRadius: 8,
                  padding: 16,
                  marginTop: 16,
                }}
              >
                <h6>💡 Tips for best results</h6>
                <ul className="small text-muted mb-0" style={{ paddingLeft: 20 }}>
                  <li>Use clear outlines and defined shapes</li>
                  <li>Transparent or solid backgrounds work best</li>
                  <li>Shading/shadows in your art improves depth</li>
                  <li>Front-facing poses convert most accurately</li>
                  <li>Higher resolution = more detail in the 3D model</li>
                </ul>
              </div>

              {/* Convert Button */}
              <button
                className="btn btn-primary btn-lg w-100 mt-3"
                onClick={handleConvert}
                disabled={!file || loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    {progress}
                  </>
                ) : (
                  "🚀 Convert to 3D"
                )}
              </button>

              {error && (
                <div className="alert alert-danger mt-3 mb-0">{error}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Results */}
      {result && (
        <div>
          <div className="row">
            {/* Original + Depth Side by Side */}
            <div className="col-md-4">
              <h5>📷 Original</h5>
              <img
                src={previewUrl}
                alt="Original illustration"
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid #333",
                  objectFit: "contain",
                  maxHeight: 300,
                  background: "#1a1a2e",
                }}
              />
            </div>

            <div className="col-md-4">
              <h5>🌊 Depth Map</h5>
              <img
                src={result.depthPreviewUrl}
                alt="Depth estimation"
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid #333",
                  objectFit: "contain",
                  maxHeight: 300,
                  background: "#1a1a2e",
                }}
              />
            </div>

            <div className="col-md-4">
              <h5>📊 Model Stats</h5>
              <div
                style={{
                  background: "#1a1a2e",
                  borderRadius: 8,
                  padding: 16,
                  border: "1px solid #333",
                }}
              >
                <p><strong>Vertices:</strong> {result.stats.vertices?.toLocaleString()}</p>
                <p><strong>Faces:</strong> {result.stats.faces?.toLocaleString()}</p>
                <p><strong>Format:</strong> {result.stats.format?.toUpperCase()}</p>
                <p><strong>Type:</strong> {result.stats.type === "head" ? "Head/Face" : "Full Body"}</p>
              </div>
            </div>
          </div>

          {/* 3D Preview */}
          <div className="mt-4">
            <h5>🧊 3D Model Preview</h5>
            <p className="text-muted small">Click and drag to rotate. Scroll to zoom.</p>
            <div
              style={{
                border: "1px solid #333",
                borderRadius: 12,
                overflow: "hidden",
                height: 500,
                background: "#0a0a1a",
              }}
            >
              <AvatarViewer modelUrl={result.modelUrl} />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="d-flex gap-2 flex-wrap mt-3 mb-4">
            <a
              href={result.modelUrl}
              download
              className="btn btn-success"
            >
              📥 Download 3D Model ({result.stats.format?.toUpperCase()})
            </a>

            <button
              className="btn btn-outline-primary"
              onClick={() => {
                // Navigate to rig page with the model
                window.location.href = `/rig?model=${encodeURIComponent(result.modelUrl)}`;
              }}
            >
              🦴 Rig for Animation
            </button>

            <button
              className="btn btn-outline-primary"
              onClick={() => {
                window.location.href = `/motion?model=${encodeURIComponent(result.modelUrl)}`;
              }}
            >
              🎥 Use in Motion Capture
            </button>

            <button className="btn btn-outline-secondary" onClick={handleReset}>
              🔄 Convert Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IllustrationTo3DPage;