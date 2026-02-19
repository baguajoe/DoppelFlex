# src/api/template_head_deformer.py
# =============================================================================
# TEMPLATE-BASED HEAD DEFORMATION (v5.3 — SAFE EYE HOLES + NO HELMET TEAR)
#
# Fixes vs your v5.2:
# - NO smoothing inside carve_eye_sockets (prevents double-smooth collapse)
# - Eye smoothing BEFORE cutting holes, holes cut LAST
# - Eye hole cutting is vertex-any (removes face if ANY vertex inside ellipse)
# - Adds EYE_ANCHORS (eye corners only) to stabilize forehead/eye region
# =============================================================================

import os
import numpy as np
import cv2
import trimesh


# Landmark mapping constants
X_SCALE  = 0.24
Y_SCALE  = 0.30
Y_OFFSET = 0.85
Z_SCALE  = 0.15
Z_OFFSET = 0.12


# ──────────────────────────────────────────────────────────────────────────────
# Landmark helpers
# ──────────────────────────────────────────────────────────────────────────────

def landmarks_to_3d(face_landmarks):
    """Convert MediaPipe landmarks to 3D mesh coordinate space."""
    points = []
    for lm in face_landmarks.landmark:
        x = (lm.x - 0.5) * X_SCALE
        y = (0.5 - lm.y) * Y_SCALE + Y_OFFSET
        z = (-lm.z) * Z_SCALE + Z_OFFSET
        points.append([x, y, z])
    return np.array(points, dtype=np.float32)


# Key landmark groups
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
             397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

LEFT_EYE  = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

NOSE = [1, 2, 4, 5, 6, 19, 20, 94, 97, 98, 99, 168, 195, 197, 326, 327, 328]
LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]

LEFT_IRIS  = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]

# Brow hints keep forehead stable
BROW_HINTS = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300]

# Eye-corner anchors (NOT full eyelid rings)
EYE_ANCHORS = [33, 133, 263, 362]

# Deformation targets: exclude eyelid rings, but keep corners as anchors
DEFORM_TARGETS = list(set(FACE_OVAL + NOSE + LIPS_OUTER + BROW_HINTS + EYE_ANCHORS))


# ──────────────────────────────────────────────────────────────────────────────
# Inline template generation
# ──────────────────────────────────────────────────────────────────────────────

TEMPLATE_PARAMS = {
    "neutral": {
        "jaw_width": 0.85, "forehead_width": 0.95, "cheek_fullness": 0.92,
        "head_length": 1.15, "brow_ridge": 0.025, "neck_width": 0.55,
    },
    "male": {
        "jaw_width": 0.92, "forehead_width": 0.97, "cheek_fullness": 0.88,
        "head_length": 1.2, "brow_ridge": 0.035, "neck_width": 0.60,
    },
    "female": {
        "jaw_width": 0.78, "forehead_width": 0.93, "cheek_fullness": 0.95,
        "head_length": 1.1, "brow_ridge": 0.015, "neck_width": 0.48,
    },
}


