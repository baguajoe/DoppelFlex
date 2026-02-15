# src/api/head_mesh_generator.py
# Full Head Avatar Generator - HYBRID approach (COMPLETE + ROBUST)
# Front face: MediaPipe landmark positions (real face shape)
# Triangulation: Uses MediaPipe FACEMESH_TESSELATION topology when available
# Back/sides: Template back shell placed BEHIND the face plane
# Seam: Angle-sorted face boundary + stable stitch
# Depth: Optional MiDaS refinement with consistent coordinate mapping
# Neck: Proportional neck
# Cleanup: remove degenerate/duplicate faces, merge vertices, fix normals
#
# IMPORTANT:
# - This file includes a robust import block that works across MediaPipe layouts:
#     mediapipe.solutions..., mediapipe.python.solutions..., or mp.solutions...
# - If topology is unavailable, it falls back to Delaunay (less ideal).
# - This version also compresses the MediaPipe depth curve so the nose
#   does not inflate disproportionately.

import numpy as np
import cv2
import trimesh
import scipy.spatial as sp


# ──────────────────────────────────────────────────────────────────────────────
# Scaling constants (MUST MATCH your existing landmark->mesh mapping)
# ──────────────────────────────────────────────────────────────────────────────
X_SCALE = 0.24
Y_SCALE = 0.30
Y_OFFSET = 0.85
Z_SCALE = 0.15
Z_OFFSET = 0.12


# ──────────────────────────────────────────────────────────────────────────────
# Robust MediaPipe topology import (works across versions/layouts)
# ──────────────────────────────────────────────────────────────────────────────
FACEMESH_TESSELATION = None
try:
    # Older/common layout
    from mediapipe.solutions.face_mesh_connections import FACEMESH_TESSELATION as _TESS
    FACEMESH_TESSELATION = _TESS
except Exception:
    try:
        # Some builds expose this layout
        from mediapipe.python.solutions.face_mesh_connections import FACEMESH_TESSELATION as _TESS
        FACEMESH_TESSELATION = _TESS
    except Exception:
        try:
            # Fallback via mp.solutions
            import mediapipe as mp
            FACEMESH_TESSELATION = mp.solutions.face_mesh.FACEMESH_TESSELATION
        except Exception:
            FACEMESH_TESSELATION = None
            print("[HeadGen] WARNING: MediaPipe topology unavailable — using fallback triangulation")


# ──────────────────────────────────────────────────────────────────────────────
# DEPTH COMPRESSION (prevents nose inflation)
# ──────────────────────────────────────────────────────────────────────────────

def normalize_face_depth(z_values, strength=0.55):
    """
    Compress MediaPipe depth so nose doesn't inflate.
    strength:
      - lower (0.45) = more compression (smaller nose)
      - higher (0.65) = more depth (bigger nose)
    """
    z = np.asarray(z_values, dtype=np.float32)

    # center around 0
    z = z - float(z.mean())

    # nonlinear compression
    z = np.sign(z) * (np.abs(z) ** float(strength))

    # normalize to [-1, 1]
    z = z / (float(np.max(np.abs(z))) + 1e-6)
    return z


# ──────────────────────────────────────────────────────────────────────────────
# Main generator
# ──────────────────────────────────────────────────────────────────────────────

