# src/api/head_mesh_generator.py
# =============================================================================
# FULL HEAD MESH GENERATOR (ROBUST + EYEBALLS + SPIKE GUARD + CLI)
#
# WHAT THIS DOES:
# - Uses MediaPipe FaceMesh landmarks to build the FRONT face surface
# - Uses MediaPipe FACEMESH_TESSELATION when available (best topology)
# - Adds a BACK-OF-HEAD shell behind the face plane
# - Stitches face boundary to back shell with STRONG guards to prevent spikes
# - Adds a SHORT, CAPPED neck (prevents long "icicle spike")
# - Optional MiDaS depth refinement for subtle Z shaping
# - Optional eyeballs using iris landmarks (requires refine_landmarks=True)
# - Optional nose shrink (helps when nose looks too big)
#
# NOTE:
# - This file can be imported by your Flask route:
#     from api.head_mesh_generator import generate_full_head
# - It can also be run directly from terminal to generate a GLB.
# =============================================================================

from __future__ import annotations

import os
import sys
import math
import json
from dataclasses import dataclass
from typing import Optional, Tuple, List

import numpy as np
import cv2
import trimesh
import scipy.spatial as sp


# ──────────────────────────────────────────────────────────────────────────────
# Landmark -> mesh mapping constants (KEEP CONSISTENT with your app)
# ──────────────────────────────────────────────────────────────────────────────
X_SCALE  = 0.24
Y_SCALE  = 0.30
Y_OFFSET = 0.85
Z_SCALE  = 0.15
Z_OFFSET = 0.12

# seam/triangle guards (tighten if spikes remain)
MAX_SEAM_DIST = 0.085
MAX_TRI_EDGE  = 0.09

# eyeball controls
ADD_EYEBALLS = True
IRIS_FORWARD = 0.0035

# nose control
ENABLE_NOSE_SHRINK = True
NOSE_SHRINK_AMOUNT = 0.12  # 0.08–0.18 is typical

# MiDaS defaults
DEFAULT_USE_DEPTH = True
DEFAULT_DEPTH_STRENGTH = 0.025


# ──────────────────────────────────────────────────────────────────────────────
# Robust MediaPipe tessellation access
# ──────────────────────────────────────────────────────────────────────────────
FACEMESH_TESSELATION = None
try:
    import mediapipe as mp
    if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh_connections"):
        FACEMESH_TESSELATION = getattr(mp.solutions.face_mesh_connections, "FACEMESH_TESSELATION", None)
    if FACEMESH_TESSELATION is None and hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
        FACEMESH_TESSELATION = getattr(mp.solutions.face_mesh, "FACEMESH_TESSELATION", None)
except Exception:
    FACEMESH_TESSELATION = None


# ──────────────────────────────────────────────────────────────────────────────
# Utility helpers
# ──────────────────────────────────────────────────────────────────────────────
def _safe_normals(mesh: trimesh.Trimesh):
    try:
        mesh.fix_normals()
    except Exception:
        pass
    try:
        mesh.rezero()
    except Exception:
        pass


def cleanup_mesh(mesh: trimesh.Trimesh):
    for fn in [
        "remove_degenerate_faces",
        "remove_duplicate_faces",
        "remove_infinite_values",
        "remove_unreferenced_vertices",
        "merge_vertices",
    ]:
        try:
            getattr(mesh, fn)()
        except Exception:
            pass
    _safe_normals(mesh)


def filter_large_triangles(verts: np.ndarray, faces: np.ndarray, max_edge=MAX_TRI_EDGE):
    if faces is None or len(faces) == 0:
        return np.zeros((0, 3), dtype=np.int64)

    good = []
    for f in faces:
        pts = verts[f]
        e0 = np.linalg.norm(pts[0] - pts[1])
        e1 = np.linalg.norm(pts[1] - pts[2])
        e2 = np.linalg.norm(pts[2] - pts[0])
        if max(e0, e1, e2) <= max_edge:
            good.append(f)

    return np.asarray(good, dtype=np.int64) if good else faces.astype(np.int64)