def _generate_template_mesh(params):
    """Generate head with flat cylindrical neck. No converging point."""
    jaw_width = params.get("jaw_width", 0.85)
    forehead_width = params.get("forehead_width", 0.95)
    cheek_fullness = params.get("cheek_fullness", 0.9)
    head_length = params.get("head_length", 1.2)
    brow_ridge = params.get("brow_ridge", 0.03)
    neck_width = params.get("neck_width", 0.55)

    lat, lon = 56, 64
    base_rx, base_ry, base_rz = 0.12, 0.15, 0.13

    vertices = []
    head_lat_end = int(lat * 0.82)

    for i in range(head_lat_end + 1):
        theta = np.pi * i / lat
        t = i / lat

        for j in range(lon + 1):
            phi = 2 * np.pi * j / lon
            sx = np.sin(theta) * np.cos(phi)
            sy = np.cos(theta)
            sz = np.sin(theta) * np.sin(phi)

            rx, ry, rz = base_rx, base_ry, base_rz * head_length

            if 0.15 < t < 0.35:
                rx *= forehead_width
                if 0.28 < t < 0.35 and sz > 0.3:
                    rz += brow_ridge
            if 0.42 < t < 0.55:
                rx *= cheek_fullness
            if 0.55 < t < 0.75:
                jaw_t = (t - 0.55) / 0.20
                rx *= (1.0 - jaw_t * (1.0 - jaw_width))
            if t > 0.70:
                chin_t = min((t - 0.70) / 0.12, 1.0)
                min_rx = base_rx * neck_width
                rx = max(rx * (1.0 - chin_t * 0.4), min_rx)
                rz = max(rz * (1.0 - chin_t * 0.3), base_rz * 0.5)
            if sz < -0.5:
                rz *= 0.92

            vertices.append([sx * rx, sy * ry + Y_OFFSET, sz * rz + Z_OFFSET])

    # Neck cylinder
    last_ring_start = head_lat_end * (lon + 1)
    last_ring = np.array(vertices[last_ring_start:last_ring_start + lon + 1])
    neck_cx = last_ring[:, 0].mean()
    neck_cy = last_ring[:, 1].min()
    neck_cz = last_ring[:, 2].mean()
    neck_rx = (last_ring[:, 0].max() - last_ring[:, 0].min()) / 2 * 0.85
    neck_rz = (last_ring[:, 2].max() - last_ring[:, 2].min()) / 2 * 0.85

    neck_start_idx = len(vertices)
    neck_rings, neck_length = 4, 0.04

    for ring in range(neck_rings + 1):
        t = ring / neck_rings
        y = neck_cy - t * neck_length
        rx = neck_rx * (1.0 - t * 0.05)
        rz = neck_rz * (1.0 - t * 0.05)
        for j in range(lon + 1):
            phi = 2 * np.pi * j / lon
            vertices.append([neck_cx + rx * np.cos(phi), y, neck_cz + rz * np.sin(phi)])

    vertices = np.array(vertices, dtype=np.float32)

    faces = []
    for i in range(head_lat_end):
        for j in range(lon):
            v0 = i * (lon + 1) + j
            v1 = v0 + 1
            v2 = (i + 1) * (lon + 1) + j
            v3 = v2 + 1
            faces.append([v0, v1, v2])
            faces.append([v1, v3, v2])

    for j in range(lon):
        hv0 = head_lat_end * (lon + 1) + j
        hv1 = hv0 + 1
        nv0 = neck_start_idx + j
        nv1 = nv0 + 1
        faces.append([hv0, hv1, nv0])
        faces.append([hv1, nv1, nv0])

    for ring in range(neck_rings):
        for j in range(lon):
            v0 = neck_start_idx + ring * (lon + 1) + j
            v1 = v0 + 1
            v2 = neck_start_idx + (ring + 1) * (lon + 1) + j
            v3 = v2 + 1
            faces.append([v0, v1, v2])
            faces.append([v1, v3, v2])

    bot = neck_start_idx + neck_rings * (lon + 1)
    for j in range(1, lon - 1):
        faces.append([bot, bot + j + 1, bot + j])

    mesh = trimesh.Trimesh(vertices=vertices, faces=np.array(faces, dtype=np.int64), process=False)
    mesh.fix_normals()
    return mesh


def load_template(template_name="neutral"):
    params = TEMPLATE_PARAMS.get(template_name, TEMPLATE_PARAMS["neutral"])
    mesh = _generate_template_mesh(params)
    print(f"[TemplateDeform] Generated '{template_name}': {len(mesh.vertices)}v, {len(mesh.faces)}f")
    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# Safety clamp
# ──────────────────────────────────────────────────────────────────────────────

def clamp_spike(mesh, face_landmarks):
    """Clamp vertex Y to max 20% below chin."""
    lm = landmarks_to_3d(face_landmarks)
    chin_y = float(lm[:468].min(axis=0)[1])
    top_y = float(lm[:468].max(axis=0)[1])
    min_y = chin_y - (top_y - chin_y) * 0.20

    verts = np.array(mesh.vertices)
    n = int(np.sum(verts[:, 1] < min_y))
    if n > 0:
        print(f"[TemplateDeform] SAFETY: Clamped {n} vertices below Y={min_y:.3f}")
        verts[:, 1] = np.maximum(verts[:, 1], min_y)
        mesh.vertices = verts
    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# Eye sockets (push in)
