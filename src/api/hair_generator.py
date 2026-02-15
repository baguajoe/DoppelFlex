# src/api/hair_generator.py
# Hair system for avatar heads (COMPLETE + FIXED)
# 1. Detect hair color from selfie (sample pixels above forehead)
# 2. Generate hair cap mesh that sits ON the head surface
# 3. Multiple style presets
# 4. Apply as separate mesh or merge with head

import numpy as np
import cv2
import trimesh


# ─── Hair Color Detection ───

def detect_hair_color(image_path, face_landmarks, image_shape):
    """
    Extract hair color by sampling pixels above the forehead.
    Uses MediaPipe landmarks to locate the forehead, then samples above it.
    """
    img = cv2.imread(image_path)
    if img is None:
        return _default_hair_color()

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = image_shape[:2]

    forehead_indices = [10, 338, 297, 332, 284, 251, 21, 54, 103, 67, 109]
    forehead_pts = []
    for idx in forehead_indices:
        if idx < len(face_landmarks.landmark):
            lm = face_landmarks.landmark[idx]
            forehead_pts.append([int(lm.x * w), int(lm.y * h)])

    if len(forehead_pts) < 3:
        return _default_hair_color()

    forehead_pts = np.array(forehead_pts)
    forehead_top_y = forehead_pts[:, 1].min()
    forehead_center_x = forehead_pts[:, 0].mean()
    forehead_width = forehead_pts[:, 0].max() - forehead_pts[:, 0].min()

    sample_y_start = max(0, forehead_top_y - int(h * 0.12))
    sample_y_end = max(0, forehead_top_y - int(h * 0.02))
    sample_x_start = max(0, int(forehead_center_x - forehead_width * 0.4))
    sample_x_end = min(w, int(forehead_center_x + forehead_width * 0.4))

    if sample_y_start >= sample_y_end or sample_x_start >= sample_x_end:
        return _default_hair_color()

    hair_region = img_rgb[sample_y_start:sample_y_end, sample_x_start:sample_x_end]
    if hair_region.size == 0:
        return _default_hair_color()

    pixels = hair_region.reshape(-1, 3).astype(float)

    brightness = pixels.mean(axis=1)
    pixels = pixels[brightness < 220]

    if len(pixels) < 10:
        return _default_hair_color()

    median_color = np.median(pixels, axis=0).astype(int)

    try:
        from sklearn.cluster import KMeans
        kmeans = KMeans(n_clusters=min(3, len(pixels)), n_init=5, random_state=42)
        kmeans.fit(pixels)
        labels, counts = np.unique(kmeans.labels_, return_counts=True)
        dominant_idx = labels[np.argmax(counts)]
        dominant_color = kmeans.cluster_centers_[dominant_idx].astype(int)
        final_color = (median_color * 0.3 + dominant_color * 0.7).astype(int)
    except ImportError:
        final_color = median_color

    final_color = np.clip(final_color, 0, 255)
    hex_color = "#{:02x}{:02x}{:02x}".format(*final_color)

    return {
        "hex": hex_color,
        "rgb": final_color.tolist(),
        "rgb_float": (final_color / 255.0).tolist(),
    }


def _default_hair_color():
    return {
        "hex": "#2a1a0a",
        "rgb": [42, 26, 10],
        "rgb_float": [0.165, 0.102, 0.039],
    }


# ─── Hair Style Presets ───

HAIR_STYLES = {
    "bald":   {"description": "No hair",             "offset": 0.000, "coverage": 0.00, "volume": 0.00},
    "buzz":   {"description": "Very short buzz cut", "offset": 0.002, "coverage": 0.70, "volume": 1.00},
    "short":  {"description": "Short hair",          "offset": 0.005, "coverage": 0.65, "volume": 1.00},
    "medium": {"description": "Medium length hair",  "offset": 0.008, "coverage": 0.50, "volume": 1.05},
    "long":   {"description": "Long hair",           "offset": 0.006, "coverage": 0.30, "volume": 1.03, "drape_length": 0.08},
    "afro":   {"description": "Full afro style",     "offset": 0.018, "coverage": 0.40, "volume": 1.15},
}


