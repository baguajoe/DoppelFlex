// ModelViewer.js
import React, { useEffect } from "react";
import { useGLTF } from "@react-three/drei";

const ModelViewer = ({ url, skinColor = "#f5cba7" }) => {
  const { scene } = useGLTF(url);

  useEffect(() => {
    if (!scene) return;

    // Apply skin color to body/face meshes
    scene.traverse((child) => {
      if (child.isMesh) {
        const name = child.name.toLowerCase();
        if (name.includes("body") || name.includes("head") || name.includes("face")) {
          if (child.material?.color) {
            child.material.color.set(skinColor);
          }
        }
      }
    });
  }, [scene, skinColor]);

  return <primitive object={scene} scale={1.5} />;
};

if (name.includes("shirt") || name.includes("clothes") || name.includes("outfit")) {
    if (child.material?.color) {
      child.material.color.set(outfitColor);
    }
  }
  

export default ModelViewer;
