// src/front/utils/smoothPose.js
// Smooth pose landmarks to reduce jitter in motion capture

/**
 * Apply exponential smoothing to pose landmarks
 * @param {Array} prevLandmarks - Previous frame landmarks
 * @param {Array} newLandmarks - Current frame landmarks
 * @param {number} smoothingFactor - 0 = use new data, 1 = use old data (default 0.5)
 * @returns {Array} - Smoothed landmarks
 */
export const smoothPose = (prevLandmarks, newLandmarks, smoothingFactor = 0.5) => {
  // If no previous data, return new landmarks as-is
  if (!prevLandmarks || !newLandmarks) return newLandmarks;
  if (prevLandmarks.length !== newLandmarks.length) return newLandmarks;

  return newLandmarks.map((newPoint, i) => {
    const prevPoint = prevLandmarks[i];
    
    // If previous point doesn't exist, use new point
    if (!prevPoint) return newPoint;

    // Only smooth if visibility is good
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

/**
 * Apply velocity-based smoothing (reduces jitter while maintaining responsiveness)
 * @param {Array} prevLandmarks - Previous frame landmarks
 * @param {Array} newLandmarks - Current frame landmarks
 * @param {Array} velocities - Previous velocities (modified in place)
 * @param {number} smoothing - Smoothing factor (default 0.5)
 * @returns {Array} - Smoothed landmarks
 */
export const smoothPoseWithVelocity = (prevLandmarks, newLandmarks, velocities = [], smoothing = 0.5) => {
  if (!prevLandmarks || !newLandmarks) return newLandmarks;
  if (prevLandmarks.length !== newLandmarks.length) return newLandmarks;

  return newLandmarks.map((newPoint, i) => {
    const prevPoint = prevLandmarks[i];
    if (!prevPoint) return newPoint;

    // Calculate velocity
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

    // Apply smoothed position
    return {
      x: prevPoint.x + velocities[i].x,
      y: prevPoint.y + velocities[i].y,
      z: prevPoint.z + velocities[i].z,
      visibility: newPoint.visibility,
    };
  });
};

/**
 * One Euro Filter for pose smoothing (adaptive smoothing)
 * Better for motion capture - smooth when slow, responsive when fast
 */
export class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = null;
    this.tPrev = null;
  }

  filter(x, t) {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = t;
      return x;
    }

    const dt = t - this.tPrev;
    if (dt <= 0) return this.xPrev;

    // Derivative
    const dx = (x - this.xPrev) / dt;
    const edx = this.exponentialSmoothing(this.alpha(this.dCutoff, dt), dx, this.dxPrev);

    // Adaptive cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filtered value
    const filtered = this.exponentialSmoothing(this.alpha(cutoff, dt), x, this.xPrev);

    // Update state
    this.xPrev = filtered;
    this.dxPrev = edx;
    this.tPrev = t;

    return filtered;
  }

  alpha(cutoff, dt) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  exponentialSmoothing(alpha, x, xPrev) {
    return alpha * x + (1 - alpha) * xPrev;
  }
}

/**
 * Apply One Euro Filter to all landmarks
 * @param {Array} landmarks - Current landmarks
 * @param {Array} filters - Array of filter objects (33 x 3 for x,y,z)
 * @param {number} timestamp - Current timestamp in seconds
 * @returns {Array} - Filtered landmarks
 */
export const smoothPoseOneEuro = (landmarks, filters, timestamp) => {
  if (!landmarks) return landmarks;

  // Initialize filters if needed
  if (filters.length === 0) {
    for (let i = 0; i < 33; i++) {
      filters.push({
        x: new OneEuroFilter(1.0, 0.007),
        y: new OneEuroFilter(1.0, 0.007),
        z: new OneEuroFilter(1.0, 0.007),
      });
    }
  }

  return landmarks.map((point, i) => ({
    x: filters[i].x.filter(point.x, timestamp),
    y: filters[i].y.filter(point.y, timestamp),
    z: filters[i].z.filter(point.z, timestamp),
    visibility: point.visibility,
  }));
};

export default smoothPose;