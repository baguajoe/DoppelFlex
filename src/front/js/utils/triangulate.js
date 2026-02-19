/**
 * triangulate.js
 * 
 * Core math for multi-camera 3D triangulation.
 * Takes 2D landmark positions from multiple calibrated cameras
 * and computes true 3D positions using Direct Linear Transform (DLT).
 */

// ============================================================
// Matrix Math Helpers (no external dependencies)
// ============================================================

/**
 * Multiply two matrices (2D arrays)
 */
export function matMul(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const result = Array.from({ length: rowsA }, () => new Array(colsB).fill(0));

  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

/**
 * Transpose a matrix
 */
export function transpose(M) {
  const rows = M.length;
  const cols = M[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = M[i][j];
    }
  }
  return result;
}

/**
 * Compute the Euclidean norm of a vector
 */
export function vecNorm(v) {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

/**
 * Normalize a vector to unit length
 */
export function vecNormalize(v) {
  const n = vecNorm(v);
  if (n < 1e-10) return v.map(() => 0);
  return v.map((val) => val / n);
}

/**
 * Cross product of two 3D vectors
 */
export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Dot product of two vectors
 */
export function dot(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

/**
 * Subtract two vectors: a - b
 */
export function vecSub(a, b) {
  return a.map((val, i) => val - b[i]);
}

/**
 * Add two vectors: a + b
 */
export function vecAdd(a, b) {
  return a.map((val, i) => val + b[i]);
}

/**
 * Scale a vector by a scalar
 */
export function vecScale(v, s) {
  return v.map((val) => val * s);
}

// ============================================================
// SVD (Singular Value Decomposition) - Simplified for DLT
// ============================================================

/**
 * Simplified SVD using Jacobi iteration for small matrices.
 * For DLT we only need the right singular vector corresponding
 * to the smallest singular value (last column of V).
 * 
 * This computes A^T * A, then finds its eigenvectors.
 * The eigenvector with the smallest eigenvalue = last column of V in SVD.
 */
export function svdSolve(A) {
  // Compute A^T * A (normal equations)
  const At = transpose(A);
  const AtA = matMul(At, A);
  const n = AtA.length;

  // Power iteration to find eigenvector with SMALLEST eigenvalue
  // We use inverse iteration: find largest eigenvector of (maxEig*I - AtA)
  // But simpler: just do QR-like iteration or use direct smallest eigenvector

  // For a 4x4 or 3x3 system, we can use iterative deflation
  // But the most robust simple approach: compute all eigenvalues/vectors
  // using Jacobi eigenvalue algorithm

  const { eigenvalues, eigenvectors } = jacobiEigen(AtA);

  // Find index of smallest eigenvalue
  let minIdx = 0;
  let minVal = Math.abs(eigenvalues[0]);
  for (let i = 1; i < eigenvalues.length; i++) {
    if (Math.abs(eigenvalues[i]) < minVal) {
      minVal = Math.abs(eigenvalues[i]);
      minIdx = i;
    }
  }

  // Return the eigenvector corresponding to smallest eigenvalue
  // This is the null space of A (least squares solution)
  const solution = [];
  for (let i = 0; i < n; i++) {
    solution.push(eigenvectors[i][minIdx]);
  }

  return vecNormalize(solution);
}

/**
 * Jacobi eigenvalue algorithm for symmetric matrices.
 * Returns eigenvalues and eigenvectors.
 */
function jacobiEigen(M) {
  const n = M.length;
  const maxIter = 100;
  const tol = 1e-10;

  // Clone M
  const A = M.map((row) => [...row]);

  // Initialize eigenvector matrix as identity
  const V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let iter = 0; iter < maxIter; iter++) {
    // Find largest off-diagonal element
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

    // Compute rotation angle
    const theta =
      Math.abs(A[p][p] - A[q][q]) < tol
        ? Math.PI / 4
        : 0.5 * Math.atan2(2 * A[p][q], A[p][p] - A[q][q]);

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Apply Givens rotation to A
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

    // Update eigenvectors
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

// ============================================================
// Camera Projection
// ============================================================

/**
 * Build a projection matrix from intrinsic and extrinsic parameters.
 * 
 * K = intrinsic matrix (3x3):
 *   [fx  0  cx]
 *   [ 0 fy  cy]
 *   [ 0  0   1]
 * 
 * R = rotation matrix (3x3)
 * t = translation vector (3x1)
 * 
 * P = K * [R | t]  → 3x4 projection matrix
 */
export function buildProjectionMatrix(K, R, t) {
  // [R | t] is a 3x4 matrix
  const Rt = [
    [R[0][0], R[0][1], R[0][2], t[0]],
    [R[1][0], R[1][1], R[1][2], t[1]],
    [R[2][0], R[2][1], R[2][2], t[2]],
  ];

  return matMul(K, Rt);
}

/**
 * Estimate camera intrinsic matrix from image dimensions.
 * For webcams without exact calibration, this is a good approximation.
 * Focal length ≈ image width (assumes ~60° horizontal FOV).
 */
export function estimateIntrinsics(width, height) {
  const fx = width; // Approximate focal length in pixels
  const fy = width; // Square pixels assumed
  const cx = width / 2; // Principal point at image center
  const cy = height / 2;

  return [
    [fx, 0, cx],
    [0, fy, cy],
    [0, 0, 1],
  ];
}

// ============================================================
// DLT Triangulation
// ============================================================

/**
 * Triangulate a single 3D point from 2+ camera observations.
 * 
 * @param {Array} observations - Array of { projectionMatrix, x, y }
 *   projectionMatrix: 3x4 camera projection matrix
 *   x, y: 2D pixel coordinates of the point in that camera's image
 * 
 * @returns {Array} [X, Y, Z] - 3D world coordinates
 * 
 * Uses the DLT method:
 * For each camera with projection matrix P and observation (x, y):
 *   x * P_row3 - P_row1 = 0
 *   y * P_row3 - P_row2 = 0
 * 
 * Stack all equations → solve with SVD for least squares.
 */
export function triangulatePoint(observations) {
  if (observations.length < 2) {
    throw new Error("Need at least 2 camera observations to triangulate");
  }

  const A = [];

  for (const obs of observations) {
    const P = obs.projectionMatrix;
    const x = obs.x;
    const y = obs.y;

    // Row 1: x * P[2] - P[0]
    A.push([
      x * P[2][0] - P[0][0],
      x * P[2][1] - P[0][1],
      x * P[2][2] - P[0][2],
      x * P[2][3] - P[0][3],
    ]);

    // Row 2: y * P[2] - P[1]
    A.push([
      y * P[2][0] - P[1][0],
      y * P[2][1] - P[1][1],
      y * P[2][2] - P[1][2],
      y * P[2][3] - P[1][3],
    ]);
  }

  // Solve A * [X, Y, Z, W]^T = 0 using SVD
  const solution = svdSolve(A);

  // Convert from homogeneous coordinates
  const W = solution[3];
  if (Math.abs(W) < 1e-10) {
    // Point at infinity — return as-is, normalized
    return [solution[0], solution[1], solution[2]];
  }

  return [solution[0] / W, solution[1] / W, solution[2] / W];
}

/**
 * Triangulate all landmarks from multiple camera views.
 * 
 * @param {Array} cameraData - Array of camera objects:
 *   { projectionMatrix, landmarks: [{x, y, visibility}, ...] }
 * @param {number} numLandmarks - Number of landmarks (33 for MediaPipe Pose)
 * @param {number} minVisibility - Minimum visibility threshold (0-1)
 * 
 * @returns {Array} Array of {x, y, z, confidence} for each landmark
 */
export function triangulateLandmarks(cameraData, numLandmarks = 33, minVisibility = 0.5) {
  const results = [];

  for (let i = 0; i < numLandmarks; i++) {
    const observations = [];

    for (const cam of cameraData) {
      const lm = cam.landmarks[i];
      if (lm && (lm.visibility === undefined || lm.visibility >= minVisibility)) {
        observations.push({
          projectionMatrix: cam.projectionMatrix,
          x: lm.x * cam.imageWidth, // MediaPipe gives normalized [0,1] coords
          y: lm.y * cam.imageHeight,
        });
      }
    }

    if (observations.length >= 2) {
      const point3D = triangulatePoint(observations);
      results.push({
        x: point3D[0],
        y: point3D[1],
        z: point3D[2],
        confidence: observations.length / cameraData.length, // How many cameras saw it
        numObservations: observations.length,
      });
    } else if (observations.length === 1) {
      // Only one camera sees it — fall back to single-camera estimate
      const cam = cameraData.find((c) => {
        const lm = c.landmarks[i];
        return lm && (lm.visibility === undefined || lm.visibility >= minVisibility);
      });
      const lm = cam.landmarks[i];
      results.push({
        x: lm.x,
        y: lm.y,
        z: lm.z || 0, // MediaPipe's estimated z
        confidence: 0.3, // Low confidence — single camera
        numObservations: 1,
        singleCameraFallback: true,
      });
    } else {
      // No camera sees this landmark
      results.push({
        x: 0,
        y: 0,
        z: 0,
        confidence: 0,
        numObservations: 0,
        missing: true,
      });
    }
  }

  return results;
}

// ============================================================
// Reprojection Error (for validating calibration quality)
// ============================================================

/**
 * Compute reprojection error for a set of 3D points.
 * Projects 3D points back into each camera and measures
 * pixel distance from the original 2D observations.
 * 
 * Lower error = better calibration.
 * < 2 pixels = great
 * 2-5 pixels = acceptable
 * > 5 pixels = recalibrate
 */
export function computeReprojectionError(cameraData, triangulatedPoints) {
  let totalError = 0;
  let count = 0;

  for (let i = 0; i < triangulatedPoints.length; i++) {
    const pt = triangulatedPoints[i];
    if (pt.missing || pt.singleCameraFallback) continue;

    const X = [pt.x, pt.y, pt.z, 1]; // Homogeneous 3D point

    for (const cam of cameraData) {
      const lm = cam.landmarks[i];
      if (!lm || (lm.visibility !== undefined && lm.visibility < 0.5)) continue;

      const P = cam.projectionMatrix;

      // Project: p = P * X
      const px = P[0][0] * X[0] + P[0][1] * X[1] + P[0][2] * X[2] + P[0][3] * X[3];
      const py = P[1][0] * X[0] + P[1][1] * X[1] + P[1][2] * X[2] + P[1][3] * X[3];
      const pw = P[2][0] * X[0] + P[2][1] * X[1] + P[2][2] * X[2] + P[2][3] * X[3];

      if (Math.abs(pw) < 1e-10) continue;

      const projX = px / pw;
      const projY = py / pw;

      const obsX = lm.x * cam.imageWidth;
      const obsY = lm.y * cam.imageHeight;

      const dx = projX - obsX;
      const dy = projY - obsY;
      totalError += Math.sqrt(dx * dx + dy * dy);
      count++;
    }
  }

  return count > 0 ? totalError / count : Infinity;
}