# ──────────────────────────────────────────────────────────────────────────────
# Tessellation -> triangles
# ──────────────────────────────────────────────────────────────────────────────
def build_triangles_from_tessellation(tessellation_edges):
    """
    MediaPipe gives edges (u,v). We reconstruct triangles by finding 3-cycles.
    """
    from collections import defaultdict

    edge_set = set()
    for a, b in tessellation_edges:
        if a == b:
            continue
        edge_set.add((a, b) if a < b else (b, a))

    neighbors = defaultdict(set)
    for a, b in edge_set:
        neighbors[a].add(b)
        neighbors[b].add(a)

    triangles = set()
    for v, ns in neighbors.items():
        ns = sorted(ns)
        for i in range(len(ns)):
            n1 = ns[i]
            for j in range(i + 1, len(ns)):
                n2 = ns[j]
                if n2 in neighbors[n1]:
                    triangles.add(tuple(sorted((v, n1, n2))))

    if not triangles:
        return np.zeros((0, 3), dtype=np.int64)

    return np.array(list(triangles), dtype=np.int64)


def triangulate_face(face_points: np.ndarray):
    """
    Best: MediaPipe tessellation triangles.
    Fallback: Delaunay on XY.
    """
    if FACEMESH_TESSELATION is not None:
        faces = build_triangles_from_tessellation(FACEMESH_TESSELATION)
        faces = filter_large_triangles(face_points, faces, max_edge=MAX_TRI_EDGE)
        if len(faces) > 500:
            return faces

    tri = sp.Delaunay(face_points[:, :2])
    faces = tri.simplices.astype(np.int64)
    faces = filter_large_triangles(face_points, faces, max_edge=MAX_TRI_EDGE * 0.9)
    return faces