# ─── Hair Mesh Generation ───

def generate_hair_mesh(head_mesh, style="short", hair_color_rgb_float=None):
    """
    Generate a hair cap mesh that sits directly on the head surface.

    Fixes added:
    - Auto-detect face forward direction (+Z or -Z) so "don't cover face" always works.
    - process=False when building trimesh (reduces weird processing side effects)
    """
    if style == "bald" or style not in HAIR_STYLES:
        return None

    params = HAIR_STYLES[style]
    offset = params["offset"]
    coverage = params["coverage"]
    volume = params.get("volume", 1.0)

    verts = np.array(head_mesh.vertices)
    faces = np.array(head_mesh.faces)

    # Compute vertex normals
    try:
        normals = np.array(head_mesh.vertex_normals)
    except Exception:
        center = verts.mean(axis=0)
        normals = verts - center
        norms = np.linalg.norm(normals, axis=1, keepdims=True)
        norms[norms < 1e-6] = 1
        normals = normals / norms

    max_y = verts[:, 1].max()
    min_y = verts[:, 1].min()
    head_height = max_y - min_y
    if head_height < 1e-6:
        return None

    hair_cutoff_y = max_y - head_height * coverage
    hair_mask = verts[:, 1] > hair_cutoff_y

    center_z = verts[:, 2].mean()
    eye_level_y = max_y - head_height * 0.35

    # Auto-detect whether face points +Z or -Z
    z_plus = (verts[:, 2] - center_z).max()
    z_minus = (center_z - verts[:, 2]).max()
    face_is_plus_z = z_plus >= z_minus

    for i in range(len(verts)):
        if not hair_mask[i]:
            continue

        is_front = (verts[i, 2] > center_z) if face_is_plus_z else (verts[i, 2] < center_z)

        # below eye level + front => exclude (prevents hair covering face)
        if verts[i, 1] < eye_level_y and is_front:
            hair_mask[i] = False

    hair_indices = np.where(hair_mask)[0]
    if len(hair_indices) < 10:
        print(f"[HairGen] Not enough vertices for hair ({len(hair_indices)})")
        return None

    hair_verts = []
    hair_vert_map = {}

    denom = max(max_y - hair_cutoff_y, 0.001)

    for new_idx, old_idx in enumerate(hair_indices):
        v = verts[old_idx].copy()
        n = normals[old_idx].copy()

        n_len = np.linalg.norm(n)
        if n_len < 1e-6:
            continue
        n = n / n_len

        rel_y = (v[1] - hair_cutoff_y) / denom
        local_offset = offset * (0.5 + 0.5 * rel_y)
        local_offset *= volume

        hair_v = v + n * local_offset
        hair_verts.append(hair_v)
        hair_vert_map[old_idx] = new_idx

    if len(hair_verts) < 10:
        return None

    hair_verts = np.array(hair_verts)

    hair_faces = []
    for f in faces:
        if f[0] in hair_vert_map and f[1] in hair_vert_map and f[2] in hair_vert_map:
            hair_faces.append([hair_vert_map[f[0]], hair_vert_map[f[1]], hair_vert_map[f[2]]])

    if len(hair_faces) < 5:
        try:
            from scipy.spatial import Delaunay
            tri = Delaunay(hair_verts[:, :2])
            hair_faces = tri.simplices.tolist()
            good = []
            for f in hair_faces:
                pts = hair_verts[f]
                edges = [np.linalg.norm(pts[i] - pts[(i + 1) % 3]) for i in range(3)]
                if max(edges) < 0.06:
                    good.append(f)
            hair_faces = good if good else hair_faces
        except Exception as e:
            print(f"[HairGen] Fallback triangulation failed: {e}")
            return None

    hair_faces = np.array(hair_faces)

    # Long hair drape
    drape_length = params.get("drape_length", 0)
    if drape_length > 0:
        hair_verts, hair_faces = add_hair_drape(
            hair_verts, hair_faces, drape_length,
            verts, hair_cutoff_y, center_z
        )

    # Build mesh (process=False for stability)
    hair_mesh = trimesh.Trimesh(vertices=hair_verts, faces=hair_faces, process=False)

    # Apply color
    if hair_color_rgb_float:
        r, g, b = [int(float(c) * 255) for c in hair_color_rgb_float]
    else:
        r, g, b = 42, 26, 10

    num_verts = len(hair_mesh.vertices)
    colors = np.full((num_verts, 4), [r, g, b, 255], dtype=np.uint8)

    # Slight variation
    noise = np.random.normal(0, 5, (num_verts, 3)).astype(int)
    colors[:, :3] = np.clip(colors[:, :3].astype(int) + noise, 0, 255).astype(np.uint8)

    hair_mesh.visual.vertex_colors = colors

    try:
        trimesh.smoothing.filter_laplacian(hair_mesh, iterations=1, lamb=0.3)
    except Exception:
        pass

    hair_mesh.fix_normals()

    print(f"[HairGen] Generated '{style}' hair: {len(hair_mesh.vertices)} verts, {len(hair_mesh.faces)} faces")
    return hair_mesh


