// src/front/js/component/AvatarPreview.js
// Restored: 3D Canvas rendering avatar + outfit, dark-themed, with error boundary

import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Stage } from '@react-three/drei';

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const AvatarModel = () => {
  try {
    const { scene } = useGLTF(`${BACKEND}/static/models/xbot_avatar.glb`);
    return <primitive object={scene} scale={1.5} />;
  } catch {
    return null;
  }
};

const OutfitModel = ({ file }) => {
  try {
    const { scene } = useGLTF(`${BACKEND}/static/outfits/${file}`);
    return <primitive object={scene} scale={1.5} position={[0, 0, 0]} />;
  } catch {
    return null;
  }
};

export const AvatarPreview = ({ outfitFile }) => {
  const [loadError, setLoadError] = useState(false);

  if (!outfitFile) return null;

  if (loadError) {
    return (
      <div style={{
        width: '100%',
        height: '320px',
        background: '#111118',
        border: '1px solid #2a2a3e',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: '13px',
        gap: '8px',
      }}>
        <span style={{ fontSize: '32px' }}>👕</span>
        <span>3D preview unavailable</span>
        <span style={{ fontSize: '11px', color: '#555' }}>
          Outfit file: <code style={{ color: '#a78bfa' }}>{outfitFile}</code>
        </span>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      height: '320px',
      background: '#0d0d14',
      border: '1px solid #2a2a3e',
      borderRadius: '12px',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <Canvas
        camera={{ position: [0, 1.5, 3], fov: 50 }}
        onError={() => setLoadError(true)}
        style={{ height: '100%' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.9} />
          <directionalLight position={[0, 5, 5]} intensity={0.6} />
          <Stage environment="city" intensity={0.5}>
            <AvatarModel />
            <OutfitModel file={outfitFile} />
          </Stage>
          <OrbitControls enableZoom enablePan={false} />
        </Suspense>
      </Canvas>

      {/* Label overlay */}
      <div style={{
        position: 'absolute',
        bottom: '8px',
        left: '8px',
        background: 'rgba(0,0,0,0.6)',
        color: '#aaa',
        fontSize: '10px',
        padding: '3px 8px',
        borderRadius: '6px',
        backdropFilter: 'blur(4px)',
      }}>
        🎮 Drag to rotate · Scroll to zoom
      </div>
    </div>
  );
};

export default AvatarPreview;