# ──────────────────────────────────────────────────────────────────────────────

def carve_eye_sockets(mesh, face_landmarks, socket_depth=0.008, soften=0.70):
    """Push vertices in eye regions slightly back in Z to form sockets."""
    lm = landmarks_to_3d(face_landmarks)
    verts = np.array(mesh.vertices, dtype=np.float32)

    def socket_for(eye_idx):
        pts = lm[eye_idx]
        c = pts.mean(axis=0)
        mn = pts.min(axis=0)
        mx = pts.max(axis=0)
        pad_x = (mx[0] - mn[0]) * 0.55
        pad_y = (mx[1] - mn[1]) * 0.70
        pad_z = (mx[2] - mn[2]) * 1.50
        mn2 = np.array([mn[0] - pad_x, mn[1] - pad_y, mn[2] - pad_z], dtype=np.float32)
        mx2 = np.array([mx[0] + pad_x, mx[1] + pad_y, mx[2] + pad_z], dtype=np.float32)
        return c, mn2, mx2

    lc, lmn, lmx = socket_for(LEFT_EYE)
    rc, rmn, rmx = socket_for(RIGHT_EYE)

    def apply_socket(center, mn, mx):
        nonlocal verts
        in_box = (
            (verts[:, 0] >= mn[0]) & (verts[:, 0] <= mx[0]) &
            (verts[:, 1] >= mn[1]) & (verts[:, 1] <= mx[1]) &
            (verts[:, 2] >= mn[2]) & (verts[:, 2] <= mx[2])
        )
        idx = np.where(in_box)[0]
        if idx.size == 0:
            return

        d = verts[idx] - center
        dx = (mx[0] - mn[0]) + 1e-6
        dy = (mx[1] - mn[1]) + 1e-6
        dz = (mx[2] - mn[2]) + 1e-6
        nd = np.sqrt((d[:, 0] / dx) ** 2 + (d[:, 1] / dy) ** 2 + (d[:, 2] / dz) ** 2)

        w = np.clip(1.0 - nd / soften, 0.0, 1.0)
        w = w * w
        verts[idx, 2] -= socket_depth * w

    apply_socket(lc, lmn, lmx)
    apply_socket(rc, rmn, rmx)

    mesh.vertices = verts
    mesh.fix_normals()
    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# Eye holes (vertex-any: remove face if ANY vertex inside ellipse band)
# ──────────────────────────────────────────────────────────────────────────────

def cut_eye_openings(mesh, face_landmarks, extra_scale=1.35):
    """
    More reliable: remove faces if ANY of their vertices fall inside eye ellipse band.
    This works even when face centroids miss the ellipse.
    """
    lm = landmarks_to_3d(face_landmarks)
    V = np.asarray(mesh.vertices, dtype=np.float32)
    F = np.asarray(mesh.faces, dtype=np.int64)
    if len(F) == 0:
        return mesh

    def eye_region_mask(eye_idx, scale):
        pts = lm[eye_idx]
        c = pts.mean(axis=0)
        mn = pts.min(axis=0)
        mx = pts.max(axis=0)

        rx = max((mx[0] - mn[0]) * 0.60 * scale, 1e-6)
        ry = max((mx[1] - mn[1]) * 0.60 * scale, 1e-6)

        # tight bands (prevents forehead bite)
        y0 = c[1] - ry * 0.95
        y1 = c[1] + ry * 0.95
        x0 = c[0] - rx * 0.95
        x1 = c[0] + rx * 0.95

        dx = (V[:, 0] - c[0]) / rx
        dy = (V[:, 1] - c[1]) / ry
        inside = (dx * dx + dy * dy) <= 1.0
        band = (V[:, 1] >= y0) & (V[:, 1] <= y1) & (V[:, 0] >= x0) & (V[:, 0] <= x1)
        return inside & band

    maskL = eye_region_mask(LEFT_EYE, extra_scale)
    maskR = eye_region_mask(RIGHT_EYE, extra_scale)

    # Remove faces if any of their vertices are in mask
    remove = maskL[F].any(axis=1) | maskR[F].any(axis=1)
    removed = int(remove.sum())
    print(f"[TemplateDeform] Eye cut: removed {removed} faces (vertex-any, scale={extra_scale})")

    if removed == 0:
        scale2 = extra_scale * 1.2
        maskL = eye_region_mask(LEFT_EYE, scale2)
        maskR = eye_region_mask(RIGHT_EYE, scale2)
        remove = maskL[F].any(axis=1) | maskR[F].any(axis=1)
        removed = int(remove.sum())
        print(f"[TemplateDeform] Eye cut retry: removed {removed} faces (scale={scale2:.2f})")
        if removed == 0:
            return mesh

    mesh.update_faces(~remove)
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# Deformation
# ──────────────────────────────────────────────────────────────────────────────

