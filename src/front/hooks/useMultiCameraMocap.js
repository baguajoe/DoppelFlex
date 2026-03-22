// useMultiCameraMocap.js
// Multi-camera mocap hook — manages multiple camera streams
import { useState, useRef, useCallback, useEffect } from 'react';

const useMultiCameraMocap = () => {
  const [cameras, setCameras]           = useState([]);
  const [streams, setStreams]           = useState({});
  const [isReady, setIsReady]           = useState(false);
  const [error, setError]               = useState(null);
  const streamRefs = useRef({});

  // Enumerate available cameras
  const enumerateCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);
      return videoDevices;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, []);

  // Start a specific camera stream
  const startCamera = useCallback(async (deviceId, role = 'body') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: 640, height: 480 },
      });
      streamRefs.current[role] = stream;
      setStreams(prev => ({ ...prev, [role]: stream }));
      setIsReady(true);
      return stream;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Stop a specific camera stream
  const stopCamera = useCallback((role = 'body') => {
    const stream = streamRefs.current[role];
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      delete streamRefs.current[role];
      setStreams(prev => { const s = { ...prev }; delete s[role]; return s; });
    }
  }, []);

  // Stop all streams on unmount
  useEffect(() => {
    return () => {
      Object.values(streamRefs.current).forEach(stream => {
        stream.getTracks().forEach(t => t.stop());
      });
    };
  }, []);

  // Combine landmarks from multiple cameras (simple average for now)
  const combineLandmarks = useCallback((landmarksA, landmarksB) => {
    if (!landmarksA) return landmarksB;
    if (!landmarksB) return landmarksA;
    return landmarksA.map((lm, i) => ({
      x: (lm.x + (landmarksB[i]?.x || lm.x)) / 2,
      y: (lm.y + (landmarksB[i]?.y || lm.y)) / 2,
      z: (lm.z + (landmarksB[i]?.z || lm.z)) / 2,
      visibility: Math.max(lm.visibility || 0, landmarksB[i]?.visibility || 0),
    }));
  }, []);

  return {
    cameras,
    streams,
    isReady,
    error,
    enumerateCameras,
    startCamera,
    stopCamera,
    combineLandmarks,
  };
};

export default useMultiCameraMocap;
