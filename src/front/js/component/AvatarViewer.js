// src/components/AvatarViewer.js
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  useGLTF,
  ContactShadows,
} from '@react-three/drei';

const AvatarModel = ({ url }) => {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
};

const AvatarViewer = ({ modelUrl }) => (
  <div style={{ width: '100%', height: '500px' }}>
    <Canvas
      shadows
      camera={{ position: [0, 1.5, 3], fov: 45 }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={0.8}
          castShadow
        />
        <Environment preset="sunset" />
        <AvatarModel url={modelUrl} />
        <ContactShadows
          position={[0, -1.4, 0]}
          opacity={0.6}
          scale={10}
          blur={2.5}
          far={4.5}
        />
        <OrbitControls />
      </Suspense>
    </Canvas>
  </div>
);

export default AvatarViewer;