def deform_template_to_face(
    image_path, face_landmarks, image_shape,
    template="neutral", deform_strength=0.7,
    use_depth=True, depth_strength=0.025,
):
    mesh = load_template(template)
    verts = np.array(mesh.vertices, dtype=np.float32)

    lm_points = landmarks_to_3d(face_landmarks)

    lm_center = lm_points[:468].mean(axis=0)
    lm_min = lm_points[:468].min(axis=0)
    lm_max = lm_points[:468].max(axis=0)
    lm_size = lm_max - lm_min
    chin_y = float(lm_min[1])

    tmpl_center = verts.mean(axis=0)
    tmpl_size = verts.max(axis=0) - verts.min(axis=0)
    scale = lm_size / np.maximum(tmpl_size, 1e-6)
    scale[2] = (scale[0] + scale[1]) / 2

    verts = (verts - tmpl_center) * scale + lm_center
    pre_deform_verts = verts.copy()

    print(f"[TemplateDeform] Scale: {scale[0]:.3f}, {scale[1]:.3f}, {scale[2]:.3f}")

    max_disp = lm_size.mean() * 0.25

    center_z = verts[:, 2].mean()
    z_range = float(verts[:, 2].max() - verts[:, 2].min())

    deform_weights = np.zeros(len(verts), dtype=np.float32)
    for vi in range(len(verts)):
        v = verts[vi]
        if v[1] < chin_y:
            continue
        front_w = np.clip((v[2] - center_z) / (z_range * 0.35 + 1e-6), 0, 1)
        chin_margin = lm_size[1] * 0.12
        if v[1] < chin_y + chin_margin:
            vert_w = np.clip((v[1] - chin_y) / max(chin_margin, 1e-6), 0, 1)
        else:
            vert_w = 1.0
        deform_weights[vi] = front_w * vert_w

    # Build eye "no-deform" boxes (prevents helmet skin over eyes)
    def eye_box(eye_idx, pad=1.65):
        pts = lm_points[eye_idx]
        mn = pts.min(axis=0)
        mx = pts.max(axis=0)
        size = (mx - mn)
        mn2 = mn - size * (pad - 1.0) * 0.5
        mx2 = mx + size * (pad - 1.0) * 0.5
        return mn2, mx2

    lmn2, lmx2 = eye_box(LEFT_EYE, pad=1.70)
    rmn2, rmx2 = eye_box(RIGHT_EYE, pad=1.70)

    # Extra "forehead freeze band" to stop helmet sheet sliding over eyes
    eye_line_y = float(lm_points[EYE_ANCHORS, 1].mean())
    forehead_freeze_y0 = eye_line_y - lm_size[1] * 0.02
    forehead_freeze_y1 = eye_line_y + lm_size[1] * 0.08

    # Compute smooth eye/forehead damping (0=no deform, 1=full deform)
    # instead of hard continue which creates tear lines
    def eye_damping(v, mn, mx):
        """Returns 0.0 at eye center, 1.0 outside box. Smooth falloff."""
        center = (mn + mx) * 0.5
        half = (mx - mn) * 0.5 + 1e-8
        # normalized distance from center (0=center, 1=edge)
        nd = np.abs((v - center) / half)
        # max across axes = how close to edge
        d = np.max(nd)
        if d >= 1.0:
            return 1.0  # outside box, full deform
        # smooth ramp: cubic ease so center is strongly damped
        return d * d * d

    def forehead_damping(v):
        """Returns 0.0 in freeze band center, 1.0 outside. Smooth."""
        if v[2] <= center_z:
            return 1.0  # back of head, no damping
        if v[1] < forehead_freeze_y0 or v[1] > forehead_freeze_y1:
            return 1.0  # outside band
        band_center = (forehead_freeze_y0 + forehead_freeze_y1) * 0.5
        band_half = (forehead_freeze_y1 - forehead_freeze_y0) * 0.5 + 1e-8
        d = abs(v[1] - band_center) / band_half
        return d * d  # quadratic: strong damping at center, fades at edges

    try:
        from scipy.spatial import cKDTree
    except Exception as e:
        raise ImportError("scipy is required for cKDTree. Install with: pip install scipy") from e

    key_idx = [i for i in DEFORM_TARGETS if i < len(lm_points)]
    key_pos = lm_points[key_idx]
    lm_tree = cKDTree(key_pos)

    deformed = verts.copy()

    for vi in range(len(verts)):
        w = deform_weights[vi]
        if w < 0.02:
            continue

        v = verts[vi]

        # Smooth damping near eyes (replaces hard continue)
        eye_damp = min(eye_damping(v, lmn2, lmx2), eye_damping(v, rmn2, rmx2))

        # Smooth damping in forehead band
        fh_damp = forehead_damping(v)

        # Combined damping (multiply — both can reduce)
        damp = eye_damp * fh_damp
        if damp < 0.01:
            continue  # effectively zero, skip for speed

        dists, indices = lm_tree.query(v, k=min(6, len(key_pos)))

        if np.isscalar(dists):
            dists = np.array([dists])
            indices = np.array([indices])

        safe_dists = np.maximum(dists, 1e-8)
        weights = 1.0 / (safe_dists ** 2)
        weights /= weights.sum()

        targets = key_pos[indices]
        displacement = (weights[:, None] * (targets - v)).sum(axis=0)

        disp_mag = np.linalg.norm(displacement)
        if disp_mag > max_disp:
            displacement = displacement * (max_disp / disp_mag)

        deformed[vi] = v + displacement * deform_strength * w * damp

    mesh.vertices = deformed

    # 1) carve sockets
    mesh = carve_eye_sockets(mesh, face_landmarks,
                             socket_depth=lm_size.mean() * 0.030, soften=0.70)

    # 2) smooth BEFORE cutting holes (prevents rim collapse/tearing)
    try:
        trimesh.smoothing.filter_laplacian(mesh, iterations=3, lamb=0.25)
    except Exception:
        pass

    # 3) cut holes LAST (keeps clean openings)
    mesh = cut_eye_openings(mesh, face_landmarks, extra_scale=1.35)

    # cleanup after face deletion to prevent sheet artifacts
    try:
        mesh.remove_degenerate_faces()
        mesh.remove_duplicate_faces()
        mesh.remove_unreferenced_vertices()
        mesh.merge_vertices()
    except Exception:
        pass

    try:
        mesh.remove_infinite_values()
    except Exception:
        pass

    mesh.fix_normals()

    mesh.metadata["pre_deform_verts"] = pre_deform_verts
    mesh.metadata["deform_weights"] = deform_weights

    print(f"[TemplateDeform] Deformed: {len(mesh.vertices)}v, {len(mesh.faces)}f")
    return mesh