def add_hair_drape(hair_verts, hair_faces, drape_length, head_verts, cutoff_y, center_z):
    """
    For long hair styles, extend hair downward from the back/sides of the head.
    Creates hanging strands below the hair cap.
    """
    back_mask = hair_verts[:, 2] < center_z
    back_indices = np.where(back_mask)[0]

    if len(back_indices) < 3:
        return hair_verts, hair_faces

    drape_verts = []
    drape_faces = []
    base_idx = len(hair_verts)
    drape_rings = 4

    back_hair = hair_verts[back_indices]
    min_back_y = back_hair[:, 1].min()
    edge_mask = back_hair[:, 1] < (min_back_y + 0.01)
    edge_indices = back_indices[np.where(edge_mask)[0]]

    if len(edge_indices) < 3:
        return hair_verts, hair_faces

    edge_sorted = edge_indices[np.argsort(hair_verts[edge_indices, 0])]

    for ring in range(drape_rings):
        t = (ring + 1) / drape_rings
        for ei in edge_sorted:
            v = hair_verts[ei].copy()
            v[1] -= drape_length * t
            v[2] -= 0.002 * t
            drape_verts.append(v)

    if not drape_verts:
        return hair_verts, hair_faces

    drape_verts = np.array(drape_verts)
    n_edge = len(edge_sorted)

    for i in range(n_edge - 1):
        top_a = edge_sorted[i]
        top_b = edge_sorted[i + 1]
        bot_a = base_idx + i
        bot_b = base_idx + i + 1
        drape_faces.append([top_a, top_b, bot_a])
        drape_faces.append([top_b, bot_b, bot_a])

    for ring in range(drape_rings - 1):
        for i in range(n_edge - 1):
            v0 = base_idx + ring * n_edge + i
            v1 = v0 + 1
            v2 = v0 + n_edge
            v3 = v2 + 1
            drape_faces.append([v0, v1, v2])
            drape_faces.append([v1, v3, v2])

    all_verts = np.vstack([hair_verts, drape_verts])
    all_faces = np.vstack([hair_faces, np.array(drape_faces)]) if drape_faces else hair_faces

    return all_verts, all_faces


def merge_head_and_hair(head_mesh, hair_mesh):
    """Combine head and hair into one mesh."""
    if hair_mesh is None:
        return head_mesh

    combined = trimesh.util.concatenate([head_mesh, hair_mesh])
    combined.fix_normals()
    return combined


def get_available_styles():
    """Return list of available hair styles for frontend."""
    styles = []
    for key, params in HAIR_STYLES.items():
        styles.append({
            "id": key,
            "name": key.replace("_", " ").title(),
            "description": params["description"],
        })
    return styles
