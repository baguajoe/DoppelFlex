// src/front/js/pages/CreateAvatarPage.js
import React, { useState } from "react";
import AvatarCreation from "../component/AvatarCreation";
import AvatarViewer from "../component/AvatarViewer";

const BACKEND = process.env.REACT_APP_BACKEND_URL;

const CreateAvatarPage = () => {
  // Avatar from creation pipeline
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarId, setAvatarId] = useState(null);

  // Rigging state
  const [isRigging, setIsRigging] = useState(false);
  const [riggedUrl, setRiggedUrl] = useState(null);
  const [rigError, setRigError] = useState("");

  // Export state
  const [exportFormat, setExportFormat] = useState("glb");
  const [isExporting, setIsExporting] = useState(false);

  // ──────────────────────────────────────────────
  // Callback from AvatarCreation when avatar is built
  // ──────────────────────────────────────────────
  const handleAvatarCreated = (url, dbId) => {
    setAvatarUrl(url);
    setAvatarId(dbId);
    setRiggedUrl(null);
    setRigError("");

    if (dbId) localStorage.setItem("avatar_id", dbId);
  };

  // ──────────────────────────────────────────────
  // Rig the avatar for skeletal animation
  // ──────────────────────────────────────────────
  const handleRigAvatar = async () => {
    const user_id = localStorage.getItem("user_id");
    if (!user_id) return setRigError("You must be logged in to rig an avatar.");
    if (!avatarId && !avatarUrl) return setRigError("No avatar to rig. Create one first.");

    setIsRigging(true);
    setRigError("");

    try {
      const res = await fetch(`${BACKEND}/api/rig-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatar_id: avatarId,
          avatar_url: avatarUrl,
          user_id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rigging failed.");

      const rigUrl = data.rig_url?.startsWith("http")
        ? data.rig_url
        : `${BACKEND}${data.rig_url}`;

      setRiggedUrl(rigUrl);
    } catch (err) {
      console.error("Rigging error:", err);
      setRigError(err.message);
    } finally {
      setIsRigging(false);
    }
  };

  // ──────────────────────────────────────────────
  // Export avatar in different formats
  // ──────────────────────────────────────────────
  const handleExport = async (format) => {
    if (!avatarUrl) return;

    setIsExporting(true);
    try {
      const res = await fetch(`${BACKEND}/api/export-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatar_id: avatarId,
          avatar_url: riggedUrl || avatarUrl,
          format: format,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }

      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `avatar.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
      alert(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="container mt-4" style={{ maxWidth: "900px" }}>
      <div className="mb-4">
        <h2>Create Your 3D Avatar</h2>
        <p className="text-muted">
          Upload a selfie to generate a personalized 3D avatar. Our pipeline detects your face,
          builds a mesh from 468 landmarks, then creates a full 3D model with depth and color.
        </p>
      </div>

      {/* ── Creation Pipeline ── */}
      <AvatarCreation onAvatarCreated={handleAvatarCreated} />

      {/* ── Post-Creation: Rigging ── */}
      {avatarUrl && (
        <div className="card p-4 mb-4">
          <h4 className="mb-3">🦴 Rig for Animation</h4>
          <p className="text-muted small">
            Add a skeleton to your avatar so it can be animated with motion capture or keyframes.
            This adds bones for the head, spine, arms, and legs.
          </p>

          {!riggedUrl ? (
            <div>
              <button
                onClick={handleRigAvatar}
                disabled={isRigging}
                className="btn btn-primary"
              >
                {isRigging ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Applying skeleton rig...
                  </>
                ) : (
                  "🦴 Rig Avatar for Animation"
                )}
              </button>

              {rigError && (
                <div className="alert alert-danger mt-3 py-2 small">{rigError}</div>
              )}
            </div>
          ) : (
            <div>
              <div className="alert alert-success py-2">
                ✅ Rigging complete! Your avatar now has a full skeletal rig.
              </div>

              {/* 3D Preview of rigged avatar */}
              <div className="bg-light rounded p-3 mb-3 text-center">
                {/* Uncomment if AvatarViewer supports .glb: */}
                {/* <AvatarViewer modelUrl={riggedUrl} /> */}
                <a
                  href={riggedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-primary"
                >
                  🔗 Preview Rigged Model
                </a>
              </div>

              {/* Next steps */}
              <div className="d-flex flex-wrap gap-2">
                <a href="/motion" className="btn btn-primary">
                  🎬 Try Live Motion Capture
                </a>
                <a href="/dance-sync" className="btn btn-outline-primary">
                  💃 Dance Sync
                </a>
                <a href={riggedUrl} download className="btn btn-success">
                  ⬇️ Download Rigged Avatar
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Post-Creation: Export Options ── */}
      {avatarUrl && (
        <div className="card p-4 mb-4">
          <h4 className="mb-3">📦 Export Avatar</h4>
          <p className="text-muted small">
            Download your avatar in different formats for use in game engines, 3D software, or web viewers.
          </p>

          <div className="d-flex flex-wrap gap-2">
            <button
              onClick={() => handleExport("glb")}
              disabled={isExporting}
              className="btn btn-outline-primary"
            >
              GLB (Web / Three.js)
            </button>
            <button
              onClick={() => handleExport("obj")}
              disabled={isExporting}
              className="btn btn-outline-primary"
            >
              OBJ (Blender / Maya)
            </button>
            <button
              onClick={() => handleExport("ply")}
              disabled={isExporting}
              className="btn btn-outline-primary"
            >
              PLY (Point Cloud)
            </button>
            <button
              onClick={() => handleExport("fbx")}
              disabled={isExporting}
              className="btn btn-outline-primary"
            >
              FBX (Unity / Unreal)
            </button>
          </div>

          {isExporting && (
            <div className="mt-2 text-muted small">
              <span className="spinner-border spinner-border-sm me-1" /> Preparing export...
            </div>
          )}
        </div>
      )}

      {/* ── Summary of What Happened ── */}
      {avatarUrl && (
        <div className="card p-4 mb-4 bg-light">
          <h5 className="mb-3">🔬 Pipeline Summary</h5>
          <div className="row g-3">
            <div className="col-md-6">
              <div className="small">
                <p className="mb-1">
                  <span className="text-success fw-bold">✓</span> <strong>Face Detection</strong>
                </p>
                <p className="text-muted ps-3 mb-2">
                  MediaPipe identified facial region and key landmarks.
                </p>

                <p className="mb-1">
                  <span className="text-success fw-bold">✓</span> <strong>Face Mesh</strong>
                </p>
                <p className="text-muted ps-3 mb-2">
                  468-point mesh built using MediaPipe FaceMesh with Poisson surface reconstruction.
                </p>

                <p className="mb-1">
                  <span className="text-success fw-bold">✓</span> <strong>3D Reconstruction</strong>
                </p>
                <p className="text-muted ps-3 mb-2">
                  Background removed (rembg), depth estimated (MiDaS), point cloud → mesh via Open3D.
                </p>
              </div>
            </div>
            <div className="col-md-6">
              <div className="small">
                <p className="mb-1">
                  <span className={riggedUrl ? "text-success fw-bold" : "text-muted"}>
                    {riggedUrl ? "✓" : "○"}
                  </span>{" "}
                  <strong>Rigging</strong>
                </p>
                <p className="text-muted ps-3 mb-2">
                  {riggedUrl
                    ? "Skeletal rig applied with bone hierarchy for animation."
                    : "Optional: Add skeleton for motion capture and animation."}
                </p>

                <p className="mb-1">
                  <span className="text-muted">○</span> <strong>Customization</strong>
                </p>
                <p className="text-muted ps-3 mb-2">
                  Adjust skin tone, outfit, accessories, height, and weight.
                </p>

                <p className="mb-1">
                  <span className="text-muted">○</span> <strong>Motion Capture</strong>
                </p>
                <p className="text-muted ps-3 mb-2">
                  Animate your avatar in real-time using webcam pose tracking.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateAvatarPage;