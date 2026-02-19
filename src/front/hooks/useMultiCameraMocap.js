/**
 * calibration.js
 * 
 * Multi-camera calibration system for DoppelFlex.
 * Uses a T-pose reference to compute camera extrinsic parameters
 * (position and rotation) relative to a world coordinate system.
 * 
 * Flow:
 * 1. User stands in T-pose
 * 2. All cameras capture landmarks simultaneously
 * 3. System matches observed 2D points to known 3D T-pose skeleton
 * 4. Solves for each camera's projection matrix using DLT
 * 5. Decomposes into intrinsic + extrinsic parameters
 * 6. Stores calibration for use during live mocap
 */

import {
  matMul,
  transpose,
  vecNorm,
  vecNormalize,
  cross,
  dot,
  vecSub,
  estimateIntrinsics,
  buildProjectionMatrix,
  triangulateLandmarks,
  computeReprojectionError,
} from "./triangulate";

// ============================================================
// Reference T-Pose Skeleton (in meters, centered at origin)
// ============================================================

/**
 * Standard T-pose 3D positions for MediaPipe Pose landmarks.
 * Based on average adult proportions (170cm / 5'7").
 * Origin at hip center, Y-up, Z-forward (facing camera 1).
 * 
 * These are the "ground truth" 3D positions we use to solve
 * for camera positions. The closer these match the user's actual
 * proportions, the better the calibration.
 * 
 * Key landmarks used for calibration (high confidence, easy to detect):
 * 11, 12 = shoulders
 * 13, 14 = elbows  
 * 15, 16 = wrists
 * 23, 24 = hips
 * 25, 26 = knees
 * 27, 28 = ankles
 */
const TPOSE_REFERENCE = {
  // Head / Face (rough positions — less reliable for calibration)
  0: [0, 1.65, 0.05],       // nose
  1: [-0.03, 1.68, 0.03],   // left eye inner
  2: [0.03, 1.68, 0.03],    // right eye inner
  3: [-0.05, 1.68, 0.02],   // left eye
  4: [0.05, 1.68, 0.02],    // right eye
  5: [-0.07, 1.67, 0.01],   // left eye outer
  6: [0.07, 1.67, 0.01],    // right eye outer
  7: [-0.09, 1.64, -0.02],  // left ear
  8: [0.09, 1.64, -0.02],   // right ear
  9: [-0.03, 1.60, 0.04],   // mouth left
  10: [0.03, 1.60, 0.04],   // mouth right

  // Upper body — PRIMARY calibration landmarks
  11: [-0.20, 1.45, 0],     // left shoulder
  12: [0.20, 1.45, 0],      // right shoulder
  13: [-0.55, 1.45, 0],     // left elbow (arms straight out)
  14: [0.55, 1.45, 0],      // right elbow
  15: [-0.85, 1.45, 0],     // left wrist
  16: [0.85, 1.45, 0],      // right wrist

  // Hands (approximate in T-pose)
  17: [-0.88, 1.44, -0.02], // left pinky
  18: [0.88, 1.44, -0.02],  // right pinky
  19: [-0.90, 1.46, 0.02],  // left index
  20: [0.90, 1.46, 0.02],   // right index
  21: [-0.87, 1.46, 0.04],  // left thumb
  22: [0.87, 1.46, 0.04],   // right thumb

  // Lower body — PRIMARY calibration landmarks
  23: [-0.10, 0.90, 0],     // left hip
  24: [0.10, 0.90, 0],      // right hip
  25: [-0.10, 0.48, 0.02],  // left knee
  26: [0.10, 0.48, 0.02],   // right knee
  27: [-0.10, 0.05, 0.02],  // left ankle
  28: [0.10, 0.05, 0.02],   // right ankle
  29: [-0.10, 0.02, 0.08],  // left heel
  30: [0.10, 0.02, 0.08],   // right heel
  31: [-0.10, 0.01, 0.15],  // left foot index
  32: [0.10, 0.01, 0.15],   // right foot index
};

// Landmarks that are most reliable for calibration
// (large body parts, easy to detect, spread across the body)
const CALIBRATION_LANDMARKS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

/**
 * Scale the T-pose reference skeleton to match the user's approximate height.
 * @param {number} userHeight - User's height in meters (default 1.70)
 * @returns {Object} Scaled T-pose positions
 */
export function scaleTPoseReference(userHeight = 1.70) {
  const scale = userHeight / 1.70;
  const scaled = {};
  for (const [idx, pos] of Object.entries(TPOSE_REFERENCE)) {
    scaled[idx] = [pos[0] * scale, pos[1] * scale, pos[2] * scale];
  }
  return scaled;
}

// ============================================================
// DLT Camera Calibration
// ============================================================

/**
 * Solve for a camera's 3x4 projection matrix using DLT.
 * 
 * Given N point correspondences between known 3D world points
 * and observed 2D image points, solve for P such that:
 *   [u]     [X]
 *   [v] = P [Y]
 *   [1]     [Z]
 *           [1]
 * 
 * Each correspondence gives 2 equations. Need >= 6 correspondences
 * for the 11 unknowns in P (12 entries, but scale is arbitrary).
 * 
 * @param {Array} correspondences - Array of { world: [X,Y,Z], image: [u,v] }
 * @returns {Array} 3x4 projection matrix P
 */
function solveDLT(correspondences) {
  if (correspondences.length < 6) {
    throw new Error(`Need at least 6 point correspondences, got ${correspondences.length}`);
  }

  // Build the DLT equation system
  // For each point: 2 rows in the matrix A
  const A = [];

  for (const { world, image } of correspondences) {
    const [X, Y, Z] = world;
    const [u, v] = image;

    // Row 1: [X Y Z 1 0 0 0 0 -uX -uY -uZ -u]
    A.push([X, Y, Z, 1, 0, 0, 0, 0, -u * X, -u * Y, -u * Z, -u]);

    // Row 2: [0 0 0 0 X Y Z 1 -vX -vY -vZ -v]
    A.push([0, 0, 0, 0, X, Y, Z, 1, -v * X, -v * Y, -v * Z, -v]);
  }

  // Solve A * p = 0 using SVD (find null space)
  const At = transpose(A);
  const AtA = matMul(At, A);
  const { eigenvalues, eigenvectors } = jacobiEigenFull(AtA);

  // Find eigenvector with smallest eigenvalue
  let minIdx = 0;
  let minVal = Math.abs(eigenvalues[0]);
  for (let i = 1; i < eigenvalues.length; i++) {
    if (Math.abs(eigenvalues[i]) < minVal) {
      minVal = Math.abs(eigenvalues[i]);
      minIdx = i;
    }
  }

  // Extract solution vector
  const p = [];
  for (let i = 0; i < 12; i++) {
    p.push(eigenvectors[i][minIdx]);
  }

  // Reshape into 3x4 matrix
  const P = [
    [p[0], p[1], p[2], p[3]],
    [p[4], p[5], p[6], p[7]],
    [p[8], p[9], p[10], p[11]],
  ];

  // Normalize so that ||P[2][0:3]|| = 1 (makes the scale consistent)
  const scale = Math.sqrt(P[2][0] ** 2 + P[2][1] ** 2 + P[2][2] ** 2);
  if (scale > 1e-10) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        P[i][j] /= scale;
      }
    }
  }

  // Ensure positive depth (objects in front of camera)
  // Check if a known point projects to positive depth
  const testPt = correspondences[0].world;
  const depth = P[2][0] * testPt[0] + P[2][1] * testPt[1] + P[2][2] * testPt[2] + P[2][3];
  if (depth < 0) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        P[i][j] *= -1;
      }
    }
  }

  return P;
}

/**
 * Jacobi eigenvalue algorithm (full version for 12x12 matrices).
 */
function jacobiEigenFull(M) {
  const n = M.length;
  const maxIter = 200;
  const tol = 1e-12;

  const A = M.map((row) => [...row]);
  const V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let iter = 0; iter < maxIter; iter++) {
    let maxOff = 0;
    let p = 0;
    let q = 1;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(A[i][j]) > maxOff) {
          maxOff = Math.abs(A[i][j]);
          p = i;
          q = j;
        }
      }
    }

    if (maxOff < tol) break;

    const theta =
      Math.abs(A[p][p] - A[q][q]) < tol
        ? Math.PI / 4
        : 0.5 * Math.atan2(2 * A[p][q], A[p][p] - A[q][q]);

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const App = A[p][p];
    const Aqq = A[q][q];
    const Apq = A[p][q];

    A[p][p] = c * c * App + 2 * s * c * Apq + s * s * Aqq;
    A[q][q] = s * s * App - 2 * s * c * Apq + c * c * Aqq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const Aip = A[i][p];
        const Aiq = A[i][q];
        A[i][p] = c * Aip + s * Aiq;
        A[p][i] = A[i][p];
        A[i][q] = -s * Aip + c * Aiq;
        A[q][i] = A[i][q];
      }
    }

    for (let i = 0; i < n; i++) {
      const Vip = V[i][p];
      const Viq = V[i][q];
      V[i][p] = c * Vip + s * Viq;
      V[i][q] = -s * Vip + c * Viq;
    }
  }

  const eigenvalues = [];
  for (let i = 0; i < n; i++) {
    eigenvalues.push(A[i][i]);
  }

  return { eigenvalues, eigenvectors: V };
}

/**
 * Decompose a 3x4 projection matrix into K (intrinsic), R (rotation), t (translation).
 * Uses RQ decomposition on the left 3x3 submatrix.
 * 
 * P = K * [R | t]
 * P[:, 0:3] = K * R
 * P[:, 3] = K * t
 */
export function decomposeProjectionMatrix(P) {
  // Extract the 3x3 part M = P[:, 0:3]
  const M = [
    [P[0][0], P[0][1], P[0][2]],
    [P[1][0], P[1][1], P[1][2]],
    [P[2][0], P[2][1], P[2][2]],
  ];

  // RQ decomposition via flipped QR
  // Flip M, do QR, flip back
  const Mflip = [
    [M[2][2], M[2][1], M[2][0]],
    [M[1][2], M[1][1], M[1][0]],
    [M[0][2], M[0][1], M[0][0]],
  ];

  // QR decomposition using Gram-Schmidt
  const { Q, R: Rqr } = qrDecomposition(Mflip);

  // Flip back
  const K = [
    [Rqr[2][2], Rqr[2][1], Rqr[2][0]],
    [Rqr[1][2], Rqr[1][1], Rqr[1][0]],
    [Rqr[0][2], Rqr[0][1], Rqr[0][0]],
  ];

  const R = [
    [Q[2][2], Q[2][1], Q[2][0]],
    [Q[1][2], Q[1][1], Q[1][0]],
    [Q[0][2], Q[0][1], Q[0][0]],
  ];

  // Ensure K has positive diagonal
  const D = [
    [K[0][0] < 0 ? -1 : 1, 0, 0],
    [0, K[1][1] < 0 ? -1 : 1, 0],
    [0, 0, K[2][2] < 0 ? -1 : 1],
  ];

  const Kfixed = matMul(K, D);
  const Rfixed = matMul(D, R);

  // Normalize K so K[2][2] = 1
  const s = Kfixed[2][2];
  if (Math.abs(s) > 1e-10) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        Kfixed[i][j] /= s;
      }
    }
  }

  // Solve for translation: t = K^-1 * P[:, 3]
  const Kinv = invert3x3(Kfixed);
  const p4 = [P[0][3], P[1][3], P[2][3]];
  const t = [
    Kinv[0][0] * p4[0] + Kinv[0][1] * p4[1] + Kinv[0][2] * p4[2],
    Kinv[1][0] * p4[0] + Kinv[1][1] * p4[1] + Kinv[1][2] * p4[2],
    Kinv[2][0] * p4[0] + Kinv[2][1] * p4[1] + Kinv[2][2] * p4[2],
  ];

  return { K: Kfixed, R: Rfixed, t };
}

/**
 * QR decomposition using modified Gram-Schmidt
 */
function qrDecomposition(A) {
  const n = A.length;
  const Q = Array.from({ length: n }, () => new Array(n).fill(0));
  const R = Array.from({ length: n }, () => new Array(n).fill(0));

  // Columns of A
  const cols = [];
  for (let j = 0; j < n; j++) {
    cols.push(A.map((row) => row[j]));
  }

  const u = [];
  for (let j = 0; j < n; j++) {
    let v = [...cols[j]];

    for (let i = 0; i < j; i++) {
      const proj = dot(cols[j], u[i]) / dot(u[i], u[i]);
      R[i][j] = dot(cols[j], u[i]) / dot(u[i], u[i]) * vecNorm(u[i]);
      for (let k = 0; k < n; k++) {
        v[k] -= proj * u[i][k];
      }
    }

    u.push(v);
    const norm = vecNorm(v);
    R[j][j] = norm;

    for (let k = 0; k < n; k++) {
      Q[k][j] = norm > 1e-10 ? v[k] / norm : 0;
    }
  }

  return { Q, R };
}

/**
 * Invert a 3x3 matrix using cofactor expansion
 */
function invert3x3(M) {
  const [a, b, c] = M[0];
  const [d, e, f] = M[1];
  const [g, h, i] = M[2];

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (Math.abs(det) < 1e-10) {
    // Return identity as fallback
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }

  const invDet = 1 / det;

  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

// ============================================================
// Main Calibration Class
// ============================================================

/**
 * CalibrationSystem manages the full calibration workflow.
 * 
 * Usage:
 *   const calibrator = new CalibrationSystem();
 *   calibrator.setUserHeight(1.75); // optional
 * 
 *   // During T-pose capture, collect frames
 *   calibrator.addCalibrationFrame(0, landmarks0, 1280, 720);
 *   calibrator.addCalibrationFrame(1, landmarks1, 1280, 720);
 *   
 *   // After collecting enough frames (3-5 seconds worth)
 *   const result = calibrator.calibrate();
 *   // result.cameras = [{ projectionMatrix, K, R, t }, ...]
 *   // result.reprojectionError = average pixel error
 *   // result.quality = 'great' | 'good' | 'poor'
 */
export class CalibrationSystem {
  constructor() {
    this.tposeRef = { ...TPOSE_REFERENCE };
    this.calibrationFrames = {}; // { cameraId: [{ landmarks, width, height }, ...] }
    this.calibrationResult = null;
    this.isCalibrated = false;
  }

  /**
   * Scale the reference skeleton to the user's height
   */
  setUserHeight(heightMeters) {
    this.tposeRef = scaleTPoseReference(heightMeters);
  }

  /**
   * Add a frame of landmarks captured during T-pose.
   * Call this every frame for each camera during the calibration window.
   */
  addCalibrationFrame(cameraId, landmarks, imageWidth, imageHeight) {
    if (!this.calibrationFrames[cameraId]) {
      this.calibrationFrames[cameraId] = [];
    }

    this.calibrationFrames[cameraId].push({
      landmarks: landmarks.map((lm) => ({ ...lm })),
      width: imageWidth,
      height: imageHeight,
    });
  }

  /**
   * Check if a set of landmarks looks like a T-pose.
   * Returns a confidence score 0-1.
   * 
   * Checks:
   * - Arms roughly horizontal (shoulders and wrists at similar Y)
   * - Arms spread apart (wrists far from shoulders in X)
   * - Body roughly upright (shoulders above hips)
   */
  detectTPose(landmarks) {
    const lShoulder = landmarks[11];
    const rShoulder = landmarks[12];
    const lWrist = landmarks[15];
    const rWrist = landmarks[16];
    const lHip = landmarks[23];
    const rHip = landmarks[24];

    if (!lShoulder || !rShoulder || !lWrist || !rWrist || !lHip || !rHip) {
      return 0;
    }

    let score = 0;

    // Check 1: Arms roughly horizontal
    // Wrists should be at similar Y to shoulders (within 15% of frame)
    const lArmLevel = Math.abs(lWrist.y - lShoulder.y);
    const rArmLevel = Math.abs(rWrist.y - rShoulder.y);
    if (lArmLevel < 0.15 && rArmLevel < 0.15) score += 0.3;
    else if (lArmLevel < 0.25 && rArmLevel < 0.25) score += 0.15;

    // Check 2: Arms spread wide
    // Wrists should be far from center in X
    const armSpreadL = Math.abs(lWrist.x - lShoulder.x);
    const armSpreadR = Math.abs(rWrist.x - rShoulder.x);
    if (armSpreadL > 0.15 && armSpreadR > 0.15) score += 0.3;
    else if (armSpreadL > 0.10 && armSpreadR > 0.10) score += 0.15;

    // Check 3: Body upright
    // Shoulders above hips
    const shoulderY = (lShoulder.y + rShoulder.y) / 2;
    const hipY = (lHip.y + rHip.y) / 2;
    if (shoulderY < hipY) score += 0.2; // In image coords, Y increases downward

    // Check 4: Symmetry
    // Left and right sides should be roughly mirrored
    const centerX = (lShoulder.x + rShoulder.x) / 2;
    const lSymmetry = Math.abs(Math.abs(lWrist.x - centerX) - Math.abs(rWrist.x - centerX));
    if (lSymmetry < 0.1) score += 0.2;
    else if (lSymmetry < 0.2) score += 0.1;

    return Math.min(score, 1);
  }

  /**
   * Average multiple frames of landmarks to reduce jitter.
   * Takes the collected calibration frames for one camera
   * and returns averaged landmark positions.
   */
  averageFrames(frames) {
    if (frames.length === 0) return null;

    const numLandmarks = frames[0].landmarks.length;
    const averaged = [];

    for (let i = 0; i < numLandmarks; i++) {
      let sumX = 0;
      let sumY = 0;
      let sumVis = 0;
      let count = 0;

      for (const frame of frames) {
        const lm = frame.landmarks[i];
        if (lm && (lm.visibility === undefined || lm.visibility > 0.5)) {
          sumX += lm.x;
          sumY += lm.y;
          sumVis += lm.visibility || 1;
          count++;
        }
      }

      if (count > 0) {
        averaged.push({
          x: sumX / count,
          y: sumY / count,
          visibility: sumVis / count,
        });
      } else {
        averaged.push({ x: 0, y: 0, visibility: 0 });
      }
    }

    return {
      landmarks: averaged,
      width: frames[0].width,
      height: frames[0].height,
    };
  }

  /**
   * Run calibration using collected T-pose frames.
   * Returns calibration data for all cameras.
   */
  calibrate() {
    const cameraIds = Object.keys(this.calibrationFrames);

    if (cameraIds.length < 2) {
      return {
        success: false,
        error: "Need at least 2 cameras for calibration",
      };
    }

    // Check we have enough frames per camera
    for (const id of cameraIds) {
      if (this.calibrationFrames[id].length < 5) {
        return {
          success: false,
          error: `Camera ${id} needs at least 5 frames (has ${this.calibrationFrames[id].length})`,
        };
      }
    }

    const cameras = [];

    for (const id of cameraIds) {
      const frames = this.calibrationFrames[id];

      // Filter frames where T-pose is detected
      const tposeFrames = frames.filter(
        (f) => this.detectTPose(f.landmarks) > 0.6
      );

      if (tposeFrames.length < 3) {
        return {
          success: false,
          error: `Camera ${id}: T-pose not detected reliably. Got ${tposeFrames.length} good frames out of ${frames.length}. Make sure arms are fully extended to the sides.`,
        };
      }

      // Average the good frames
      const averaged = this.averageFrames(tposeFrames);

      // Build correspondences: 3D reference ↔ 2D observed
      const correspondences = [];

      for (const lmIdx of CALIBRATION_LANDMARKS) {
        const lm2d = averaged.landmarks[lmIdx];
        const pt3d = this.tposeRef[lmIdx];

        if (
          lm2d &&
          pt3d &&
          (lm2d.visibility === undefined || lm2d.visibility > 0.5)
        ) {
          correspondences.push({
            world: pt3d,
            image: [lm2d.x * averaged.width, lm2d.y * averaged.height],
          });
        }
      }

      if (correspondences.length < 6) {
        return {
          success: false,
          error: `Camera ${id}: Only ${correspondences.length} landmarks detected. Need at least 6. Ensure full body is visible.`,
        };
      }

      // Solve for projection matrix using DLT
      try {
        const projectionMatrix = solveDLT(correspondences);
        const { K, R, t } = decomposeProjectionMatrix(projectionMatrix);

        cameras.push({
          id,
          projectionMatrix,
          K,
          R,
          t,
          imageWidth: averaged.width,
          imageHeight: averaged.height,
          numCorrespondences: correspondences.length,
          tposeFramesUsed: tposeFrames.length,
        });
      } catch (err) {
        return {
          success: false,
          error: `Camera ${id} calibration failed: ${err.message}`,
        };
      }
    }

    // Validate calibration by computing reprojection error
    // Use the averaged landmarks from the first camera pair
    const testCameraData = cameras.map((cam) => {
      const averaged = this.averageFrames(this.calibrationFrames[cam.id]);
      return {
        projectionMatrix: cam.projectionMatrix,
        landmarks: averaged.landmarks,
        imageWidth: cam.imageWidth,
        imageHeight: cam.imageHeight,
      };
    });

    const triangulated = triangulateLandmarks(testCameraData, 33, 0.5);
    const reprojError = computeReprojectionError(testCameraData, triangulated);

    let quality;
    if (reprojError < 2) quality = "great";
    else if (reprojError < 5) quality = "good";
    else if (reprojError < 10) quality = "acceptable";
    else quality = "poor";

    this.calibrationResult = {
      success: true,
      cameras,
      reprojectionError: reprojError,
      quality,
      timestamp: Date.now(),
    };

    this.isCalibrated = true;

    return this.calibrationResult;
  }

  /**
   * Get the stored calibration result.
   */
  getCalibration() {
    return this.calibrationResult;
  }

  /**
   * Reset calibration data to start fresh.
   */
  reset() {
    this.calibrationFrames = {};
    this.calibrationResult = null;
    this.isCalibrated = false;
  }

  /**
   * Export calibration data as JSON (for saving/loading).
   */
  exportCalibration() {
    if (!this.calibrationResult) return null;
    return JSON.stringify(this.calibrationResult);
  }

  /**
   * Import previously saved calibration data.
   */
  importCalibration(json) {
    try {
      const data = typeof json === "string" ? JSON.parse(json) : json;
      if (data.success && data.cameras) {
        this.calibrationResult = data;
        this.isCalibrated = true;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export { TPOSE_REFERENCE, CALIBRATION_LANDMARKS };