def generate_full_head(
    image_path,
    face_landmarks,
    image_shape,
    resolution=32,
    use_depth=True,
    depth_strength=0.03
):
    """
    Hybrid pipeline:
    1) Extract face points from MediaPipe landmarks (real face shape)
    2) Triangulate face using MediaPipe topology (prevents mask plates/spikes)
    3) Generate back shell behind face plane
    4) Merge + stitch seam
    5) Optional MiDaS depth refinement on face only
    6) Add neck
    7) Cleanup mesh
    """
    print("[HeadGen] Starting hybrid head generation...")

    landmarks = face_landmarks.landmark

    # ─── Step 1: Extract 3D face points from landmarks (with depth compression) ───
    print("[HeadGen] Step 1: Extracting face landmark positions...")

    # MediaPipe z is usually negative toward the camera.
    # Convert to "forward-positive" then compress so the nose doesn't balloon.
    raw_z = np.array([lm.z for lm in landmarks], dtype=np.float32)
    forward_z = -raw_z
    depth_curve = normalize_face_depth(forward_z, strength=0.55)

    face_points = []
    for i, lm in enumerate(landmarks):
        x = (lm.x - 0.5) * X_SCALE
        y = (0.5 - lm.y) * Y_SCALE + Y_OFFSET
        z = depth_curve[i] * Z_SCALE + Z_OFFSET
        face_points.append([x, y, z])

    face_points = np.array(face_points, dtype=np.float32)
    print(f"  -> {len(face_points)} face landmarks")

    # ─── Step 2: Triangulate face surface ───
    print("[HeadGen] Step 2: Triangulating face surface...")
    face_faces = triangulate_face(face_points)
    print(f"  -> {len(face_faces)} face triangles")

    # ─── Step 3: Generate back-of-head shell ───
    print("[HeadGen] Step 3: Generating back-of-head shell...")
    back_verts, back_faces = generate_back_shell(face_points, resolution=resolution)
    print(f"  -> {len(back_verts)} back vertices, {len(back_faces)} back faces")

    # ─── Step 4: Merge front face + back shell ───
    print("[HeadGen] Step 4: Merging front and back...")
    num_face_verts = len(face_points)
    back_faces_offset = back_faces + num_face_verts

    all_verts = np.vstack([face_points, back_verts])
    all_faces = np.vstack([face_faces, back_faces_offset])

    # ─── Step 5: Stitch seam ───
    print("[HeadGen] Step 5: Stitching face-to-back seam...")
    stitch_faces = stitch_face_to_back(face_points, back_verts, face_vert_offset=num_face_verts)
    if len(stitch_faces) > 0:
        all_faces = np.vstack([all_faces, np.asarray(stitch_faces, dtype=np.int64)])
    print(f"  -> {len(stitch_faces)} stitch faces")

    # ─── Step 6: Optional MiDaS depth refinement ───
    if use_depth:
        print("[HeadGen] Step 6: Applying MiDaS depth refinement...")
        all_verts = refine_face_depth(
            vertices=all_verts,
            image_path=image_path,
            num_face_verts=num_face_verts,
            depth_strength=depth_strength
        )
    else:
        print("[HeadGen] Step 6: Depth refinement skipped")

    # ─── Step 7: Add neck ───
    print("[HeadGen] Step 7: Adding neck...")
    all_verts, all_faces = add_neck(all_verts, all_faces, resolution=resolution)

    # ─── Step 8: Build mesh + cleanup ───
    print("[HeadGen] Step 8: Building final mesh + cleanup...")
    mesh = trimesh.Trimesh(vertices=all_verts, faces=all_faces, process=False)

    cleanup_mesh(mesh)

    # Light smoothing (safe)
    try:
        trimesh.smoothing.filter_laplacian(mesh, iterations=1, lamb=0.25)
    except Exception:
        pass

    mesh.fix_normals()

    print(f"[HeadGen] Done: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# TRIANGULATION (MediaPipe topology preferred)
# ──────────────────────────────────────────────────────────────────────────────

def triangulate_face(face_points):
    """
    Best: Build triangles from MediaPipe FACEMESH_TESSELATION edges.
    Fallback: Delaunay on XY with filtering (can cause artifacts, but won't crash).
    """
    if FACEMESH_TESSELATION is not None:
        print("[HeadGen] Using MediaPipe tessellation topology...")
        faces = build_triangles_from_tessellation(FACEMESH_TESSELATION)

        # Safety filter: remove triangles that are too large (helps boundary artifacts)
        faces = filter_large_triangles(face_points, faces, max_edge=0.09)

        # If we get a healthy amount of faces, return.
        if len(faces) > 500:
            return faces

        print("[HeadGen] Tessellation produced too few faces, falling back to Delaunay.")

    # Fallback Delaunay (less ideal)
    tri = sp.Delaunay(face_points[:, :2])
    faces = tri.simplices.astype(np.int64)
    faces = filter_large_triangles(face_points, faces, max_edge=0.08)
    return faces


def build_triangles_from_tessellation(tessellation_edges):
    """
    MediaPipe provides a set of edges (vertex index pairs). We reconstruct triangles
    by finding 3-cycles in the adjacency graph.

    Returns:
        np.ndarray (N, 3) int64 triangles
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


def filter_large_triangles(verts, faces, max_edge=0.08):
    """Remove triangles with any edge longer than max_edge."""
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
# BACK SHELL (placed BEHIND face plane)
# ──────────────────────────────────────────────────────────────────────────────

def generate_back_shell(face_points, resolution=32):
    """
    Generate the back half of the head as a half-sphere shell.
    Sized and positioned to match the face boundary.
    Key: placed BEHIND face plane to avoid stacking on face.
    """
    face_center_x = float(face_points[:, 0].mean())
    face_center_y = float(face_points[:, 1].mean())
    face_width = float(face_points[:, 0].max() - face_points[:, 0].min())
    face_height = float(face_points[:, 1].max() - face_points[:, 1].min())
    face_z_min = float(face_points[:, 2].min())

    radius_x = max(face_width * 0.60, 0.04)
    radius_y = max(face_height * 0.58, 0.05)
    radius_z = max(face_width * 0.55, 0.04)

    back_center_z = face_z_min - radius_z * 0.18

    lat_steps = max(8, resolution // 2)
    lon_steps = max(16, resolution)

    vertices = []

    for i in range(lat_steps + 1):
        theta = np.pi * i / lat_steps
        for j in range(lon_steps + 1):
            phi = np.pi + np.pi * j / lon_steps

            x = radius_x * np.sin(theta) * np.cos(phi) + face_center_x
            y = radius_y * np.cos(theta) + face_center_y
            z = radius_z * np.sin(theta) * np.sin(phi) + back_center_z

            if z < back_center_z - radius_z * 0.55:
                z = z * 0.92 + (back_center_z - radius_z * 0.55) * 0.08

            vertices.append([x, y, z])

    vertices = np.array(vertices, dtype=np.float32)

    faces = []
    for i in range(lat_steps):
        for j in range(lon_steps):
            v0 = i * (lon_steps + 1) + j
            v1 = v0 + 1
            v2 = (i + 1) * (lon_steps + 1) + j
            v3 = v2 + 1
            faces.append([v0, v2, v1])
            faces.append([v1, v2, v3])

    return vertices, np.asarray(faces, dtype=np.int64)


# ──────────────────────────────────────────────────────────────────────────────
# STITCH SEAM (ordered boundary loop)
# ──────────────────────────────────────────────────────────────────────────────

def stitch_face_to_back(face_points, back_verts, face_vert_offset):
    """
    Create triangles connecting face boundary to the 'front-most' ring
    of the back shell. Boundary is angle-sorted to avoid crisscross stitching.
    """
    from scipy.spatial import ConvexHull

    try:
        hull = ConvexHull(face_points[:, :2])
        boundary = list(hull.vertices)
    except Exception:
        center = face_points.mean(axis=0)
        r = np.linalg.norm(face_points[:, :2] - center[:2], axis=1)
        boundary = np.where(r >= np.quantile(r, 0.85))[0].tolist()

    if len(boundary) < 10:
        return []

    c2 = face_points[boundary][:, :2].mean(axis=0)
    ang = np.arctan2(face_points[boundary][:, 1] - c2[1],
                     face_points[boundary][:, 0] - c2[0])
    boundary = [boundary[i] for i in np.argsort(ang)]

    z = back_verts[:, 2]
    z_thresh = np.quantile(z, 0.92)
    shell_ring = np.where(z >= z_thresh)[0]
    if len(shell_ring) < 10:
        shell_ring = np.where(z >= np.quantile(z, 0.90))[0]
    if len(shell_ring) < 10:
        return []

    shell_pts = back_verts[shell_ring]

    nearest_shell = []
    for fi in boundary:
        fp = face_points[fi]
        d = np.linalg.norm(shell_pts - fp, axis=1)
        nearest_shell.append(shell_ring[int(np.argmin(d))])

    stitch_faces = []
    n = len(boundary)
    for i in range(n):
        f0 = boundary[i]
        f1 = boundary[(i + 1) % n]
        b0 = nearest_shell[i] + face_vert_offset
        b1 = nearest_shell[(i + 1) % n] + face_vert_offset

        stitch_faces.append([f0, f1, b0])
        stitch_faces.append([f1, b1, b0])

    return stitch_faces


# ──────────────────────────────────────────────────────────────────────────────
# MIDAS DEPTH REFINEMENT (consistent mapping)
# ──────────────────────────────────────────────────────────────────────────────

def refine_face_depth(vertices, image_path, num_face_verts, depth_strength=0.03):
    """
    Apply MiDaS monocular depth estimation to refine Z-depth of face vertices.
    Only affects the front face vertices (first num_face_verts).
    Uses consistent inverse mapping for pixel sampling.
    """
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

        d_min, d_max = depth_map.min(), depth_map.max()
        if d_max - d_min < 1e-6:
            return vertices

        depth_map = (depth_map - d_min) / (d_max - d_min)

        h, w = img.shape[:2]
        refined = vertices.copy()

        for vi in range(min(num_face_verts, len(vertices))):
            vx, vy, _vz = refined[vi]

            lm_x = (vx / X_SCALE) + 0.5
            lm_y = 0.5 - ((vy - Y_OFFSET) / Y_SCALE)

            px = int(np.clip(lm_x * w, 0, w - 1))
            py = int(np.clip(lm_y * h, 0, h - 1))

            depth_val = depth_map[py, px]
            refined[vi, 2] += (depth_val - 0.5) * depth_strength

        return refined

    except Exception as e:
        print(f"[HeadGen] MiDaS depth skipped: {e}")
        return vertices


# ──────────────────────────────────────────────────────────────────────────────
# NECK
# ──────────────────────────────────────────────────────────────────────────────

def add_neck(vertices, faces, resolution=32):
    head_width = float(vertices[:, 0].max() - vertices[:, 0].min())
    head_center_x = float(vertices[:, 0].mean())
    head_center_z = float(vertices[:, 2].mean())
    min_y = float(vertices[:, 1].min())

    neck_radius = max(head_width * 0.30, 0.02)
    neck_length = 0.015
    neck_rings = 3
    lon_steps = max(16, resolution)

    neck_verts = []
    neck_faces = []
    base_idx = len(vertices)

    for ring in range(neck_rings + 1):
        t = ring / neck_rings
        y = min_y - t * neck_length
        r = neck_radius * (1.0 - t * 0.10)

        for j in range(lon_steps + 1):
            phi = 2 * np.pi * j / lon_steps
            x = head_center_x + r * np.cos(phi)
            z = head_center_z + r * np.sin(phi)
            neck_verts.append([x, y, z])

    for ring in range(neck_rings):
        for j in range(lon_steps):
            v0 = base_idx + ring * (lon_steps + 1) + j
            v1 = v0 + 1
            v2 = v0 + (lon_steps + 1)
            v3 = v2 + 1
            neck_faces.append([v0, v2, v1])
            neck_faces.append([v1, v2, v3])

    if neck_verts:
        all_verts = np.vstack([vertices, np.asarray(neck_verts, dtype=np.float32)])
        all_faces = np.vstack([faces, np.asarray(neck_faces, dtype=np.int64)])
        return all_verts, all_faces

    return vertices, faces


# ──────────────────────────────────────────────────────────────────────────────
# CLEANUP
# ──────────────────────────────────────────────────────────────────────────────

def cleanup_mesh(mesh: trimesh.Trimesh):
    try:
        mesh.remove_degenerate_faces()
    except Exception:
        pass
    try:
        mesh.remove_duplicate_faces()
    except Exception:
        pass
    try:
        mesh.remove_unreferenced_vertices()
    except Exception:
        pass
    try:
        mesh.merge_vertices()
    except Exception:
        pass
    try:
        mesh.fix_normals()
    except Exception:
        pass
