#!/bin/bash
# Fix missing hook files that are blocking compilation

echo "⚙️  Creating missing hooks..."

# ── useFullPerformanceMocap ──────────────────────────────────
cat > src/front/hooks/useFullPerformanceMocap.js << 'EOF'
// useFullPerformanceMocap.js
// Full performance capture hook — body + face + hands combined
import { useState, useRef, useCallback } from 'react';

const useFullPerformanceMocap = () => {
  const [bodyLandmarks, setBodyLandmarks]       = useState(null);
  const [faceExpressions, setFaceExpressions]   = useState(null);
  const [handData, setHandData]                 = useState(null);
  const [isCapturing, setIsCapturing]           = useState(false);
  const [fps, setFps]                           = useState(0);
  const recordingRef = useRef([]);
  const [isRecording, setIsRecording]           = useState(false);

  const startCapture = useCallback(() => setIsCapturing(true), []);
  const stopCapture  = useCallback(() => { setIsCapturing(false); setBodyLandmarks(null); }, []);

  const startRecording = useCallback(() => {
    recordingRef.current = [];
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    return recordingRef.current;
  }, []);

  const onBodyFrame = useCallback((frame) => {
    setBodyLandmarks(frame.landmarks || frame);
    if (isRecording) {
      recordingRef.current.push({
        time: performance.now() / 1000,
        body: frame.landmarks || frame,
        face: faceExpressions,
        hands: handData,
      });
    }
  }, [isRecording, faceExpressions, handData]);

  const onFaceFrame = useCallback((expr) => {
    setFaceExpressions(expr);
  }, []);

  const onHandFrame = useCallback((hands) => {
    setHandData(hands);
  }, []);

  return {
    bodyLandmarks,
    faceExpressions,
    handData,
    isCapturing,
    isRecording,
    fps,
    startCapture,
    stopCapture,
    startRecording,
    stopRecording,
    onBodyFrame,
    onFaceFrame,
    onHandFrame,
    recordedFrames: recordingRef.current,
  };
};

export default useFullPerformanceMocap;
EOF
echo "  ✅ useFullPerformanceMocap.js created"

# ── useMultiCameraMocap ──────────────────────────────────────
cat > src/front/hooks/useMultiCameraMocap.js << 'EOF'
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
EOF
echo "  ✅ useMultiCameraMocap.js created"

# ── useHandMocap (safety check — create if missing) ──────────
if [ ! -f "src/front/hooks/useHandMocap.js" ]; then
cat > src/front/hooks/useHandMocap.js << 'EOF'
// useHandMocap.js
// Hand tracking hook using MediaPipe Hands
import { useState, useRef, useCallback } from 'react';

const useHandMocap = () => {
  const [handData, setHandData]     = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const handsRef = useRef(null);
  const cameraRef = useRef(null);

  const startTracking = useCallback(async (videoElement) => {
    if (!videoElement) return;
    setIsTracking(true);
    // MediaPipe Hands loaded via CDN in the component that uses this hook
    // Stub implementation — real tracking requires MediaPipe Hands CDN script
    console.log('[useHandMocap] Hand tracking started (stub)');
  }, []);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    setHandData(null);
    if (handsRef.current) {
      handsRef.current.close?.();
      handsRef.current = null;
    }
  }, []);

  return { handData, isTracking, startTracking, stopTracking };
};

export default useHandMocap;
EOF
  echo "  ✅ useHandMocap.js created"
else
  echo "  ✅ useHandMocap.js already exists"
fi

# ── Commit ───────────────────────────────────────────────────
echo ""
echo "⚙️  Committing..."
git add src/front/hooks/
git commit -m "fix: add missing hooks (useFullPerformanceMocap, useMultiCameraMocap, useHandMocap)"
git push

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅  Missing hooks created and pushed!"
echo "    Frontend should compile now."
echo "════════════════════════════════════════════════════════"
