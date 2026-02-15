// src/front/js/component/Avatar3DPreview.js
// Real Three.js 3D avatar preview for body customizer
// Loads a GLB/GLTF model and applies bone scaling in real-time

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { applyProportionsToAvatar, proportionsToBoneScales } from "../utils/bodyPresets";

const Avatar3DPreview = ({ proportions, modelUrl }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const avatarRef = useRef(null);
  const animFrameRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a14);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.0, 3.5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.update();
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 3, 2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6366f1, 0.3);
    fillLight.position.set(-2, 1, -1);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xa78bfa, 0.4);
    rimLight.position.set(0, 2, -3);
    scene.add(rimLight);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a14,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper (subtle)
    const gridHelper = new THREE.GridHelper(4, 20, 0x1a1a2e, 0x111122);
    gridHelper.position.y = 0.001;
    scene.add(gridHelper);

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load model when URL changes
  useEffect(() => {
    if (!modelUrl || !sceneRef.current) return;

    setLoading(true);
    setError(null);

    // Remove existing avatar
    if (avatarRef.current) {
      sceneRef.current.remove(avatarRef.current);
      avatarRef.current = null;
      setModelLoaded(false);
    }

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Auto-scale and center the model
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale to ~1.7 units tall (average human height in scene)
        const targetHeight = 1.7;
        const scale = targetHeight / size.y;
        model.scale.setScalar(scale);

        // Center horizontally and place feet on ground
        model.position.x = -center.x * scale;
        model.position.y = -box.min.y * scale;
        model.position.z = -center.z * scale;

        // Enable shadows
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        sceneRef.current.add(model);
        avatarRef.current = model;
        setModelLoaded(true);
        setLoading(false);

        // Apply current proportions immediately
        if (proportions) {
          applyProportionsToAvatar(model, proportions);
        }

        // Log available bones for debugging
        console.log("Avatar bones found:");
        model.traverse((child) => {
          if (child.isBone) {
            console.log(`  - ${child.name}`);
          }
        });
      },
      (progress) => {
        // Loading progress
      },
      (err) => {
        console.error("Model load error:", err);
        setError("Failed to load 3D model");
        setLoading(false);
      }
    );
  }, [modelUrl]);

  // Apply proportions when they change
  useEffect(() => {
    if (avatarRef.current && proportions) {
      applyProportionsToAvatar(avatarRef.current, proportions);
    }
  }, [proportions]);

  return (
    <div className="avatar-3d-preview-live" ref={containerRef}>
      {/* Overlay states */}
      {loading && (
        <div className="avatar-3d-overlay">
          <div className="avatar-3d-spinner" />
          <p>Loading model...</p>
        </div>
      )}
      {error && (
        <div className="avatar-3d-overlay">
          <p style={{ color: "#f87171" }}>{error}</p>
        </div>
      )}
      {!modelUrl && !loading && (
        <div className="avatar-3d-overlay">
          <div className="avatar-3d-icon">🧍</div>
          <p>No model loaded</p>
          <p className="avatar-3d-hint">
            Upload a GLB/GLTF avatar or select<br />
            one from your saved avatars
          </p>
        </div>
      )}
    </div>
  );
};

export default Avatar3DPreview;