# ──────────────────────────────────────────────────────────────────────────────
# Texture
# ──────────────────────────────────────────────────────────────────────────────

def project_selfie_texture(mesh, image_path, face_landmarks, style="realistic"):
    img = cv2.imread(image_path)
    if img is None:
        return mesh

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img_h, img_w = img_rgb.shape[:2]
    styled_img = _apply_style_filter(img_rgb, style)

    verts = np.array(mesh.vertices)
    num_verts = len(verts)

    uv_verts = mesh.metadata.get("pre_deform_verts", verts)

    lm_points = landmarks_to_3d(face_landmarks)
    chin_y = float(lm_points[:468, 1].min())

    center_z = uv_verts[:, 2].mean() if len(uv_verts) > 0 else lm_points[:468].mean(axis=0)[2]
    z_range = float(uv_verts[:, 2].max() - uv_verts[:, 2].min()) if len(uv_verts) > 0 else 0.1

    tex_weights = np.zeros(num_verts, dtype=np.float32)
    for vi in range(min(num_verts, len(uv_verts))):
        v = uv_verts[vi]
        if v[1] < chin_y:
            continue
        raw = (v[2] - center_z) / (z_range * 0.5 + 1e-6)
        tex_weights[vi] = np.clip(raw, 0, 1)

    front_samples = []
    pixel_data = {}

    for vi in range(num_verts):
        if vi >= len(uv_verts) or vi >= len(tex_weights):
            continue
        dw = tex_weights[vi]
        if dw < 0.05:
            continue

        uv = uv_verts[vi]
        px_norm = (uv[0] / X_SCALE) + 0.5
        py_norm = 0.5 - ((uv[1] - Y_OFFSET) / Y_SCALE)

        if 0.05 < px_norm < 0.95 and 0.05 < py_norm < 0.95:
            px = int(np.clip(px_norm * img_w, 0, img_w - 1))
            py = int(np.clip(py_norm * img_h, 0, img_h - 1))
            r, g, b = styled_img[py, px].astype(int).tolist()
            pixel_data[vi] = (r, g, b)
            if dw > 0.3:
                front_samples.append([r, g, b])

    if front_samples:
        avg_skin = np.median(front_samples, axis=0).astype(float)
    else:
        avg_skin = np.array([180.0, 140.0, 120.0])

    vertex_colors = np.zeros((num_verts, 4), dtype=np.uint8)

    for vi in range(num_verts):
        dw = tex_weights[vi] if vi < len(tex_weights) else 0.0

        if vi in pixel_data and dw > 0.05:
            tex_r, tex_g, tex_b = pixel_data[vi]
            if dw > 0.25:
                blend = 1.0
            elif dw > 0.03:
                blend = (dw - 0.03) / 0.22
                blend = blend * blend
            else:
                blend = 0.0

            r = int(tex_r * blend + avg_skin[0] * (1 - blend))
            g = int(tex_g * blend + avg_skin[1] * (1 - blend))
            b = int(tex_b * blend + avg_skin[2] * (1 - blend))
            vertex_colors[vi] = [np.clip(r, 0, 255), np.clip(g, 0, 255), np.clip(b, 0, 255), 255]
        else:
            noise = np.random.randint(-6, 7, 3)
            c = np.clip(avg_skin + noise, 0, 255).astype(np.uint8)
            vertex_colors[vi] = [c[0], c[1], c[2], 255]

    mesh.visual.vertex_colors = vertex_colors
    return mesh


