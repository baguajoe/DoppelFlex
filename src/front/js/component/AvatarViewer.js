// src/front/js/component/AvatarViewer.js
// ===========================================================================
// CC4 Avatar Viewer — Full body Character Creator model with polygon aesthetic
//
// Features:
//   - Multi-mesh CC4 GLB support (body, eyes, teeth, tongue)
//   - Head / Full Body camera presets with smooth transitions
//   - Polygon mode: flat shading + edge overlay for stylized look
//   - FrontSide rendering only (no double-layer artifacts)
//   - 4 render presets: Textured, Polygon, Wireframe, X-Ray
// ===========================================================================

import React, { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  useGLTF,
  ContactShadows,
} from "@react-three/drei";
import * as THREE from "three";


// ──────────────────────────────────────────────────────────────────
// CC4 Model Constants (Z-up, Y-forward, units = cm)
// ──────────────────────────────────────────────────────────────────

const CC4_HEAD_Z = 167;       // eye-level height
const CC4_CHIN_Z = 155;       // chin
const CC4_TOP_Z = 179;        // top of head
const CC4_BODY_CENTER_Z = 90; // hip height


// ──────────────────────────────────────────────────────────────────
// Polygon-style Material Colors
// ──────────────────────────────────────────────────────────────────

const POLY_COLORS = {
  Body: 0xd4a574,      // warm skin
  Eye: 0xffffff,        // white
  Teeth: 0xf0e8e0,      // off-white
  Tongue: 0xc46060,     // pinkish
  default: 0xd4a574,
};

const POLY_EDGE_COLOR = "#2a2a2a";

function getPolyColor(meshName) {
  for (const [key, color] of Object.entries(POLY_COLORS)) {
    if (key !== "default" && meshName.includes(key)) return color;
  }
  return POLY_COLORS.default;
}


// ──────────────────────────────────────────────────────────────────
// Avatar Model Component
// ──────────────────────────────────────────────────────────────────

const AvatarModel = ({
  url,
  showWireframe = false,
  flatShading = true,
  showEdges = false,
  polygonMode = false,
}) => {
  const { scene } = useGLTF(url);
  const [edgeGeometries, setEdgeGeometries] = useState([]);

  useEffect(() => {
    if (!scene) return;
    const edges = [];

    scene.traverse((obj) => {
      if (!obj.isMesh) return;

      // Recompute normals for flat shading
      if (obj.geometry) {
        obj.geometry.computeVertexNormals();
      }

      const meshName = obj.name || obj.parent?.name || "";

      if (polygonMode) {
        // ── POLYGON AESTHETIC ──
        obj.material = new THREE.MeshStandardMaterial({
          color: getPolyColor(meshName),
          roughness: 0.85,
          metalness: 0.05,
          flatShading: true,
          wireframe: showWireframe,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
      } else {
        // ── TEXTURED MODE ──
        // Keep the GLB's PBR materials and UV textures intact
        const mat = obj.material;
        if (mat) {
          const materials = Array.isArray(mat) ? mat : [mat];
          materials.forEach((m) => {
            m.side = THREE.FrontSide;
            m.flatShading = flatShading;
            m.wireframe = showWireframe;
            m.polygonOffset = true;
            m.polygonOffsetFactor = 1;
            m.polygonOffsetUnits = 1;
            m.needsUpdate = true;
          });
        }
      }

      obj.renderOrder = 0;
      obj.castShadow = true;
      obj.receiveShadow = true;

      // Collect edge geometries for overlay
      if (showEdges && obj.geometry) {
        edges.push({
          geometry: new THREE.EdgesGeometry(obj.geometry, 20),
          matrix: obj.matrixWorld.clone(),
        });
      }
    });

    setEdgeGeometries(edges);
  }, [scene, showWireframe, flatShading, polygonMode, showEdges]);

  return (
    <group>
      <primitive object={scene} />
      {/* Edge overlay lines */}
      {showEdges &&
        edgeGeometries.map((edge, i) => (
          <lineSegments
            key={`edge-${i}`}
            geometry={edge.geometry}
            renderOrder={999}
          >
            <lineBasicMaterial
              color={POLY_EDGE_COLOR}
              linewidth={1}
              transparent
              opacity={0.35}
              depthTest={true}
            />
          </lineSegments>
        ))}
    </group>
  );
};


// ──────────────────────────────────────────────────────────────────
// Camera Controller — Smooth head ↔ body transitions
// ──────────────────────────────────────────────────────────────────

const CameraController = ({ viewMode, controlsRef }) => {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const animating = useRef(false);

  useEffect(() => {
    if (viewMode === "head") {
      targetPos.current.set(0, -70, CC4_HEAD_Z);
      targetLook.current.set(0, 0, CC4_HEAD_Z);
    } else {
      targetPos.current.set(0, -300, CC4_BODY_CENTER_Z);
      targetLook.current.set(0, 0, CC4_BODY_CENTER_Z);
    }
    animating.current = true;
  }, [viewMode]);

  useFrame(() => {
    if (!animating.current) return;

    camera.position.lerp(targetPos.current, 0.07);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLook.current, 0.07);
      controlsRef.current.update();
    }

    if (camera.position.distanceTo(targetPos.current) < 0.2) {
      animating.current = false;
    }
  });

  return null;
};


// ──────────────────────────────────────────────────────────────────
// Loading Placeholder
// ──────────────────────────────────────────────────────────────────

const LoadingFallback = () => (
  <mesh position={[0, 0, CC4_HEAD_Z]}>
    <icosahedronGeometry args={[4, 1]} />
    <meshStandardMaterial color="#444" wireframe flatShading />
  </mesh>
);


