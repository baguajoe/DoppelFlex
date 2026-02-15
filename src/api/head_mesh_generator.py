# src/api/head_mesh_generator.py
# Full Head Avatar Generator
# 1. Generates a template head mesh (UV sphere with head proportions)
# 2. Deforms front vertices using MediaPipe face landmarks
# 3. Refines depth using MiDaS monocular depth estimation
# Result: Complete 360° head mesh with personalized face shape

import numpy as np
import cv2
import os
import trimesh

# ─── Step 1: Template Head Mesh ───
def generate_template_head(resolution=32):
    """
    Create a UV sphere shaped like a human head.
    Returns vertices, faces, and UV coordinates.
    Head proportions: slightly taller than wide, flattened at back.
    """
    lat_steps = resolution
    lon_steps = resolution * 2

    vertices = []
    uvs = []

    for i in range(lat_steps + 1):
        theta = np.pi * i / lat_steps  # 0 to pi (top to bottom)
        v = i / lat_steps

        for j in range(lon_steps + 1):
            phi = 2 * np.pi * j / lon_steps  # 0 to 2pi (around)
            u = j / lon_steps

            # Base sphere
            x = np.sin(theta) * np.cos(phi)
            y = np.cos(theta)
            z = np.sin(theta) * np.sin(phi)

            # Head shape modifiers
            # Slightly taller than wide (1.15x height)
            y *= 1.15

            # Narrow the chin area (bottom quarter)
            chin_factor = max(0, (theta - np.pi * 0.65) / (np.pi * 0.35))
            if chin_factor > 0:
                narrow = 1.0 - chin_factor * 0.35
                x *= narrow
                z *= narrow

            # Slight forehead bulge (top front)
            forehead_factor = max(0, 1.0 - theta / (np.pi * 0.3))
            if forehead_factor > 0 and z > 0:
                z += forehead_factor * 0.08

            # Flatten back of head slightly
            if z < -0.1:
                z *= 0.85

            # Nose bridge area - slight protrusion
            nose_lat = abs(theta - np.pi * 0.45) < np.pi * 0.08
            nose_lon = abs(phi - np.pi * 0.5) < 0.3 or abs(phi - np.pi * 1.5) < 0.3
            if nose_lat and z > 0.3:
                z += 0.06

            # Brow ridge
            brow_lat = abs(theta - np.pi * 0.35) < np.pi * 0.04
            if brow_lat and z > 0.2:
                z += 0.04

            # Scale to realistic head size (in normalized coords ~0.2 units)
            scale = 0.12
            vertices.append([x * scale, y * scale + 0.85, z * scale])
            uvs.append([u, v])

    # Generate faces (triangles)
    faces = []
    for i in range(lat_steps):
        for j in range(lon_steps):
            v0 = i * (lon_steps + 1) + j
            v1 = v0 + 1
            v2 = (i + 1) * (lon_steps + 1) + j
            v3 = v2 + 1

            faces.append([v0, v2, v1])
            faces.append([v1, v2, v3])

    return np.array(vertices), np.array(faces), np.array(uvs)


# ─── Step 2: Landmark-based Deformation ───
def get_front_vertex_mask(vertices, threshold=0.0):
    """Identify vertices on the front of the head (z > threshold)."""
    return vertices[:, 2] > threshold


def map_landmarks_to_3d(landmarks_2d, image_shape):
    """
    Convert MediaPipe face landmarks from normalized [0,1] coords
    to 3D head-space coordinates.
    Returns Nx3 array of landmark positions.
    """
    h, w = image_shape[:2]
    points = []
    for lm in landmarks_2d:
        # MediaPipe gives x,y in [0,1], z is relative depth
        x = (lm.x - 0.5) * 0.24  # Center and scale to head width
        y = (0.5 - lm.y) * 0.28 + 0.85  # Flip Y, scale to head height, offset to head center
        z = lm.z * 0.12 + 0.12  # Scale depth, offset to front of head
        points.append([x, y, z])
    return np.array(points)