def _apply_style_filter(img_rgb, style):
    if style == "realistic":
        return cv2.bilateralFilter(img_rgb, 5, 50, 50)
    elif style == "cartoon":
        gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY)
        gray = cv2.medianBlur(gray, 5)
        edges = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 5)
        smooth = cv2.bilateralFilter(img_rgb, 9, 300, 300)
        div = 32
        smooth = (smooth // div) * div + div // 2
        edges_c = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
        return cv2.bitwise_and(smooth, edges_c)
    elif style == "anime":
        smooth = cv2.bilateralFilter(img_rgb, 15, 200, 200)
        hsv = cv2.cvtColor(smooth, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.3, 0, 255)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * 1.1, 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)
    elif style == "pixel":
        h, w = img_rgb.shape[:2]
        small = cv2.resize(img_rgb, (max(w // 8, 1), max(h // 8, 1)), interpolation=cv2.INTER_NEAREST)
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)
    elif style == "oil_paint":
        try:
            return cv2.stylization(img_rgb, sigma_s=60, sigma_r=0.6)
        except Exception:
            return cv2.bilateralFilter(img_rgb, 9, 150, 150)
    return img_rgb


# ──────────────────────────────────────────────────────────────────────────────
# Eyeballs
# ──────────────────────────────────────────────────────────────────────────────

def add_eyeballs(mesh, face_landmarks):
    """Add eyeball spheres at iris positions."""
    lm = landmarks_to_3d(face_landmarks)
    if len(lm) < 478:
        return mesh

    def eye_center(iris_idx):
        return lm[iris_idx].mean(axis=0)

    def eye_width(outer, inner):
        return np.linalg.norm(lm[outer] - lm[inner])

    left_w = eye_width(33, 133)
    right_w = eye_width(263, 362)

    lr = max(left_w * 0.12, 0.002)
    rr = max(right_w * 0.12, 0.002)

    # Slightly forward so visible, but not popping out
    lc = eye_center(LEFT_IRIS) + np.array([0, 0, 0.0006], dtype=np.float32)
    rc = eye_center(RIGHT_IRIS) + np.array([0, 0, 0.0006], dtype=np.float32)

    left_eye = trimesh.creation.icosphere(subdivisions=2, radius=lr)
    right_eye = trimesh.creation.icosphere(subdivisions=2, radius=rr)
    left_eye.apply_translation(lc)
    right_eye.apply_translation(rc)

    for eye in [left_eye, right_eye]:
        eye.visual.vertex_colors = np.tile(
            np.array([[240, 240, 245, 255]], dtype=np.uint8),
            (len(eye.vertices), 1)
        )

    return trimesh.util.concatenate([mesh, left_eye, right_eye])


# ──────────────────────────────────────────────────────────────────────────────
# Ears (same as your version)
# ──────────────────────────────────────────────────────────────────────────────

def _create_ear_mesh(center, normal, up, height, width, depth):
    normal = normal / (np.linalg.norm(normal) + 1e-8)
    up = up / (np.linalg.norm(up) + 1e-8)
    right = np.cross(up, normal)
    right = right / (np.linalg.norm(right) + 1e-8)

    verts = []
    faces = []
    n_pts = 10

    for layer in range(2):
        layer_offset = -normal * depth * layer
        for edge in range(2):
            edge_scale = 0.6 if edge == 0 else 1.0
            for pi in range(n_pts):
                angle = np.radians(-50 + pi * (280 / (n_pts - 1)))
                y_off = np.cos(angle) * height * 0.45 * edge_scale
                x_off = np.sin(angle) * width * 0.35 * edge_scale
                protrude = normal * width * 0.2 * edge_scale
                pos = center + up * y_off + right * x_off + protrude + layer_offset
                verts.append(pos)

    verts = np.array(verts, dtype=np.float32)

    for layer in range(2):
        base = layer * (2 * n_pts)
        inner_start = base
        outer_start = base + n_pts
        for pi in range(n_pts - 1):
            i0 = inner_start + pi
            i1 = inner_start + pi + 1
            o0 = outer_start + pi
            o1 = outer_start + pi + 1
            faces.append([i0, o0, i1])
            faces.append([i1, o0, o1])

    front_inner = 0
    back_inner = 2 * n_pts
    front_outer = n_pts
    back_outer = 3 * n_pts

    for pi in range(n_pts - 1):
        f0 = front_outer + pi
        f1 = front_outer + pi + 1
        b0 = back_outer + pi
        b1 = back_outer + pi + 1
        faces.append([f0, f1, b0])
        faces.append([f1, b1, b0])

        f0 = front_inner + pi
        f1 = front_inner + pi + 1
        b0 = back_inner + pi
        b1 = back_inner + pi + 1
        faces.append([f0, b0, f1])
        faces.append([f1, b0, b1])

    faces = np.array(faces, dtype=np.int64)
    if len(faces) > 0 and faces.max() >= len(verts):
        faces = np.clip(faces, 0, len(verts) - 1)

    ear = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    ear.fix_normals()
    return ear


def add_ears(mesh, face_landmarks, skin_color_rgb=None):
    lm = landmarks_to_3d(face_landmarks)

    left_temple = lm[234]
    left_cheek = lm[93]
    left_ear_center = (left_temple + left_cheek) / 2

    right_temple = lm[454]
    right_cheek = lm[323]
    right_ear_center = (right_temple + right_cheek) / 2

    face_center = lm[:468].mean(axis=0)

    face_height = lm[:468, 1].max() - lm[:468, 1].min()
    ear_height = face_height * 0.28
    ear_width = ear_height * 0.55
    ear_depth = ear_height * 0.15

    up = np.array([0, 1, 0], dtype=np.float32)

    left_normal = left_ear_center - face_center
    left_normal[1] = 0
    left_normal = left_normal / (np.linalg.norm(left_normal) + 1e-8)
    left_pos = left_ear_center + left_normal * ear_width * 0.2

    right_normal = right_ear_center - face_center
    right_normal[1] = 0
    right_normal = right_normal / (np.linalg.norm(right_normal) + 1e-8)
    right_pos = right_ear_center + right_normal * ear_width * 0.2

    left_ear = _create_ear_mesh(left_pos, left_normal, up, ear_height, ear_width, ear_depth)
    right_ear = _create_ear_mesh(right_pos, right_normal, up, ear_height, ear_width, ear_depth)

    if skin_color_rgb is None:
        try:
            colors = np.array(mesh.visual.vertex_colors)
            mask = colors[:, 3] > 0
            if mask.any():
                avg = colors[mask, :3].mean(axis=0).astype(int)
                skin_color_rgb = [avg[0], avg[1], avg[2]]
            else:
                skin_color_rgb = [180, 140, 120]
        except Exception:
            skin_color_rgb = [180, 140, 120]

    r, g, b = skin_color_rgb[:3]

    for ear in [left_ear, right_ear]:
        n = len(ear.vertices)
        colors = np.full((n, 4), [r, g, b, 255], dtype=np.uint8)
        noise = np.random.randint(-6, 7, (n, 3))
        colors[:, :3] = np.clip(colors[:, :3].astype(int) + noise, 0, 255).astype(np.uint8)
        ear.visual.vertex_colors = colors

    combined = trimesh.util.concatenate([mesh, left_ear, right_ear])
    print(f"[TemplateDeform] Added ears: {len(left_ear.vertices)}+{len(right_ear.vertices)} verts")
    return combined


# ──────────────────────────────────────────────────────────────────────────────
# Full pipeline
# ──────────────────────────────────────────────────────────────────────────────

def generate_avatar_from_template(
    image_path, face_landmarks, image_shape,
    template="neutral", quality="balanced",
    texture_style="realistic", use_texture=True, add_eyes=True,
):
    quality_map = {
        "fast":     {"deform_strength": 0.45, "use_depth": False, "depth_strength": 0.0},
        "balanced": {"deform_strength": 0.6,  "use_depth": False, "depth_strength": 0.0},
        "high":     {"deform_strength": 0.7,  "use_depth": False, "depth_strength": 0.0},
    }
    settings = quality_map.get(quality, quality_map["balanced"])

    mesh = deform_template_to_face(
        image_path=image_path,
        face_landmarks=face_landmarks,
        image_shape=image_shape,
        template=template,
        deform_strength=settings["deform_strength"],
        use_depth=settings["use_depth"],
        depth_strength=settings["depth_strength"],
    )

    if use_texture:
        mesh = project_selfie_texture(mesh, image_path, face_landmarks, style=texture_style)

    if add_eyes:
        try:
            mesh = add_eyeballs(mesh, face_landmarks)
        except Exception as e:
            print(f"[TemplateDeform] Eyeballs skipped: {e}")

    try:
        mesh = add_ears(mesh, face_landmarks)
    except Exception as e:
        print(f"[TemplateDeform] Ears skipped: {e}")

    mesh = clamp_spike(mesh, face_landmarks)
    return mesh