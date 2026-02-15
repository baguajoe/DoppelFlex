// src/front/js/component/AvatarViewer.js
import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  useGLTF,
  ContactShadows,
  Center,
  Bounds,
} from '@react-three/drei';

const AvatarModel = ({ url }) => {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
};

// Auto-fit camera to model bounds
const AutoFit = ({ children }) => {
  return (
    <Bounds fit clip observe margin={1.5}>
      {children}
    </Bounds>
  );
};

const AvatarViewer = ({ modelUrl }) => (
  <div style={{ width: '100%', height: '500px' }}>
    <Canvas
      shadows
      camera={{ position: [0, 0.85, 0.5], fov: 45, near: 0.001, far: 100 }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[2, 3, 3]}
          intensity={0.8}
          castShadow
        />
        <Environment preset="sunset" />
        <AutoFit>
          <Center>
            <AvatarModel url={modelUrl} />
          </Center>
        </AutoFit>
        <ContactShadows
          position={[0, -0.5, 0]}
          opacity={0.4}
          scale={2}
          blur={2}
          far={2}
        />
        <OrbitControls
          enableZoom={true}
          enablePan={true}
          minDistance={0.05}
          maxDistance={5}
          zoomSpeed={1.2}
          target={[0, 0, 0]}
        />
      </Suspense>
    </Canvas>
  </div>
);

export default AvatarViewer;