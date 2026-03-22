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
