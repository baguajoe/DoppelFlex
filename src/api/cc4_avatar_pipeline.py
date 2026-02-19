# src/api/cc4_avatar_pipeline.py
# =============================================================================
# CC4 AVATAR PIPELINE — Character Creator model-based avatar generation
#
# Replaces the procedural sphere pipeline with a real CC4 base model.
# Single model provides: head with proper topology, eyes, teeth, tongue,
# full body with skeleton (123 bones), UV maps on all meshes.
#
# CC4 Coordinate System:
#   X = left(-) / right(+)     arm span ~154cm
#   Y = back(+) / front(-)     depth ~31cm (negative Y = face forward)
#   Z = down(0) / up(179)      height in cm
#
# Face region: Z > 155 (above chin), Y < -2 (front-facing)
# Eye line:    Z ≈ 168
# Head top:    Z ≈ 179
# =============================================================================

import os
import numpy as np
import cv2
import trimesh
from PIL import Image


# ──────────────────────────────────────────────────────────────────────────────
# CC4 Model Constants
# ──────────────────────────────────────────────────────────────────────────────

CC4_MODEL_FILENAME = "cc4_optimized.glb"

# CC4 face bounding box (from mesh analysis)
CC4_FACE_X_RANGE = (-6.8, 6.8)       # face width ~13.6cm
CC4_FACE_Y_RANGE = (-10.1, -2.0)     # depth (front to back)
CC4_FACE_Z_RANGE = (155.0, 179.0)    # chin to top of head

CC4_EYE_Z = 168.0                     # eye line height
CC4_CHIN_Z = 155.0                    # chin height
CC4_HEAD_TOP_Z = 179.0               # top of head

# Face mesh name in CC4 scene
CC4_FACE_MESH = "CC_Base_Body"        # main head/body mesh with face

# CC4 face feature heights (Z coordinates, measured from model)
CC4_FEATURES = {
    "forehead":  175.7,
    "eyes":      167.8,
    "nose":      164.3,
    "mouth":     161.2,
    "chin":      156.7,
}

# CC4 eye X positions
CC4_LEFT_EYE_X = -3.13
CC4_RIGHT_EYE_X = 3.13

# MediaPipe landmark indices for key features
MP_FOREHEAD = 10
MP_LEFT_EYE = 159    # upper eyelid center
MP_RIGHT_EYE = 386   # upper eyelid center
MP_NOSE_TIP = 1
MP_MOUTH_CENTER = 13  # upper lip
MP_CHIN = 152

# Head region thresholds
HEAD_Z_MIN = 155.0                    # above this = head
FACE_Y_MAX = -1.0                     # below this = front-facing


# ──────────────────────────────────────────────────────────────────────────────
# MediaPipe Landmark Constants
# ──────────────────────────────────────────────────────────────────────────────

FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
             397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
             172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

LEFT_EYE  = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]

NOSE = [1, 2, 4, 5, 6, 19, 20, 94, 97, 98, 99, 168, 195, 197, 326, 327, 328]
LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]

BROW_HINTS = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300]
EYE_ANCHORS = [33, 133, 263, 362]

DEFORM_TARGETS = list(set(FACE_OVAL + NOSE + LIPS_OUTER + BROW_HINTS + EYE_ANCHORS))


# ──────────────────────────────────────────────────────────────────────────────
# Model Loading
# ──────────────────────────────────────────────────────────────────────────────

def find_cc4_model():
    """Find the CC4 optimized GLB model file."""
    search_paths = [
        os.path.join(os.path.dirname(__file__), "..", "static", "models", CC4_MODEL_FILENAME),
        os.path.join(os.path.dirname(__file__), "..", "..", "static", "models", CC4_MODEL_FILENAME),
        os.path.join("static", "models", CC4_MODEL_FILENAME),
        os.path.join("src", "static", "models", CC4_MODEL_FILENAME),
    ]
    for p in search_paths:
        abs_p = os.path.abspath(p)
        if os.path.exists(abs_p):
            return abs_p
    return None


