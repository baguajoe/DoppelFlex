import React, { useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment } from "@react-three/drei";

const ModelViewer = ({ url }) => {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={1.5} />;
};

const MultiViewUploadPage = () => {
  const [frontImage, setFrontImage] = useState(null);
  const [leftImage, setLeftImage] = useState(null);
  const [rightImage, setRightImage] = useState(null);
  const [meshUrl, setMeshUrl] = useState("");
  const [status, setStatus] = useState("");

  const handleSubmit = async () => {
    if (!frontImage || !leftImage || !rightImage) {
      setStatus("❌ Please select all 3 views.");
      return;
    }

    setStatus("⏳ Uploading and generating...");

    const formData = new FormData();
    formData.append("front", frontImage);
    formData.append("left", leftImage);
    formData.append("right", rightImage);

    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/generate-multiview-mesh`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.mesh_url) {
        setMeshUrl(data.mesh_url);
        setStatus("✅ Mesh generated!");
      } else {
        setStatus("❌ Failed to generate mesh.");
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Server error.");
    }
  };

  return (
    <div className="container mt-4">
      <h2>📸 Multi-View to 3D Mesh</h2>
      <p>Upload front, left, and right view images to generate a 3D model.</p>

      <div className="mb-3">
        <label>Front View:</label>
        <input type="file" accept="image/*" onChange={(e) => setFrontImage(e.target.files[0])} className="form-control" />
      </div>
      <div className="mb-3">
        <label>Left View:</label>
        <input type="file" accept="image/*" onChange={(e) => setLeftImage(e.target.files[0])} className="form-control" />
      </div>
      <div className="mb-3">
        <label>Right View:</label>
        <input type="file" accept="image/*" onChange={(e) => setRightImage(e.target.files[0])} className="form-control" />
      </div>

      <button className="btn btn-primary mt-2" onClick={handleSubmit}>Generate 3D Mesh</button>

      {status && <p className="mt-3">{status}</p>}

      {meshUrl && (
        <div className="mt-4">
          <h5>🎉 Generated Mesh Preview</h5>
          <a href={meshUrl} download className="btn btn-outline-success mb-3">Download GLB</a>

          <div style={{ height: "500px", border: "1px solid #ccc" }}>
            <Canvas>
              <Suspense fallback={null}>
                <ambientLight intensity={0.5} />
                <Environment preset="sunset" />
                <ModelViewer url={meshUrl} />
                <OrbitControls />
              </Suspense>
            </Canvas>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiViewUploadPage;
