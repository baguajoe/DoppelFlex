// OneEuroFilter.js — Single source of truth for all smoothing primitives
// Location: src/front/utils/OneEuroFilter.js
//
// The OneEuro filter is the gold standard for real-time signal smoothing.
// It adapts its smoothing dynamically:
//   - When you're still → heavy smoothing (removes jitter)
//   - When you're moving fast → light smoothing (preserves responsiveness)
//
// Paper: "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input"
// Casiez et al., 2012
//
// This file is imported by:
//   - AvatarRigPlayer3D.js (per-bone axis filtering)
//   - MotionCaptureSystem.js (full landmark smoothing)
//   - smoothPose.js (smoothPoseOneEuro wrapper)

// ─────────────────────────────────────────────────────────────
// LOW PASS FILTER (internal building block)
// ─────────────────────────────────────────────────────────────
class LowPassFilter {
  constructor(alpha = 0.5) {
    this.alpha = alpha;
    this.initialized = false;
    this.prev = 0;
  }

  filter(value) {
    if (!this.initialized) {
      this.initialized = true;
      this.prev = value;
      return value;
    }
    const result = this.alpha * value + (1 - this.alpha) * this.prev;
    this.prev = result;
    return result;
  }

  setAlpha(alpha) {
    this.alpha = Math.max(0, Math.min(1, alpha));
  }

  reset() {
    this.initialized = false;
    this.prev = 0;
  }
}

// ─────────────────────────────────────────────────────────────
// ONE EURO FILTER
// ─────────────────────────────────────────────────────────────
export class OneEuroFilter {
  /**
   * @param {number} minCutoff - Minimum cutoff frequency (Hz). Lower = more smoothing when still.
   *                              Recommended: 0.5–1.5 for mocap. Default: 1.0
   * @param {number} beta      - Speed coefficient. Higher = less lag when moving fast.
   *                              Recommended: 0.001–0.01 for mocap. Default: 0.007
   * @param {number} dCutoff   - Cutoff for derivative filter. Usually leave at 1.0.
   */
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
    this.freq = 30; // initial estimate, auto-updates
  }

  _alpha(cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / this.freq;
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Filter a single value.
   * @param {number} value - Raw input value
   * @param {number} timestamp - Time in seconds (use performance.now() / 1000)
   * @returns {number} Smoothed value
   */
  filter(value, timestamp) {
    if (this.lastTime !== null && timestamp > this.lastTime) {
      this.freq = 1.0 / (timestamp - this.lastTime);
    }
    this.lastTime = timestamp;

    // Estimate derivative (speed of change)
    const prevX = this.xFilter.prev;
    const dx = this.xFilter.initialized
      ? (value - prevX) * this.freq
      : 0;

    // Smooth the derivative
    this.dxFilter.setAlpha(this._alpha(this.dCutoff));
    const edx = this.dxFilter.filter(dx);

    // Adaptive cutoff: higher speed → higher cutoff → less smoothing
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.xFilter.setAlpha(this._alpha(cutoff));

    return this.xFilter.filter(value);
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

// ─────────────────────────────────────────────────────────────
// LANDMARK SMOOTHER — filters all 33 landmarks × 3 axes
// Used by MotionCaptureSystem.js and AvatarRigPlayer3D.js
// ─────────────────────────────────────────────────────────────
export class LandmarkSmoother {
  /**
   * @param {Object} options - { minCutoff, beta, dCutoff }
   * @param {number} numLandmarks - Number of landmarks (33 for MediaPipe Pose)
   */
  constructor(options = {}, numLandmarks = 33) {
    this.options = { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0, ...options };
    this.numLandmarks = numLandmarks;
    this.filters = {};

    // Pre-create filters for all landmarks × all axes
    for (let i = 0; i < numLandmarks; i++) {
      this.filters[`${i}_x`] = new OneEuroFilter(this.options.minCutoff, this.options.beta, this.options.dCutoff);
      this.filters[`${i}_y`] = new OneEuroFilter(this.options.minCutoff, this.options.beta, this.options.dCutoff);
      this.filters[`${i}_z`] = new OneEuroFilter(this.options.minCutoff, this.options.beta, this.options.dCutoff);
    }
  }

  /**
   * Smooth an entire frame of landmarks.
   * @param {Array} landmarks - Array of {x, y, z, visibility} objects
   * @param {number} timestamp - Time in seconds
   * @returns {Array} Smoothed landmarks (new objects, originals untouched)
   */
  smooth(landmarks, timestamp) {
    if (!landmarks || landmarks.length === 0) return landmarks;

    return landmarks.map((lm, i) => {
      if (i >= this.numLandmarks) return lm;

      return {
        x: this.filters[`${i}_x`].filter(lm.x, timestamp),
        y: this.filters[`${i}_y`].filter(lm.y, timestamp),
        z: this.filters[`${i}_z`].filter(lm.z, timestamp),
        visibility: lm.visibility, // don't smooth visibility
      };
    });
  }

  /**
   * Reset all filters (e.g., when user restarts capture)
   */
  reset() {
    for (const filter of Object.values(this.filters)) {
      filter.reset();
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SMOOTHING PRESETS for different use cases
// ─────────────────────────────────────────────────────────────
export const SMOOTHING_PRESETS = {
  // Minimal smoothing — preserves fast dance moves, some jitter remains
  dance: { minCutoff: 1.5, beta: 0.01, dCutoff: 1.0 },

  // Balanced — good for general mocap (default)
  balanced: { minCutoff: 1.0, beta: 0.007, dCutoff: 1.0 },

  // Heavy smoothing — very stable, slight lag on fast moves
  cinematic: { minCutoff: 0.5, beta: 0.004, dCutoff: 1.0 },

  // Tuned for legs (MediaPipe legs are extra noisy)
  legs: { minCutoff: 0.8, beta: 0.005, dCutoff: 1.0 },
};

export default OneEuroFilter;