def load_cc4_model():
    """
    Load the CC4 model as a trimesh Scene.
    Returns the Scene with all geometry, materials, and skeleton intact.
    """
    path = find_cc4_model()
    if path is None:
        raise FileNotFoundError(
            f"CC4 model '{CC4_MODEL_FILENAME}' not found. "
            f"Place it in static/models/{CC4_MODEL_FILENAME}"
        )

    scene = trimesh.load(path)
    if not isinstance(scene, trimesh.Scene):
        raise ValueError("CC4 model should load as a Scene, got single mesh")

    mesh_names = list(scene.geometry.keys())
    total_v = sum(len(g.vertices) for g in scene.geometry.values()
                  if isinstance(g, trimesh.Trimesh))

    print(f"[CC4] Loaded model: {len(mesh_names)} meshes, {total_v}v")
    print(f"[CC4] Meshes: {mesh_names}")
    return scene


# ──────────────────────────────────────────────────────────────────────────────
# Landmark Conversion (MediaPipe → CC4 space)
# ──────────────────────────────────────────────────────────────────────────────

def landmarks_to_cc4(face_landmarks):
    """
    Convert MediaPipe normalized landmarks to CC4 coordinate space.

    MediaPipe landmarks are normalized 0-1 within the image, but the face
    only occupies ~60-70% of that range. We compute the actual face bounding
    box from landmarks and map it to the known CC4 face dimensions.

    CC4 face region:
      X: [-6.8, 6.8]  (left/right)
      Y: [-10, -2]     (front/back, negative = forward)
      Z: [155, 179]    (chin to top of head)
    """
    # First pass: get raw MediaPipe coordinates
    raw = []
    for lm in face_landmarks.landmark:
        raw.append([lm.x, lm.y, lm.z])
    raw = np.array(raw, dtype=np.float32)

    # Face oval landmarks define the face boundary
    face_pts = raw[FACE_OVAL]

    # Compute MediaPipe face bounding box
    mp_x_min, mp_x_max = face_pts[:, 0].min(), face_pts[:, 0].max()
    mp_y_min, mp_y_max = face_pts[:, 1].min(), face_pts[:, 1].max()
    mp_x_center = (mp_x_min + mp_x_max) / 2
    mp_y_center = (mp_y_min + mp_y_max) / 2
    mp_x_range = mp_x_max - mp_x_min
    mp_y_range = mp_y_max - mp_y_min

    # CC4 target dimensions
    cc4_x_range = CC4_FACE_X_RANGE[1] - CC4_FACE_X_RANGE[0]  # 13.6
    cc4_z_range = CC4_HEAD_TOP_Z - CC4_CHIN_Z                  # 24.0
    cc4_x_center = 0.0
    cc4_z_center = (CC4_HEAD_TOP_Z + CC4_CHIN_Z) / 2           # 167.0
    face_y_center = (CC4_FACE_Y_RANGE[0] + CC4_FACE_Y_RANGE[1]) / 2
    depth_scale = (CC4_FACE_Y_RANGE[1] - CC4_FACE_Y_RANGE[0])

    # Scale factors: map MediaPipe face box to CC4 face box
    scale_x = cc4_x_range / max(mp_x_range, 1e-6)
    scale_z = cc4_z_range / max(mp_y_range, 1e-6)

    points = []
    for lm in face_landmarks.landmark:
        # X: centered on face, scaled to CC4 width
        cc4_x = (lm.x - mp_x_center) * scale_x + cc4_x_center

        # Z: centered on face, inverted Y, scaled to CC4 height
        cc4_z = -(lm.y - mp_y_center) * scale_z + cc4_z_center

        # Y: depth from z coordinate
        cc4_y = lm.z * depth_scale * 3.0 + face_y_center

        points.append([cc4_x, cc4_y, cc4_z])

    return np.array(points, dtype=np.float32)


# ──────────────────────────────────────────────────────────────────────────────
# Head Deformation
# ──────────────────────────────────────────────────────────────────────────────