# Key landmark indices for face regions
FACE_REGIONS = {
    "jaw": list(range(0, 17)),  # Jawline contour (using face oval)
    "left_eye": [33, 160, 158, 133, 153, 144],
    "right_eye": [362, 385, 387, 263, 373, 380],
    "nose": [1, 2, 98, 327, 168],
    "mouth": [61, 291, 0, 17, 78, 308],
    "left_brow": [70, 63, 105, 66, 107],
    "right_brow": [300, 293, 334, 296, 336],
    "forehead": [10, 338, 297, 332, 284, 251, 389, 356, 454],
    "chin": [152, 148, 176, 149, 150, 136, 172, 58, 132],
    "left_cheek": [50, 101, 36, 205, 187, 123, 116, 117],
    "right_cheek": [280, 330, 266, 425, 411, 352, 345, 346],
    "face_oval": [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361,
                  288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
                  150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54,
                  103, 67, 109],
}


def deform_to_landmarks(vertices, face_landmarks_3d, strength=0.7):
    """
    Deform front-facing head vertices to match face landmark positions.
    Uses radial basis function interpolation for smooth deformation.
    """
    front_mask = get_front_vertex_mask(vertices, threshold=0.0)

    # Use face oval landmarks as primary deformation targets
    oval_indices = FACE_REGIONS["face_oval"]
    available = [i for i in oval_indices if i < len(face_landmarks_3d)]

    if len(available) < 5:
        print("[HeadGen] Warning: Too few landmarks for deformation")
        return vertices

    target_points = face_landmarks_3d[available]

    # For each front vertex, find nearest landmarks and blend toward them
    deformed = vertices.copy()

    for vi in range(len(vertices)):
        if not front_mask[vi]:
            continue

        vert = vertices[vi]

        # Distance to all target landmarks
        diffs = target_points - vert
        dists = np.sqrt(np.sum(diffs ** 2, axis=1))

        # Use closest 4 landmarks with inverse-distance weighting
        closest = np.argsort(dists)[:4]
        weights = 1.0 / (dists[closest] + 1e-6)
        weights /= weights.sum()

        # Compute weighted displacement
        displacement = np.zeros(3)
        for idx, w in zip(closest, weights):
            target = target_points[idx]
            displacement += w * (target - vert)

        # Apply with falloff based on distance from face center
        face_center = face_landmarks_3d[1]  # Nose tip as center
        dist_from_center = np.linalg.norm(vert[:2] - face_center[:2])
        falloff = np.exp(-dist_from_center * 8)

        deformed[vi] += displacement * strength * falloff

    return deformed


