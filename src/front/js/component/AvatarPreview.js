// src/pages/AvatarPreviewPage.js
import React, { useEffect, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";

// ─── Consistent model path ───
const DEFAULT_MODEL = "/static/models/Y_Bot.glb";

// Component that loads and applies skin color to meshes
const ModelViewer = ({ url, skinColor }) => {
  const { scene } = useGLTF(url);

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.name.toLowerCase().includes("skin")) {
        child.material.color.set(skinColor);
      }
    });
  }, [scene, skinColor]);

  return <primitive object={scene} scale={1.5} />;
};

const AvatarPreviewPage = () => {
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [riggedUrl, setRiggedUrl] = useState(null);
  const [skinColor, setSkinColor] = useState("#c68642"); // Default brown tone
  const [message, setMessage] = useState("");
  const [usageInfo, setUsageInfo] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
  const user_id = localStorage.getItem("user_id");
  const avatar_id = localStorage.getItem("avatar_id");

  useEffect(() => {
    const raw = localStorage.getItem("avatar_url");
    if (raw) setAvatarUrl(raw);

    const storedRig = localStorage.getItem("rigged_url");
    if (storedRig) {
      setRiggedUrl(storedRig);
    } else if (avatar_id && user_id) {
      rigAvatar(); // Auto-rig
    }
  }, [avatar_id, user_id]);

  const rigAvatar = async () => {
    setMessage("⚙️ Rigging avatar...");
    try {
      const res = await fetch(`${backendUrl}/rig-avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_id, user_id }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Rigging failed.");
        setMessage("");
        return;
      }

      setRiggedUrl(data.rig_url);
      localStorage.setItem("rigged_url", data.rig_url);
      setUsageInfo({ used: data.usage, limit: data.limit });
      setMessage("✅ Rigging successful!");
    } catch (err) {
      console.error("Error during rigging", err);
      setMessage("❌ Error while rigging.");
    }
  };

  const renderCanvas = (url, label) => (
    <div style={{ width: "48%" }}>
      <h5>{label}</h5>
      <Canvas style={{ height: "400px" }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <Environment preset="sunset" />
          <ModelViewer url={url} skinColor={skinColor} />
          <OrbitControls />
        </Suspense>
      </Canvas>
      <a href={url} download className="btn btn-sm btn-outline-info mt-2">
        Download
      </a>
    </div>
  );

  return (
    <div className="container mt-4">
      <h3>🧍 Avatar Preview</h3>

      {/* Skin tone picker */}
      <div className="mb-3">
        <label className="form-label">🎨 Select Skin Tone:</label>
        <input
          type="color"
          value={skinColor}
          onChange={(e) => setSkinColor(e.target.value)}
          className="form-control form-control-color"
        />
      </div>

      <div className="d-flex justify-content-between flex-wrap gap-3">
        {avatarUrl && renderCanvas(avatarUrl, ".PLY (Raw Mesh)")}
        {riggedUrl && renderCanvas(riggedUrl, ".GLB (Rigged Avatar)")}
      </div>

      {!riggedUrl && (
        <button className="btn btn-warning mt-4" onClick={rigAvatar}>
          🔁 Retry Rigging
        </button>
      )}

      {usageInfo && (
        <p className="mt-2 text-muted">
          {usageInfo.used} of {usageInfo.limit} rigging sessions used
        </p>
      )}

      {message && <p className="mt-3">{message}</p>}
    </div>
  );
};

export default AvatarPreviewPage;