def deform_head(scene, face_landmarks, deform_strength=0.35):
    """
    Deform the CC4 head mesh to match the selfie's face shape.

    Reshapes jaw, cheeks, nose, forehead to match the user's actual proportions.
    Uses smooth falloff so deformation blends naturally into the neck/body.
    """
    from scipy.spatial import cKDTree

    lm_points = landmarks_to_cc4(face_landmarks)

    # Build deformation targets from key landmarks
    key_idx = [i for i in DEFORM_TARGETS if i < len(lm_points)]
    key_pos = lm_points[key_idx]
    lm_tree = cKDTree(key_pos)

    # Get landmark face dimensions for scaling
    face_lm = lm_points[:468]
    lm_center = face_lm.mean(axis=0)
    lm_size = face_lm.max(axis=0) - face_lm.min(axis=0)
    max_disp = lm_size.mean() * 0.25  # moderate displacement cap

    # Eye landmark centers (for damping)
    left_eye_center = lm_points[LEFT_EYE].mean(axis=0)
    right_eye_center = lm_points[RIGHT_EYE].mean(axis=0)
    eye_radius = np.linalg.norm(lm_points[LEFT_EYE].max(axis=0) - lm_points[LEFT_EYE].min(axis=0)) * 0.8

    # Mouth center (for damping — prevent lips from pulling open)
    mouth_indices = [13, 14, 78, 308, 82, 312, 87, 317]  # upper/lower lip landmarks
    mouth_lm = lm_points[[i for i in mouth_indices if i < len(lm_points)]]
    mouth_center = mouth_lm.mean(axis=0) if len(mouth_lm) > 0 else lm_points[13]
    mouth_radius = 3.0  # ~3cm radius of mouth protection zone

    deformed_count = 0

    # Deform each body mesh that has head vertices
    for mesh_name, geom in scene.geometry.items():
        if not isinstance(geom, trimesh.Trimesh):
            continue
        if "Body" not in mesh_name:
            continue  # skip eyes, teeth, tongue — don't deform those

        verts = np.array(geom.vertices, dtype=np.float32)
        deformed = verts.copy()
        mesh_deformed = 0

        for vi in range(len(verts)):
            v = verts[vi]

            # Only deform head region
            if v[2] < HEAD_Z_MIN:
                continue

            # Smooth height falloff: full strength at eye level, fades toward chin/top
            height_blend = 1.0
            if v[2] < HEAD_Z_MIN + 5:
                # Fade in from neck (Z=155 to Z=160)
                height_blend = (v[2] - HEAD_Z_MIN) / 5.0

            # Front-face weight: stronger on face, weaker on sides/back
            front_w = np.clip((-v[1] - 1.0) / 5.0, 0, 1)

            # Combined weight
            w = height_blend * front_w
            if w < 0.02:
                continue

            # Eye damping — protect eye socket geometry
            dist_to_left_eye = np.linalg.norm(v - left_eye_center)
            dist_to_right_eye = np.linalg.norm(v - right_eye_center)
            min_eye_dist = min(dist_to_left_eye, dist_to_right_eye)
            eye_damp = np.clip(min_eye_dist / eye_radius, 0, 1)
            eye_damp = eye_damp ** 1.5  # smooth falloff near eyes

            # Mouth damping — prevent lip/jaw vertices from pulling apart
            dist_to_mouth = np.linalg.norm(v - mouth_center)
            mouth_damp = np.clip(dist_to_mouth / mouth_radius, 0.2, 1)

            damp = w * eye_damp * mouth_damp
            if damp < 0.02:
                continue

            # Find nearest landmarks and compute displacement
            dists, indices = lm_tree.query(v, k=min(5, len(key_pos)))
            if np.isscalar(dists):
                dists = np.array([dists])
                indices = np.array([indices])

            # Distance gate: if nearest landmark is too far, skip this vertex
            # This prevents back-of-head / ear vertices from being pulled toward face
            if dists[0] > 8.0:  # ~8cm = too far from any landmark
                continue

            safe_dists = np.maximum(dists, 1e-8)
            weights = 1.0 / (safe_dists ** 2)
            weights /= weights.sum()

            targets = key_pos[indices]
            displacement = (weights[:, None] * (targets - v)).sum(axis=0)

            # Only move ALONG the face surface, not deep into the skull
            # Suppress Y (depth) displacement — mainly reshape X (width) and Z (height)
            displacement[1] *= 0.3  # heavily reduce depth displacement

            # Cap displacement
            disp_mag = np.linalg.norm(displacement)
            if disp_mag > max_disp:
                displacement = displacement * (max_disp / disp_mag)

            deformed[vi] = v + displacement * deform_strength * damp
            mesh_deformed += 1

        geom.vertices = deformed
        deformed_count += mesh_deformed

        if mesh_deformed > 0:
            # Very light smoothing on deformed head region only
            try:
                trimesh.smoothing.filter_laplacian(geom, iterations=3, lamb=0.2)
            except Exception:
                pass
            geom.fix_normals()
            print(f"[CC4] Deformed {mesh_name}: {mesh_deformed} vertices adjusted")

    print(f"[CC4] Total deformed vertices: {deformed_count}")
    return scene