// ──────────────────────────────────────────────────────────────────
// Main Viewer Component
// ──────────────────────────────────────────────────────────────────

const AvatarViewer = ({ modelUrl }) => {
  const [viewMode, setViewMode] = useState("head");
  const [polygonMode, setPolygonMode] = useState(false);
  const [showWireframe, setShowWireframe] = useState(false);
  const [flatShading, setFlatShading] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const controlsRef = useRef();

  // ── Presets ──
  const presets = {
    textured: () => {
      setPolygonMode(false);
      setShowWireframe(false);
      setFlatShading(false);
      setShowEdges(false);
    },
    polygon: () => {
      setPolygonMode(true);
      setShowWireframe(false);
      setFlatShading(true);
      setShowEdges(true);
    },
    wireframe: () => {
      setPolygonMode(true);
      setShowWireframe(true);
      setFlatShading(true);
      setShowEdges(false);
    },
    xray: () => {
      setPolygonMode(false);
      setShowWireframe(true);
      setFlatShading(false);
      setShowEdges(false);
    },
  };

  const activePreset = polygonMode
    ? showWireframe
      ? "wireframe"
      : "polygon"
    : showWireframe
    ? "xray"
    : "textured";

  // ── Styles ──
  const container = {
    width: "100%",
    height: "700px",
    position: "relative",
    background: "linear-gradient(180deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%)",
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.06)",
  };

  const toolbar = {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    zIndex: 10,
    pointerEvents: "none",
  };

  const btnGroup = {
    display: "flex",
    gap: 4,
    pointerEvents: "auto",
  };

  const btn = (active) => ({
    padding: "5px 12px",
    fontSize: "11px",
    fontWeight: 600,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: active ? "#0d0d1a" : "rgba(255,255,255,0.6)",
    background: active
      ? "linear-gradient(135deg, #00d4ff, #0099cc)"
      : "rgba(255,255,255,0.06)",
    border: active
      ? "1px solid rgba(0,212,255,0.4)"
      : "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backdropFilter: "blur(8px)",
    outline: "none",
  });

  const label = {
    color: "rgba(255,255,255,0.3)",
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    marginBottom: 4,
    fontFamily: "'Inter', sans-serif",
  };

  const infoBar = {
    position: "absolute",
    bottom: 10,
    left: 14,
    color: "rgba(255,255,255,0.2)",
    fontSize: "10px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    letterSpacing: "0.5px",
    pointerEvents: "none",
  };

  if (!modelUrl) {
    return (
      <div style={{ ...container, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px" }}>
          No model loaded. Generate an avatar to preview.
        </p>
      </div>
    );
  }

  return (
    <div style={container}>
      {/* ── Top Toolbar ── */}
      <div style={toolbar}>
        {/* Left: View Mode */}
        <div>
          <div style={label}>View</div>
          <div style={btnGroup}>
            <button style={btn(viewMode === "head")} onClick={() => setViewMode("head")}>
              Head
            </button>
            <button style={btn(viewMode === "body")} onClick={() => setViewMode("body")}>
              Full Body
            </button>
          </div>
        </div>

        {/* Right: Render Style */}
        <div style={{ textAlign: "right" }}>
          <div style={label}>Render</div>
          <div style={btnGroup}>
            {Object.keys(presets).map((key) => (
              <button
                key={key}
                style={btn(activePreset === key)}
                onClick={presets[key]}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 3D Canvas ── */}
      <Canvas
        camera={{
          fov: 32,
          near: 0.1,
          far: 1000,
          position: [0, -70, CC4_HEAD_Z],
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        shadows
      >
        {/* Lighting rig */}
        <ambientLight intensity={0.35} />

        {/* Key light — front-left, above */}
        <directionalLight
          position={[8, -12, CC4_HEAD_Z + 25]}
          intensity={1.3}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Fill light — front-right */}
        <directionalLight
          position={[-6, -10, CC4_HEAD_Z + 5]}
          intensity={0.5}
        />

        {/* Rim light — behind, subtle blue */}
        <pointLight
          position={[0, 12, CC4_HEAD_Z + 10]}
          intensity={0.5}
          color="#4488ff"
        />

        {/* Bottom fill — prevents harsh chin shadows */}
        <pointLight
          position={[0, -5, CC4_CHIN_Z - 10]}
          intensity={0.2}
          color="#ffeedd"
        />

        <Environment preset="studio" />

        <CameraController viewMode={viewMode} controlsRef={controlsRef} />

        <Suspense fallback={<LoadingFallback />}>
          <AvatarModel
            url={modelUrl}
            showWireframe={showWireframe}
            flatShading={flatShading}
            showEdges={showEdges}
            polygonMode={polygonMode}
          />
        </Suspense>

        {/* Ground contact shadow */}
        <ContactShadows
          position={[0, 0, 0.5]}
          opacity={0.25}
          scale={250}
          blur={2.5}
          far={5}
        />

        <OrbitControls
          ref={controlsRef}
          target={[0, 0, CC4_HEAD_Z]}
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={8}
          maxDistance={400}
          minPolarAngle={Math.PI * 0.15}
          maxPolarAngle={Math.PI * 0.85}
          rotateSpeed={0.8}
          panSpeed={0.8}
          zoomSpeed={1.0}
        />
      </Canvas>

      {/* ── Bottom Info Bar ── */}
      <div style={infoBar}>
        DoppelFlex • CC4 Avatar •{" "}
        {viewMode === "head" ? "Head" : "Full Body"} •{" "}
        {activePreset.charAt(0).toUpperCase() + activePreset.slice(1)}
      </div>
    </div>
  );
};

export default AvatarViewer;