# ─── Step 3: MiDaS Depth Refinement ───
def refine_with_depth(vertices, image_path, face_landmarks_3d, depth_strength=0.03):
    """
    Use MiDaS monocular depth estimation to refine vertex depths.
    Adds subtle per-vertex depth variation based on the selfie.
    """
    try:
        import torch

        # Load MiDaS model (small version for speed)
        model_type = "MiDaS_small"
        midas = torch.hub.load("intel-isl/MiDaS", model_type, trust_repo=True)
        midas.eval()

        # Load transforms
        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms", trust_repo=True)
        transform = midas_transforms.small_transform

        # Read and transform image
        img = cv2.imread(image_path)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        input_batch = transform(img_rgb)

        # Run depth estimation
        with torch.no_grad():
            prediction = midas(input_batch)
            prediction = torch.nn.functional.interpolate(
                prediction.unsqueeze(1),
                size=img_rgb.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()

        depth_map = prediction.cpu().numpy()

        # Normalize depth map to [0, 1]
        depth_min = depth_map.min()
        depth_max = depth_map.max()
        if depth_max - depth_min > 0:
            depth_map = (depth_map - depth_min) / (depth_max - depth_min)
        else:
            return vertices

        h, w = img.shape[:2]

        # Apply depth to front vertices
        front_mask = get_front_vertex_mask(vertices, threshold=0.0)
        refined = vertices.copy()

        for vi in range(len(vertices)):
            if not front_mask[vi]:
                continue

            vert = vertices[vi]

            # Map vertex position to image pixel coordinates
            # Vertex x maps to image column, vertex y maps to image row
            px = int(np.clip((vert[0] / 0.12 + 0.5) * w, 0, w - 1))
            py = int(np.clip((0.5 - (vert[1] - 0.85) / 0.28) * h, 0, h - 1))

            depth_value = depth_map[py, px]

            # Depth pushes front vertices outward (higher depth = closer to camera)
            refined[vi, 2] += (depth_value - 0.5) * depth_strength

        return refined

    except Exception as e:
        print(f"[HeadGen] MiDaS depth refinement skipped: {e}")
        return vertices


# ─── Step 4: Add Neck ───
def add_neck(vertices, faces, resolution=32):
    """
    Add a cylindrical neck below the head mesh.
    Connects to the bottom ring of the head.
    """
    lon_steps = resolution * 2

    # Find bottom ring of head (lowest latitude vertices)
    min_y = vertices[:, 1].min()
    bottom_mask = vertices[:, 1] < (min_y + 0.01)
    bottom_indices = np.where(bottom_mask)[0]

    if len(bottom_indices) < 4:
        return vertices, faces

    # Get center and radius of bottom ring
    bottom_verts = vertices[bottom_indices]
    center_x = bottom_verts[:, 0].mean()
    center_z = bottom_verts[:, 2].mean()
    radius = np.sqrt(
        (bottom_verts[:, 0] - center_x) ** 2 +
        (bottom_verts[:, 2] - center_z) ** 2
    ).mean()

    # Generate neck cylinder
    neck_length = 0.06
    neck_rings = 4
    neck_radius_scale = 0.75  # Neck is narrower than head

    neck_verts = []
    neck_faces = []
    base_idx = len(vertices)

    for ring in range(neck_rings + 1):
        t = ring / neck_rings
        y = min_y - t * neck_length
        r = radius * (neck_radius_scale + (1 - neck_radius_scale) * (1 - t))

        for j in range(lon_steps + 1):
            phi = 2 * np.pi * j / lon_steps
            x = center_x + r * np.cos(phi)
            z = center_z + r * np.sin(phi)
            neck_verts.append([x, y, z])

    # Neck faces
    for ring in range(neck_rings):
        for j in range(lon_steps):
            v0 = base_idx + ring * (lon_steps + 1) + j
            v1 = v0 + 1
            v2 = v0 + (lon_steps + 1)
            v3 = v2 + 1
            neck_faces.append([v0, v2, v1])
            neck_faces.append([v1, v2, v3])

    # Combine
    all_verts = np.vstack([vertices, np.array(neck_verts)])
    all_faces = np.vstack([faces, np.array(neck_faces)])

    return all_verts, all_faces


# ─── Main Pipeline ───
def generate_full_head(image_path, face_landmarks, image_shape,
                       resolution=32, use_depth=True, depth_strength=0.03):
    """
    Full pipeline: template head → landmark deformation → depth refinement → neck.

    Args:
        image_path: Path to the selfie image
        face_landmarks: MediaPipe face landmarks object
        image_shape: Shape of input image (h, w, c)
        resolution: Mesh resolution (higher = more detail, slower)
        use_depth: Whether to apply MiDaS depth refinement
        depth_strength: How much depth affects the mesh (0.01-0.05)

    Returns:
        trimesh.Trimesh: Complete head mesh ready for export
    """
    print("[HeadGen] Step 1: Generating template head mesh...")
    vertices, faces, uvs = generate_template_head(resolution)
    print(f"  → {len(vertices)} vertices, {len(faces)} faces")

    print("[HeadGen] Step 2: Mapping face landmarks to 3D...")
    landmarks_3d = map_landmarks_to_3d(face_landmarks.landmark, image_shape)
    print(f"  → {len(landmarks_3d)} landmarks mapped")

    print("[HeadGen] Step 3: Deforming head to match face shape...")
    vertices = deform_to_landmarks(vertices, landmarks_3d, strength=0.7)

    if use_depth:
        print("[HeadGen] Step 4: Applying MiDaS depth refinement...")
        vertices = refine_with_depth(vertices, image_path, landmarks_3d, depth_strength)
    else:
        print("[HeadGen] Step 4: Depth refinement skipped")

    print("[HeadGen] Step 5: Adding neck...")
    vertices, faces = add_neck(vertices, faces, resolution)

    # Build trimesh
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces)

    # Smooth the mesh
    trimesh.smoothing.filter_laplacian(mesh, iterations=2)

    # Fix normals
    mesh.fix_normals()

    print(f"[HeadGen] Done: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces")
    return mesh