# ──────────────────────────────────────────────────────────────────────────────
# Eye Color Tinting (selfie iris → CC4 eye meshes)
# ──────────────────────────────────────────────────────────────────────────────

# MediaPipe iris landmark indices
MP_LEFT_IRIS = [468, 469, 470, 471, 472]
MP_RIGHT_IRIS = [473, 474, 475, 476, 477]

def tint_eyes(scene, image_path, face_landmarks):
    """
    Sample the user's iris color from the selfie and tint the CC4 eye meshes.
    Replaces the default blue eyes with the user's actual eye color.
    """
    img = cv2.imread(image_path)
    if img is None:
        return scene

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img_rgb.shape[:2]
    lm = face_landmarks.landmark

    # Sample iris color from selfie
    iris_colors = []
    for idx_list in [MP_LEFT_IRIS, MP_RIGHT_IRIS]:
        for idx in idx_list:
            if idx < len(lm):
                px = int(np.clip(lm[idx].x * w, 0, w - 1))
                py = int(np.clip(lm[idx].y * h, 0, h - 1))
                # Sample a 3x3 region around the landmark
                y0 = max(0, py - 1)
                y1 = min(h, py + 2)
                x0 = max(0, px - 1)
                x1 = min(w, px + 2)
                patch = img_rgb[y0:y1, x0:x1]
                iris_colors.append(patch.reshape(-1, 3).mean(axis=0))

    if not iris_colors:
        print("[CC4] No iris landmarks found, skipping eye tint")
        return scene

    iris_color = np.median(iris_colors, axis=0).astype(np.uint8)
    print(f"[CC4] Detected iris color: RGB({iris_color[0]}, {iris_color[1]}, {iris_color[2]})")

    # Apply to all eye meshes
    for name, geom in scene.geometry.items():
        if not isinstance(geom, trimesh.Trimesh):
            continue
        if "Eye" not in name:
            continue

        mat = geom.visual.material
        tex_attr = getattr(mat, 'baseColorTexture', getattr(mat, 'image', None))

        if tex_attr is not None and hasattr(tex_attr, 'size'):
            # Tint existing eye texture
            tex = np.array(tex_attr)
            tex_h, tex_w = tex.shape[:2]

            # Find the iris region (colored, non-white, non-black pixels)
            if tex.shape[2] >= 3:
                brightness = tex[:, :, :3].mean(axis=2)
                # Iris is typically the colored ring: not too bright (sclera), not too dark (pupil)
                iris_mask = (brightness > 30) & (brightness < 200)

                # Check if there's enough variation to identify iris vs sclera
                # For CC4 eyes, tint the entire iris region
                for c in range(3):
                    # Blend: 70% user iris color, 30% original
                    tex[:, :, c] = np.where(
                        iris_mask,
                        np.clip(tex[:, :, c].astype(np.float32) * 0.3 +
                                float(iris_color[c]) * 0.7, 0, 255).astype(np.uint8),
                        tex[:, :, c]
                    )

                tex_pil = Image.fromarray(tex)
                try:
                    material = trimesh.visual.texture.SimpleMaterial(image=tex_pil)
                    geom.visual = trimesh.visual.TextureVisuals(
                        uv=geom.visual.uv, material=material, image=tex_pil)
                except Exception:
                    pass

                print(f"[CC4] Tinted {name} with user iris color")
        else:
            # No texture — just apply vertex colors
            try:
                vc = np.full((len(geom.vertices), 4), 255, dtype=np.uint8)
                vc[:, :3] = iris_color
                geom.visual.vertex_colors = vc
                print(f"[CC4] Applied iris vertex color to {name}")
            except Exception:
                pass

    return scene


