// smoothPose.js — Complete pose smoothing utilities
// Location: src/front/utils/smoothPose.js
//
// Merged version: keeps all original functions (smoothPose, smoothPoseWithVelocity,
// smoothPoseOneEuro) plus new LandmarkSmoother-based convenience functions.
//
// OneEuroFilter class lives in OneEuroFilter.js (single source of truth).
// This file imports and re-exports it for backward compatibility.

import {
  OneEuroFilter,
  LandmarkSmoother,
  SMOOTHING_PRESETS,
} from './OneEuroFilter';

// Re-export so existing imports like `import { OneEuroFilter } from './smoothPose'` still work
export { OneEuroFilter, LandmarkSmoother, SMOOTHING_PRESETS };

// ─────────────────────────────────────────────────────────────
// 1. EXPONENTIAL SMOOTHING (simple, original)
// ─────────────────────────────────────────────────────────────
/**
 * Apply exponential smoothing to pose landmarks.
 * Good baseline. For better results use smoothPoseAdaptive().
 *
 * @param {Array} prevLandmarks  - Previous frame landmarks
 * @param {Array} newLandmarks   - Current frame landmarks
 * @param {number} smoothingFactor - 0 = use new data, 1 = use old data (default 0.5)
 * @returns {Array} Smoothed landmarks
 */
export const smoothPose = (prevLandmarks, newLandmarks, smoothingFactor = 0.5) => {
  if (!prevLandmarks || !newLandmarks) return newLandmarks;
  if (prevLandmarks.length !== newLandmarks.length) return newLandmarks;

  return newLandmarks.map((newPoint, i) => {
    const prevPoint = prevLandmarks[i];
    if (!prevPoint) return newPoint;

    // Only smooth if visibility is good on both frames
    const useSmoothing = newPoint.visibility > 0.5 && prevPoint.visibility > 0.5;
    const factor = useSmoothing ? smoothingFactor : 0;

    return {
      x: prevPoint.x * factor + newPoint.x * (1 - factor),
      y: prevPoint.y * factor + newPoint.y * (1 - factor),
      z: prevPoint.z * factor + newPoint.z * (1 - factor),
      visibility: newPoint.visibility,
    };
  });
};

// ─────────────────────────────────────────────────────────────
// 2. VELOCITY-BASED SMOOTHING
// ─────────────────────────────────────────────────────────────
/**
 * Apply velocity-based smoothing — reduces jitter while maintaining responsiveness.
 * Smooths the velocity (rate of change) rather than the position directly,
 * so fast movements stay snappy while stillness is stable.
 *
 * @param {Array} prevLandmarks - Previous frame landmarks
 * @param {Array} newLandmarks  - Current frame landmarks
 * @param {Array} velocities    - Previous velocities array (modified in place, pass [] first time)
 * @param {number} smoothing    - Velocity smoothing factor (default 0.5)
 * @returns {Array} Smoothed landmarks
 */
export const smoothPoseWithVelocity = (prevLandmarks, newLandmarks, velocities = [], smoothing = 0.5) => {
  if (!prevLandmarks || !newLandmarks) return newLandmarks;
  if (prevLandmarks.length !== newLandmarks.length) return newLandmarks;

  return newLandmarks.map((newPoint, i) => {
    const prevPoint = prevLandmarks[i];
    if (!prevPoint) return newPoint;

    // Get or initialize velocity for this landmark
    const vel = velocities[i] || { x: 0, y: 0, z: 0 };
    const newVel = {
      x: newPoint.x - prevPoint.x,
      y: newPoint.y - prevPoint.y,
      z: newPoint.z - prevPoint.z,
    };

    // Smooth velocity
    velocities[i] = {
      x: vel.x * smoothing + newVel.x * (1 - smoothing),
      y: vel.y * smoothing + newVel.y * (1 - smoothing),
      z: vel.z * smoothing + newVel.z * (1 - smoothing),
    };

    // Apply smoothed velocity to previous position
    return {
      x: prevPoint.x + velocities[i].x,
      y: prevPoint.y + velocities[i].y,
      z: prevPoint.z + velocities[i].z,
      visibility: newPoint.visibility,
    };
  });
};

// ─────────────────────────────────────────────────────────────
// 3. ONE EURO FILTER — External filters array version
//    (original API — you manage the filters array yourself)
// ─────────────────────────────────────────────────────────────
/**
 * Apply One Euro Filter to all landmarks using an external filters array.
 * This is the original API — you pass in and manage the filters array.
 *
 * Usage:
 *   const filters = [];  // created once, reused every frame
 *   const smoothed = smoothPoseOneEuro(landmarks, filters, performance.now() / 1000);
 *
 * @param {Array} landmarks - Current landmarks (33 points)
 * @param {Array} filters   - Array of filter objects (auto-initialized on first call)
 * @param {number} timestamp - Current time in seconds
 * @returns {Array} Filtered landmarks
 */
export const smoothPoseOneEuro = (landmarks, filters, timestamp) => {
  if (!landmarks) return landmarks;

  // Initialize filters on first call
  if (filters.length === 0) {
    for (let i = 0; i < 33; i++) {
      filters.push({
        x: new OneEuroFilter(1.0, 0.007, 1.0),
        y: new OneEuroFilter(1.0, 0.007, 1.0),
        z: new OneEuroFilter(1.0, 0.007, 1.0),
      });
    }
  }

  return landmarks.map((point, i) => {
    if (i >= filters.length) return point;
    return {
      x: filters[i].x.filter(point.x, timestamp),
      y: filters[i].y.filter(point.y, timestamp),
      z: filters[i].z.filter(point.z, timestamp),
      visibility: point.visibility,
    };
  });
};