# ──────────────────────────────────────────────────────────────────────────────
# Back shell
# ──────────────────────────────────────────────────────────────────────────────
def generate_back_shell(face_points: np.ndarray, resolution=32):
    cx = float(face_points[:, 0].mean())
    cy = float(face_points[:, 1].mean())
    w  = float(face_points[:, 0].max() - face_points[:, 0].min())
    h  = float(face_points[:, 1].max() - face_points[:, 1].min())
    zmin = float(face_points[:, 2].min())

    rx = max(w * 0.62, 0.04)
    ry = max(h * 0.60, 0.05)
    rz = max(w * 0.58, 0.04)

    back_cz = zmin - rz * 0.22

    lat_steps = max(10, resolution // 2)
    lon_steps = max(22, resolution)

    verts = []
    for i in range(lat_steps + 1):
        theta = np.pi * i / lat_steps
        for j in range(lon_steps + 1):
            phi = np.pi + np.pi * j / lon_steps  # back half only
            x = rx * np.sin(theta) * np.cos(phi) + cx
            y = ry * np.cos(theta) + cy
            z = rz * np.sin(theta) * np.sin(phi) + back_cz
            verts.append([x, y, z])

    verts = np.asarray(verts, dtype=np.float32)

    faces = []
    for i in range(lat_steps):
        for j in range(lon_steps):
            v0 = i * (lon_steps + 1) + j
            v1 = v0 + 1
            v2 = (i + 1) * (lon_steps + 1) + j
            v3 = v2 + 1
            faces.append([v0, v2, v1])
            faces.append([v1, v2, v3])

    return verts, np.asarray(faces, dtype=np.int64)


# ──────────────────────────────────────────────────────────────────────────────
# Seam stitching (spike-guarded)
# ──────────────────────────────────────────────────────────────────────────────
def get_face_boundary_indices(face_points: np.ndarray):
    from scipy.spatial import ConvexHull

    try:
        hull = ConvexHull(face_points[:, :2])
        boundary = list(hull.vertices)
    except Exception:
        c = face_points[:, :2].mean(axis=0)
        r = np.linalg.norm(face_points[:, :2] - c, axis=1)
        boundary = np.where(r >= np.quantile(r, 0.88))[0].tolist()

    if len(boundary) < 12:
        return []

    c2 = face_points[boundary][:, :2].mean(axis=0)
    ang = np.arctan2(face_points[boundary][:, 1] - c2[1],
                     face_points[boundary][:, 0] - c2[0])
    boundary = [boundary[i] for i in np.argsort(ang)]
    return boundary


def stitch_face_to_back(face_points: np.ndarray, back_verts: np.ndarray, face_vert_offset: int):
    boundary = get_face_boundary_indices(face_points)
    if len(boundary) < 12:
        return []

    z = back_verts[:, 2]
    ring = np.where(z >= np.quantile(z, 0.93))[0]
    if len(ring) < 12:
        ring = np.where(z >= np.quantile(z, 0.90))[0]
    if len(ring) < 12:
        return []

    ring_pts = back_verts[ring]

    nearest = []
    nearest_dist = []
    for fi in boundary:
        fp = face_points[fi]
        d = np.linalg.norm(ring_pts - fp, axis=1)
        j = int(np.argmin(d))
        nearest.append(ring[j])
        nearest_dist.append(float(d[j]))

    stitch_faces = []
    n = len(boundary)

    for i in range(n):
        if nearest_dist[i] > MAX_SEAM_DIST or nearest_dist[(i + 1) % n] > MAX_SEAM_DIST:
            continue

        f0 = boundary[i]
        f1 = boundary[(i + 1) % n]
        b0 = nearest[i] + face_vert_offset
        b1 = nearest[(i + 1) % n] + face_vert_offset

        stitch_faces.append([f0, f1, b0])
        stitch_faces.append([f1, b1, b0])

    return stitch_faces


# ──────────────────────────────────────────────────────────────────────────────
# MiDaS depth refinement (optional)
# ──────────────────────────────────────────────────────────────────────────────
def refine_face_depth(vertices: np.ndarray, image_path: str, num_face_verts: int, depth_strength=0.02):
    try:
        import torch

        model_type = "MiDaS_small"
        midas = torch.hub.load("intel-isl/MiDaS", model_type, trust_repo=True)
        midas.eval()

        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        transform = midas_transforms.small_transform

        img = cv2.imread(image_path)
        if img is None:
            return vertices

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        input_batch = transform(img_rgb)

        with torch.no_grad():
            prediction = midas(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=img_rgb.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()

        depth_map = prediction.cpu().numpy().astype(np.float32)
        dmin, dmax = float(depth_map.min()), float(depth_map.max())
        if dmax - dmin < 1e-6:
            return vertices

        depth_map = (depth_map - dmin) / (dmax - dmin)

        h, w = img.shape[:2]
        refined = vertices.copy()

        for vi in range(min(num_face_verts, len(vertices))):
            vx, vy, _ = refined[vi]

            lm_x = (vx / X_SCALE) + 0.5
            lm_y = 0.5 - ((vy - Y_OFFSET) / Y_SCALE)

            px = int(np.clip(lm_x * w, 0, w - 1))
            py = int(np.clip(lm_y * h, 0, h - 1))

            dv = float(depth_map[py, px])
            refined[vi, 2] += (dv - 0.5) * float(depth_strength)

        return refined

    except Exception as e:
        print(f"[HeadGen] MiDaS skipped: {e}")
        return vertices


# ──────────────────────────────────────────────────────────────────────────────
# Neck (short + capped)
# ──────────────────────────────────────────────────────────────────────────────
def add_neck(vertices: np.ndarray, faces: np.ndarray, resolution=32):
    y = vertices[:, 1]
    min_y = float(np.quantile(y, 0.01))

    cx = float(vertices[:, 0].mean())
    cz = float(vertices[:, 2].mean())
    head_w = float(vertices[:, 0].max() - vertices[:, 0].min())

    neck_r = max(head_w * 0.18, 0.018)
    neck_len = max(head_w * 0.12, 0.03)
    rings = 5
    lon = max(18, resolution)

    base_idx = len(vertices)
    neck_verts = []
    neck_faces = []

    for ring in range(rings + 1):
        t = ring / rings
        yy = min_y - t * neck_len
        rr = neck_r * (1.0 - t * 0.15)

        for j in range(lon):
            phi = 2.0 * np.pi * j / lon
            xx = cx + rr * np.cos(phi)
            zz = cz + rr * np.sin(phi)
            neck_verts.append([xx, yy, zz])

    for ring in range(rings):
        for j in range(lon):
            a = base_idx + ring * lon + j
            b = base_idx + ring * lon + ((j + 1) % lon)
            c = base_idx + (ring + 1) * lon + j
            d = base_idx + (ring + 1) * lon + ((j + 1) % lon)
            neck_faces.append([a, c, b])
            neck_faces.append([b, c, d])

    # cap bottom
    cap_center = [cx, min_y - neck_len, cz]
    cap_idx = base_idx + len(neck_verts)
    neck_verts.append(cap_center)

    last_ring_start = base_idx + rings * lon
    for j in range(lon):
        a = last_ring_start + j
        b = last_ring_start + ((j + 1) % lon)
        neck_faces.append([a, b, cap_idx])

    all_verts = np.vstack([vertices, np.asarray(neck_verts, dtype=np.float32)])
    all_faces = np.vstack([faces, np.asarray(neck_faces, dtype=np.int64)])
    return all_verts, all_faces


# ──────────────────────────────────────────────────────────────────────────────
# Eyeballs (iris landmarks)
# ──────────────────────────────────────────────────────────────────────────────
def add_eyeballs_to_head(mesh: trimesh.Trimesh, iris_forward=IRIS_FORWARD):
    V = mesh.vertices
    if V.shape[0] < 478:
        print("[HeadGen] Iris landmarks missing (<478 verts). Skipping eyeballs.")
        return mesh

    LEFT_IRIS  = [468, 469, 470, 471, 472]
    RIGHT_IRIS = [473, 474, 475, 476, 477]
    L_OUTER, L_INNER = 33, 133
    R_OUTER, R_INNER = 263, 362

    def center(idx):
        return V[idx].mean(axis=0)

    def radius(outer, inner):
        d = np.linalg.norm(V[outer] - V[inner])
        return max(d * 0.22, 0.004)

    lc = center(LEFT_IRIS)  + np.array([0, 0, iris_forward], dtype=np.float32)
    rc = center(RIGHT_IRIS) + np.array([0, 0, iris_forward], dtype=np.float32)

    lr = radius(L_OUTER, L_INNER)
    rr = radius(R_OUTER, R_INNER)

    left_eye  = trimesh.creation.icosphere(subdivisions=3, radius=lr)
    right_eye = trimesh.creation.icosphere(subdivisions=3, radius=rr)

    left_eye.apply_translation(lc)
    right_eye.apply_translation(rc)

    left_eye.visual.vertex_colors  = np.tile(np.array([[255, 255, 255, 255]], dtype=np.uint8),
                                             (len(left_eye.vertices), 1))
    right_eye.visual.vertex_colors = np.tile(np.array([[255, 255, 255, 255]], dtype=np.uint8),
                                             (len(right_eye.vertices), 1))

    combined = trimesh.util.concatenate([mesh, left_eye, right_eye])
    return combined


# ──────────────────────────────────────────────────────────────────────────────
# Nose shrink (optional)
# ──────────────────────────────────────────────────────────────────────────────
def shrink_nose_region(vertices: np.ndarray, amount=0.12):
    """
    Pull nose region slightly back toward face center.
    This is a LIGHT corrective morph (not perfect, but helps "big nose").
    """
    # MediaPipe nose-ish indices (common)
    NOSE = [1, 2, 4, 5, 6, 19, 20, 94, 97, 98, 99, 168, 195, 197, 326, 327, 328]
    NOSE = [i for i in NOSE if i < len(vertices)]
    if not NOSE:
        return vertices

    v = vertices.copy()
    center = v.mean(axis=0)
    nose_center = v[NOSE].mean(axis=0)

    # move nose points toward face center slightly (mostly along Z and X/Y a bit)
    for idx in NOSE:
        delta = v[idx] - nose_center
        v[idx] = v[idx] - delta * (amount * 0.35)  # tighten within nose
        v[idx] = v[idx] * (1.0 - amount * 0.05) + center * (amount * 0.05)  # tiny global pull

    return v


# ──────────────────────────────────────────────────────────────────────────────
# MAIN GENERATOR
# ──────────────────────────────────────────────────────────────────────────────
def generate_full_head(
    image_path: str,
    face_landmarks,
    image_shape,
    resolution=32,
    use_depth=True,
    depth_strength=0.025
) -> trimesh.Trimesh:
    """
    Returns a trimesh.Trimesh representing the full head.
    """
    landmarks = face_landmarks.landmark

    # Step 1: face vertices
    face_points = []
    for lm in landmarks:
        x = (lm.x - 0.5) * X_SCALE
        y = (0.5 - lm.y) * Y_SCALE + Y_OFFSET
        z = (-lm.z) * Z_SCALE + Z_OFFSET
        face_points.append([x, y, z])

    face_points = np.asarray(face_points, dtype=np.float32)

    # Optional nose shrink BEFORE triangulation (stabilizes shape)
    if ENABLE_NOSE_SHRINK:
        face_points = shrink_nose_region(face_points, amount=NOSE_SHRINK_AMOUNT)

    # Step 2: triangulate
    face_faces = triangulate_face(face_points)

    # Step 3: back shell
    back_verts, back_faces = generate_back_shell(face_points, resolution=resolution)

    # Step 4: merge
    num_face_verts = len(face_points)
    back_faces_offset = back_faces + num_face_verts
    all_verts = np.vstack([face_points, back_verts])
    all_faces = np.vstack([face_faces, back_faces_offset])

    # Step 5: stitch seam (guarded)
    stitch_faces = stitch_face_to_back(face_points, back_verts, face_vert_offset=num_face_verts)
    if stitch_faces:
        all_faces = np.vstack([all_faces, np.asarray(stitch_faces, dtype=np.int64)])

    # Step 6: MiDaS depth refine (optional)
    if use_depth and float(depth_strength) > 0:
        all_verts = refine_face_depth(
            vertices=all_verts,
            image_path=image_path,
            num_face_verts=num_face_verts,
            depth_strength=float(depth_strength),
        )

    # Step 7: neck (short + capped)
    all_verts, all_faces = add_neck(all_verts, all_faces, resolution=resolution)

    # Step 8: finalize mesh + cleanup
    mesh = trimesh.Trimesh(vertices=all_verts, faces=all_faces, process=False)
    cleanup_mesh(mesh)

    try:
        trimesh.smoothing.filter_laplacian(mesh, iterations=1, lamb=0.22)
    except Exception:
        pass

    _safe_normals(mesh)

    # Step 9: eyeballs (optional)
    if ADD_EYEBALLS:
        try:
            mesh = add_eyeballs_to_head(mesh)
            cleanup_mesh(mesh)
        except Exception as e:
            print("[HeadGen] eyeballs skipped:", e)

    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# Standalone helper: detect landmarks inside this file
# ──────────────────────────────────────────────────────────────────────────────
def detect_facemesh_landmarks(image_path: str):
    """
    Returns (landmarks, image_shape) using MediaPipe FaceMesh.
    """
    import mediapipe as mp

    img = cv2.imread(image_path)
    if img is None:
        raise RuntimeError(f"Could not read image: {image_path}")

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    fm = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,  # gives iris landmarks
        min_detection_confidence=0.5,
    )
    results = fm.process(img_rgb)
    if not results.multi_face_landmarks:
        raise RuntimeError("No face landmarks detected")

    return results.multi_face_landmarks[0], img.shape


# ──────────────────────────────────────────────────────────────────────────────
# CLI runner (adds the "missing lines" you expected)
# ──────────────────────────────────────────────────────────────────────────────
def _cli():
    """
    Run:
      pipenv run python src/api/head_mesh_generator.py input.jpg output.glb
    Optional:
      --quality fast|balanced|high
      --no-depth
      --depth 0.02
    """
    if len(sys.argv) < 3:
        print("Usage: python head_mesh_generator.py <input_image> <output_glb> [--quality balanced|fast|high] [--no-depth] [--depth 0.025]")
        sys.exit(1)

    image_path = sys.argv[1]
    out_path = sys.argv[2]

    quality = "balanced"
    use_depth = DEFAULT_USE_DEPTH
    depth_strength = DEFAULT_DEPTH_STRENGTH

    for i, arg in enumerate(sys.argv[3:]):
        if arg == "--quality" and i + 4 < len(sys.argv):
            quality = sys.argv[3:][i + 1]
        if arg == "--no-depth":
            use_depth = False
        if arg == "--depth" and i + 4 < len(sys.argv):
            try:
                depth_strength = float(sys.argv[3:][i + 1])
            except Exception:
                pass

    quality_map = {
        "fast":     {"resolution": 20, "use_depth": False, "depth_strength": 0.0},
        "balanced": {"resolution": 32, "use_depth": True,  "depth_strength": 0.025},
        "high":     {"resolution": 48, "use_depth": True,  "depth_strength": 0.035},
    }
    settings = quality_map.get(quality, quality_map["balanced"])
    if not use_depth:
        settings["use_depth"] = False

    # detect landmarks
    lm, shape = detect_facemesh_landmarks(image_path)

    # generate
    mesh = generate_full_head(
        image_path=image_path,
        face_landmarks=lm,
        image_shape=shape,
        resolution=settings["resolution"],
        use_depth=settings["use_depth"],
        depth_strength=depth_strength if settings["use_depth"] else 0.0,
    )

    # export
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    mesh.export(out_path, file_type="glb")
    print(f"[HeadGen] Exported: {out_path} | verts={len(mesh.vertices)} faces={len(mesh.faces)}")


if __name__ == "__main__":
    _cli()