# ──────────────────────────────────────────────────────────────────────────────
# Texture Projection (selfie → UV map)
# ──────────────────────────────────────────────────────────────────────────────

def _apply_style_filter(img, style="realistic"):
    """Apply color style to selfie before texture projection."""
    if style == "cartoon":
        img = cv2.bilateralFilter(img, 9, 75, 75)
        img = cv2.bilateralFilter(img, 9, 75, 75)
        img = np.clip(img.astype(np.float32) * 1.2 + 10, 0, 255).astype(np.uint8)
    elif style == "stylized":
        img = cv2.bilateralFilter(img, 7, 50, 50)
        hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
        hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.3, 0, 255).astype(np.uint8)
        img = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    return img


def project_face_texture(scene, image_path, face_landmarks, style="realistic", tex_size=1024):
    """
    Project the selfie photo onto the CC4 face mesh UV map.

    Builds a UV→selfie coordinate map by rasterizing head triangles in UV space,
    then uses cv2.remap for a single fast sampling pass. No per-pixel Python loops.
    """
    img = cv2.imread(image_path)
    if img is None:
        print(f"[CC4] WARNING: Could not read image {image_path}")
        return scene

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    styled_img = _apply_style_filter(img_rgb, style)
    img_h, img_w = styled_img.shape[:2]

    # ── Selfie face region from MediaPipe landmarks (piecewise alignment) ──
    # Key feature positions in selfie (normalized 0-1 image coords)
    lm = face_landmarks.landmark
    mp_features_y = {
        "forehead": lm[MP_FOREHEAD].y,
        "eyes":     (lm[MP_LEFT_EYE].y + lm[MP_RIGHT_EYE].y) / 2,
        "nose":     lm[MP_NOSE_TIP].y,
        "mouth":    lm[MP_MOUTH_CENTER].y,
        "chin":     lm[MP_CHIN].y,
    }
    mp_left_eye_x = lm[MP_LEFT_EYE].x
    mp_right_eye_x = lm[MP_RIGHT_EYE].x
    mp_center_x = (mp_left_eye_x + mp_right_eye_x) / 2
    mp_eye_span = abs(mp_right_eye_x - mp_left_eye_x)

    # CC4 eye span for X calibration
    cc4_eye_span = CC4_RIGHT_EYE_X - CC4_LEFT_EYE_X  # ~6.26

    # Piecewise Z bands: CC4 Z height → selfie Y (image coords, 0=top)
    # Each band maps a CC4 height range to a selfie vertical range
    z_bands = [
        (CC4_FEATURES["forehead"], mp_features_y["forehead"]),
        (CC4_FEATURES["eyes"],     mp_features_y["eyes"]),
        (CC4_FEATURES["nose"],     mp_features_y["nose"]),
        (CC4_FEATURES["mouth"],    mp_features_y["mouth"]),
        (CC4_FEATURES["chin"],     mp_features_y["chin"]),
    ]
    # Sort by CC4 Z descending (top to bottom)
    z_bands.sort(key=lambda b: -b[0])

    def cc4_to_selfie(pos_3d):
        """Map a CC4 3D position to selfie pixel coordinates using landmark alignment."""
        x, y, z = float(pos_3d[0]), float(pos_3d[1]), float(pos_3d[2])

        # ── Vertical (Z → image Y): piecewise interpolation between feature bands ──
        img_y_norm = mp_features_y["chin"]  # default to chin
        for i in range(len(z_bands) - 1):
            z_top, y_top = z_bands[i]
            z_bot, y_bot = z_bands[i + 1]
            if z >= z_bot and z <= z_top:
                t = (z - z_bot) / max(z_top - z_bot, 0.01)
                img_y_norm = y_bot + t * (y_top - y_bot)
                break
        else:
            # Above forehead or below chin — extrapolate
            if z > z_bands[0][0]:
                # Above forehead
                extra = (z - z_bands[0][0]) / max(z_bands[0][0] - z_bands[1][0], 1)
                img_y_norm = z_bands[0][1] - extra * (z_bands[1][1] - z_bands[0][1])
            elif z < z_bands[-1][0]:
                # Below chin
                extra = (z_bands[-1][0] - z) / max(z_bands[-2][0] - z_bands[-1][0], 1)
                img_y_norm = z_bands[-1][1] + extra * (z_bands[-1][1] - z_bands[-2][1])

        # ── Horizontal (X → image X): calibrate from eye positions ──
        # How many "eye spans" away from center is this vertex?
        x_offset = x / max(cc4_eye_span / 2, 0.01)  # normalized: -1 at left eye, +1 at right eye
        img_x_norm = mp_center_x + x_offset * (mp_eye_span / 2)

        # Clamp
        img_x_norm = float(np.clip(img_x_norm, 0, 1))
        img_y_norm = float(np.clip(img_y_norm, 0, 1))

        return (img_x_norm * img_w, img_y_norm * img_h)

    # ── Find body meshes with head geometry ──
    face_meshes = []
    for name, geom in scene.geometry.items():
        if isinstance(geom, trimesh.Trimesh) and "Body" in name:
            if (geom.vertices[:, 2] > HEAD_Z_MIN).sum() > 50:
                face_meshes.append(name)

    if not face_meshes:
        print("[CC4] WARNING: No face meshes found")
        return scene

    print(f"[CC4] Projecting onto: {face_meshes}")

    face_w = CC4_FACE_X_RANGE[1] - CC4_FACE_X_RANGE[0]
    head_h = CC4_HEAD_TOP_Z - CC4_CHIN_Z

    for mesh_name in face_meshes:
        geom = scene.geometry[mesh_name]
        verts = geom.vertices
        faces_arr = geom.faces

        has_uv = (hasattr(geom.visual, 'uv') and geom.visual.uv is not None
                  and len(geom.visual.uv) > 0)
        if not has_uv:
            continue

        uv = np.array(geom.visual.uv)

        # ── Load existing texture as base ──
        mat = geom.visual.material
        base_img_attr = getattr(mat, 'baseColorTexture', getattr(mat, 'image', None))
        if base_img_attr is not None and hasattr(base_img_attr, 'size'):
            texture = np.array(base_img_attr.resize((tex_size, tex_size), Image.LANCZOS))
            if texture.ndim == 2:
                texture = np.stack([texture] * 3, axis=-1)
            elif texture.shape[2] == 4:
                texture = texture[:, :, :3]
        else:
            texture = np.full((tex_size, tex_size, 3), [180, 150, 130], dtype=np.uint8)

        # ── Build remap coordinates ──
        # map_x[ty, tx] = selfie pixel X for this texel
        # map_y[ty, tx] = selfie pixel Y for this texel
        map_x = np.full((tex_size, tex_size), -1.0, dtype=np.float32)
        map_y = np.full((tex_size, tex_size), -1.0, dtype=np.float32)
        blend_weight = np.zeros((tex_size, tex_size), dtype=np.float32)

        tri_count = 0

        for face_idx in faces_arr:
            v0, v1, v2 = verts[face_idx[0]], verts[face_idx[1]], verts[face_idx[2]]

            # Head region + front-facing filter
            avg_z = (v0[2] + v1[2] + v2[2]) / 3.0
            if avg_z < HEAD_Z_MIN:
                continue

            avg_y = (v0[1] + v1[1] + v2[1]) / 3.0
            front_w = float(np.clip((-avg_y - 1.0) / 6.0, 0, 1))
            if front_w < 0.05:
                continue

            height_t = float(np.clip((avg_z - CC4_CHIN_Z) / head_h, 0, 1))
            blend = front_w * (1.0 - abs(height_t - 0.5) * 0.3)

            # ── UV triangle in texel space ──
            uv_pts = []
            for idx in face_idx:
                u_val, v_val = float(uv[idx][0]), float(uv[idx][1])
                uv_pts.append([
                    np.clip(u_val * tex_size, 0, tex_size - 1),
                    np.clip((1.0 - v_val) * tex_size, 0, tex_size - 1),
                ])
            uv_pts = np.array(uv_pts, dtype=np.float32)

            # ── Selfie coordinates for each vertex (landmark-aligned) ──
            src_pts = []
            for v in [v0, v1, v2]:
                sx, sy = cc4_to_selfie(v)
                src_pts.append([
                    float(np.clip(sx, 0, img_w - 1)),
                    float(np.clip(sy, 0, img_h - 1)),
                ])
            src_pts = np.array(src_pts, dtype=np.float32)

            # Skip degenerate
            area = abs((uv_pts[1][0] - uv_pts[0][0]) * (uv_pts[2][1] - uv_pts[0][1]) -
                       (uv_pts[2][0] - uv_pts[0][0]) * (uv_pts[1][1] - uv_pts[0][1]))
            if area < 0.5:
                continue

            # ── Affine: UV texel → selfie pixel ──
            try:
                M = cv2.getAffineTransform(uv_pts, src_pts)
            except Exception:
                continue

            # ── Rasterize triangle mask ──
            tri_int = uv_pts.astype(np.int32).reshape((-1, 1, 2))
            min_x = max(0, int(uv_pts[:, 0].min()) - 1)
            max_x = min(tex_size - 1, int(uv_pts[:, 0].max()) + 1)
            min_y = max(0, int(uv_pts[:, 1].min()) - 1)
            max_y = min(tex_size - 1, int(uv_pts[:, 1].max()) + 1)

            if max_x <= min_x or max_y <= min_y:
                continue

            # Small mask for just this triangle's bounding box
            bw = max_x - min_x + 1
            bh = max_y - min_y + 1
            local_mask = np.zeros((bh, bw), dtype=np.uint8)
            local_tri = tri_int.copy()
            local_tri[:, :, 0] -= min_x
            local_tri[:, :, 1] -= min_y
            cv2.fillConvexPoly(local_mask, local_tri, 255)

            # For each pixel in the mask, compute selfie coordinates via affine
            ys, xs = np.where(local_mask > 0)
            if len(xs) == 0:
                continue

            # Global texel coordinates
            gx = xs + min_x
            gy = ys + min_y

            # Apply affine transform: [sx, sy] = M @ [tx, ty, 1]
            texel_coords = np.vstack([gx, gy, np.ones(len(gx))]).astype(np.float64)
            selfie_coords = M @ texel_coords  # 2 x N

            # Store in maps (vectorized — only overwrite where blend is higher)
            current_blends = blend_weight[gy, gx]
            better = blend > current_blends
            better_gx = gx[better]
            better_gy = gy[better]
            if len(better_gx) > 0:
                map_x[better_gy, better_gx] = selfie_coords[0, better].astype(np.float32)
                map_y[better_gy, better_gx] = selfie_coords[1, better].astype(np.float32)
                blend_weight[better_gy, better_gx] = blend

            tri_count += 1

        # ── Single remap pass: sample selfie for all face texels at once ──
        # Clamp coordinates
        valid = blend_weight > 0
        map_x_clamped = np.clip(map_x, 0, img_w - 1)
        map_y_clamped = np.clip(map_y, 0, img_h - 1)

        # cv2.remap samples the entire selfie at the mapped coordinates
        face_texture = cv2.remap(
            styled_img, map_x_clamped, map_y_clamped,
            interpolation=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REPLICATE,
        )

        # ── Composite: blend face texture onto base ──
        blend_3d = blend_weight[:, :, np.newaxis]
        result = texture.astype(np.float32) * (1.0 - blend_3d) + face_texture.astype(np.float32) * blend_3d
        texture = result.astype(np.uint8)

        # Light blur on face region only to smooth seams
        texture = cv2.GaussianBlur(texture, (3, 3), 0.8)

        # ── Apply texture back to mesh ──
        tex_pil = Image.fromarray(texture)
        try:
            material = trimesh.visual.texture.SimpleMaterial(image=tex_pil)
            geom.visual = trimesh.visual.TextureVisuals(uv=uv, material=material, image=tex_pil)
        except Exception as e:
            print(f"[CC4] Texture assignment warning: {e}")
            try:
                geom.visual.material.image = tex_pil
                geom.visual.material.baseColorTexture = tex_pil
            except Exception:
                pass

        print(f"[CC4] {mesh_name}: baked {tri_count} triangles → {tex_size}x{tex_size}")

    return scene