// ─────────────────────────────────────────────────────────────
// 4. ADAPTIVE SMOOTHING — Preset-based, self-managing
//    (new API — handles its own filter state internally)
// ─────────────────────────────────────────────────────────────
let _smoother = null;
let _currentPreset = null;

/**
 * Smooth landmarks using a preset-based LandmarkSmoother.
 * Manages its own internal state — just call it every frame.
 *
 * Usage:
 *   const smoothed = smoothPoseAdaptive(landmarks, 'dance');
 *
 * @param {Array} landmarks - Current MediaPipe landmarks
 * @param {string} preset   - 'dance' | 'balanced' | 'cinematic' | 'legs'
 * @returns {Array} Smoothed landmarks
 */
export const smoothPoseAdaptive = (landmarks, preset = 'balanced') => {
  if (!landmarks) return landmarks;

  // Recreate smoother if preset changed
  if (!_smoother || _currentPreset !== preset) {
    _smoother = new LandmarkSmoother(
      SMOOTHING_PRESETS[preset] || SMOOTHING_PRESETS.balanced,
      33
    );
    _currentPreset = preset;
  }

  return _smoother.smooth(landmarks, performance.now() / 1000);
};

/**
 * Reset the internal adaptive smoother.
 * Call when restarting capture or switching modes.
 */
export const resetSmoother = () => {
  if (_smoother) _smoother.reset();
  _smoother = null;
  _currentPreset = null;
};

// ─────────────────────────────────────────────────────────────
// 5. VELOCITY CLAMPING — Hard limit on per-frame movement
//    Prevents wild jumps from bad MediaPipe detections
// ─────────────────────────────────────────────────────────────
/**
 * Clamp maximum movement per frame to prevent teleporting joints.
 * Apply AFTER smoothing as a safety net.
 *
 * @param {Array} prevLandmarks - Previous frame landmarks
 * @param {Array} newLandmarks  - Current (already smoothed) landmarks
 * @param {number} maxDelta     - Maximum allowed movement per axis per frame (default 0.05)
 * @returns {Array} Clamped landmarks
 */
export const clampVelocity = (prevLandmarks, newLandmarks, maxDelta = 0.05) => {
  if (!prevLandmarks || !newLandmarks) return newLandmarks;
  if (prevLandmarks.length !== newLandmarks.length) return newLandmarks;

  return newLandmarks.map((newPoint, i) => {
    const prevPoint = prevLandmarks[i];
    if (!prevPoint) return newPoint;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    return {
      x: prevPoint.x + clamp(newPoint.x - prevPoint.x, -maxDelta, maxDelta),
      y: prevPoint.y + clamp(newPoint.y - prevPoint.y, -maxDelta, maxDelta),
      z: prevPoint.z + clamp(newPoint.z - prevPoint.z, -maxDelta, maxDelta),
      visibility: newPoint.visibility,
    };
  });
};

// ─────────────────────────────────────────────────────────────
// 6. COMBINED PIPELINE — Run multiple smoothing stages in order
//    This is the recommended approach for best quality
// ─────────────────────────────────────────────────────────────
/**
 * Full smoothing pipeline: OneEuro → velocity clamp.
 * Best quality for production use.
 *
 * Usage:
 *   // First frame
 *   const pipeline = createSmoothingPipeline('balanced');
 *   // Every frame
 *   const smoothed = pipeline.process(rawLandmarks);
 *   // On restart
 *   pipeline.reset();
 *
 * @param {string} preset - 'dance' | 'balanced' | 'cinematic'
 * @param {number} maxVelocity - Max per-frame movement (default 0.08)
 * @returns {Object} { process(landmarks), reset() }
 */
export const createSmoothingPipeline = (preset = 'balanced', maxVelocity = 0.08) => {
  const presetConfig = SMOOTHING_PRESETS[preset] || SMOOTHING_PRESETS.balanced;
  const smoother = new LandmarkSmoother(presetConfig, 33);
  let prevLandmarks = null;

  return {
    /**
     * Process a frame of landmarks through the full pipeline.
     * @param {Array} landmarks - Raw MediaPipe landmarks
     * @returns {Array} Smoothed + clamped landmarks
     */
    process(landmarks) {
      if (!landmarks) return landmarks;

      // Stage 1: OneEuro adaptive smoothing
      const timestamp = performance.now() / 1000;
      let result = smoother.smooth(landmarks, timestamp);

      // Stage 2: Velocity clamping (safety net for wild jumps)
      if (prevLandmarks) {
        result = clampVelocity(prevLandmarks, result, maxVelocity);
      }

      prevLandmarks = result.map(lm => ({ ...lm })); // deep copy for next frame
      return result;
    },

    /**
     * Reset pipeline state (call on capture restart).
     */
    reset() {
      smoother.reset();
      prevLandmarks = null;
    },

    /**
     * Get the current preset name.
     */
    get preset() {
      return preset;
    },
  };
};

export default smoothPose;