# ──────────────────────────────────────────────────────────────────────────────
# Export
# ──────────────────────────────────────────────────────────────────────────────

def export_avatar(scene, output_path):
    """Export the CC4 scene as GLB, preserving all meshes and materials."""
    scene.export(output_path, file_type='glb')
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"[CC4] Exported: {output_path} ({size_mb:.1f}MB)")
    return output_path


# ──────────────────────────────────────────────────────────────────────────────
# Main Pipeline (drop-in replacement for generate_avatar_from_template)
# ──────────────────────────────────────────────────────────────────────────────

def generate_avatar_from_template(
    image_path, face_landmarks, image_shape,
    template="neutral", quality="balanced",
    texture_style="realistic", use_texture=True, add_eyes=True,
):
    """
    Generate avatar from selfie using CC4 base model.

    Drop-in replacement for the old sphere-based pipeline.
    Same function signature for route compatibility.

    Returns a trimesh Scene (not a single mesh).
    """
    quality_map = {
        "fast":     {"deform_strength": 0.20},
        "balanced": {"deform_strength": 0.35},
        "high":     {"deform_strength": 0.50},
    }
    settings = quality_map.get(quality, quality_map["balanced"])

    print(f"[CC4] === Avatar Generation Start ===")
    print(f"[CC4] Quality: {quality}, Texture: {texture_style}")

    # Step 1: Load CC4 model
    scene = load_cc4_model()

    # Step 2: Deform head to match selfie
    scene = deform_head(
        scene, face_landmarks,
        deform_strength=settings["deform_strength"]
    )

    # Step 3: Project selfie texture
    if use_texture:
        tex_size = 512 if quality == "fast" else 1024
        scene = project_face_texture(
            scene, image_path, face_landmarks,
            style=texture_style, tex_size=tex_size
        )

    # Step 4: Tint eyes to match selfie iris color
    scene = tint_eyes(scene, image_path, face_landmarks)

    # Eyes, teeth, tongue are already in the model — no need to add them
    print(f"[CC4] === Avatar Generation Complete ===")
    return scene


# ──────────────────────────────────────────────────────────────────────────────
# Convenience: export scene to GLB file (for route integration)
# ──────────────────────────────────────────────────────────────────────────────

def scene_to_glb_bytes(scene):
    """Convert scene to GLB bytes for direct response."""
    import io
    buffer = io.BytesIO()
    scene.export(buffer, file_type='glb')
    return buffer.getvalue()