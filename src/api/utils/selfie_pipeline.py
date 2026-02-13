"""
selfie_pipeline.py — Unified Selfie-to-3D Avatar Pipeline
Drop into: src/api/utils/selfie_pipeline.py

Connects all three existing approaches into a single, working pipeline:
  Step 1: Background removal (rembg)
  Step 2: Face detection + 468-landmark mesh (MediaPipe — fast preview)
  Step 3: Depth estimation (MiDaS — quality 3D)
  Step 4: Point cloud generation
  Step 5: Poisson surface reconstruction
  Step 6: Mesh cleanup + decimation
  Step 7: Export to GLB

Usage from route:
    from api.utils.selfie_pipeline import process_selfie
    result = process_selfie(image_path, output_dir="static/exports")
    # result = { "glb_path": "...", "preview_glb": "...", "face_landmarks": [...] }
"""

import os
import logging
import numpy as np
import cv2
import trimesh
from PIL import Image

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Lazy-load heavy ML models (only load when first needed)
# This prevents slow startup / memory waste if not using this feature
# ─────────────────────────────────────────────────────────────
_midas_model = None
_midas_transform = None
_midas_device = None
_face_mesh = None


def _load_midas():
    """Load MiDaS depth estimation model (once)."""
    global _midas_model, _midas_transform, _midas_device
    if _midas_model is not None:
        return _midas_model, _midas_transform, _midas_device

    import torch
    logger.info("[Pipeline] Loading MiDaS DPT_Large model...")
    _midas_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    try:
        _midas_model = torch.hub.load("intel-isl/MiDaS", "DPT_Large")
        _midas_transform = torch.hub.load("intel-isl/MiDaS", "transforms").dpt_transform
    except Exception:
        # Fallback to smaller model if DPT_Large fails
        logger.warning("[Pipeline] DPT_Large failed, falling back to MiDaS_small")
        _midas_model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
        _midas_transform = torch.hub.load("intel-isl/MiDaS", "transforms").small_transform

    _midas_model.to(_midas_device)
    _midas_model.eval()
    logger.info(f"[Pipeline] MiDaS loaded on {_midas_device}")
    return _midas_model, _midas_transform, _midas_device


def _load_face_mesh():
    """Load MediaPipe FaceMesh (once)."""
    global _face_mesh
    if _face_mesh is not None:
        return _face_mesh

    import mediapipe as mp
    logger.info("[Pipeline] Loading MediaPipe FaceMesh...")
    _face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5
    )
    return _face_mesh


# ─────────────────────────────────────────────────────────────
# STEP 1: Background Removal
# ─────────────────────────────────────────────────────────────
def remove_background(image_path):
    """Remove background using rembg. Returns RGBA numpy array."""
    from rembg import remove

    with open(image_path, "rb") as f:
        input_bytes = f.read()
    
    output_bytes = remove(input_bytes)
    
    # Save temp file and reload as numpy
    temp_path = image_path.rsplit(".", 1)[0] + "_nobg.png"
    with open(temp_path, "wb") as f:
        f.write(output_bytes)
    
    img = cv2.imread(temp_path, cv2.IMREAD_UNCHANGED)  # RGBA
    logger.info(f"[Pipeline] Background removed: {img.shape}")
    return img, temp_path


# ─────────────────────────────────────────────────────────────
# STEP 2: Face Landmark Mesh (fast preview)
# ─────────────────────────────────────────────────────────────
def generate_face_mesh(image_path, output_dir):
    """
    Generate a quick face mesh from MediaPipe 468 landmarks.
    Returns path to preview GLB and the raw landmarks.
    """
    from mediapipe.python.solutions.face_mesh_connections import FACEMESH_TESSELATION

    face_mesh = _load_face_mesh()
    image = cv2.imread(image_path)
    h, w, _ = image.shape
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    results = face_mesh.process(image_rgb)

    if not results.multi_face_landmarks:
        logger.warning("[Pipeline] No face detected in image")
        return None, None, []

    landmarks = results.multi_face_landmarks[0]
    
    # Extract vertices
    vertices = []
    for lm in landmarks.landmark:
        vertices.append([
            (lm.x - 0.5) * w / 100,   # Center and scale
            -(lm.y - 0.5) * h / 100,   # Flip Y
            -lm.z * 50                   # Scale depth
        ])
    vertices = np.array(vertices)

    # Build faces from FACEMESH_TESSELATION edges
    # TESSELATION gives edges; we need to find triangles
    edge_set = set()
    adj = {}
    for a, b in FACEMESH_TESSELATION:
        edge_set.add((min(a, b), max(a, b)))
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)

    faces = []
    seen = set()
    for a in adj:
        for b in adj[a]:
            for c in adj[a]:
                if b >= c:
                    continue
                if c in adj.get(b, set()):
                    tri = tuple(sorted([a, b, c]))
                    if tri not in seen:
                        seen.add(tri)
                        faces.append(list(tri))

    if not faces:
        logger.warning("[Pipeline] Could not build face triangles")
        return None, None, []

    faces = np.array(faces)

    # Extract face colors from image
    vertex_colors = []
    for lm in landmarks.landmark:
        px = int(np.clip(lm.x * w, 0, w - 1))
        py = int(np.clip(lm.y * h, 0, h - 1))
        bgr = image[py, px]
        vertex_colors.append([bgr[2] / 255, bgr[1] / 255, bgr[0] / 255, 1.0])  # RGBA
    vertex_colors = np.array(vertex_colors)

    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, vertex_colors=vertex_colors)
    mesh.fix_normals()

    preview_path = os.path.join(output_dir, "face_preview.glb")
    mesh.export(preview_path)
    logger.info(f"[Pipeline] Face preview mesh: {len(vertices)} verts, {len(faces)} faces")

    # Return landmarks as serializable list
    lm_list = [{"x": lm.x, "y": lm.y, "z": lm.z} for lm in landmarks.landmark]
    return preview_path, mesh, lm_list


# ─────────────────────────────────────────────────────────────
# STEP 3: Depth Estimation (MiDaS)
# ─────────────────────────────────────────────────────────────
def estimate_depth(image_path):
    """Run MiDaS depth estimation. Returns (rgb_array, depth_map)."""
    import torch
    
    model, transform, device = _load_midas()
    
    img = Image.open(image_path).convert("RGB")
    img_np = np.array(img)

    input_tensor = transform(img_np).to(device)
    if input_tensor.dim() == 3:
        input_tensor = input_tensor.unsqueeze(0)

    with torch.no_grad():
        prediction = model(input_tensor)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1) if prediction.dim() == 3 else prediction,
            size=img_np.shape[:2],
            mode="bilinear",
            align_corners=False,
        ).squeeze()

    depth_map = prediction.cpu().numpy()
    
    # Normalize depth to reasonable range
    depth_min = np.percentile(depth_map, 2)
    depth_max = np.percentile(depth_map, 98)
    if depth_max - depth_min > 0:
        depth_map = (depth_map - depth_min) / (depth_max - depth_min)
    
    logger.info(f"[Pipeline] Depth estimated: shape={depth_map.shape}, range=[{depth_map.min():.3f}, {depth_map.max():.3f}]")
    return img_np, depth_map


# ─────────────────────────────────────────────────────────────
# STEPS 4-6: Point Cloud → Mesh → Cleanup
# ─────────────────────────────────────────────────────────────
def depth_to_mesh(rgb_img, depth_map, nobg_img=None, step=2):
    """
    Convert depth map to 3D mesh via point cloud + Poisson reconstruction.
    
    Args:
        rgb_img: RGB numpy array
        depth_map: Normalized depth map (0-1)
        nobg_img: RGBA image with background removed (to mask out background)
        step: Sampling step (higher = faster but less detail)
    
    Returns:
        trimesh.Trimesh
    """
    import open3d as o3d

    h, w = depth_map.shape
    fx = fy = max(h, w)  # Approximate focal length
    cx, cy = w / 2, h / 2

    # Build alpha mask from background-removed image
    alpha_mask = None
    if nobg_img is not None and nobg_img.shape[2] == 4:
        alpha_mask = cv2.resize(nobg_img[:, :, 3], (w, h))

    points = []
    colors = []
    
    for v in range(0, h, step):
        for u in range(0, w, step):
            # Skip background pixels
            if alpha_mask is not None and alpha_mask[v, u] < 128:
                continue
                
            z = depth_map[v, u]
            if z <= 0.01:
                continue
                
            x = (u - cx) * z / fx
            y = -(v - cy) * z / fy  # Flip Y for 3D convention
            points.append([x, y, z])
            
            # Get color from RGB image
            pv = min(v, rgb_img.shape[0] - 1)
            pu = min(u, rgb_img.shape[1] - 1)
            colors.append(rgb_img[pv, pu] / 255.0)

    if len(points) < 100:
        logger.error(f"[Pipeline] Too few points ({len(points)}), cannot reconstruct")
        return None

    logger.info(f"[Pipeline] Point cloud: {len(points)} points")

    # Create Open3D point cloud
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(points))
    pcd.colors = o3d.utility.Vector3dVector(np.array(colors))
    
    # Statistical outlier removal
    pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)
    
    # Estimate normals (required for Poisson)
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.05, max_nn=30)
    )
    pcd.orient_normals_towards_camera_location(camera_location=np.array([0, 0, -1]))

    # Poisson surface reconstruction
    logger.info("[Pipeline] Running Poisson reconstruction (depth=8)...")
    mesh_o3d, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=8)
    
    # Remove low-density vertices (cleanup mesh edges)
    densities = np.asarray(densities)
    density_threshold = np.percentile(densities, 10)
    vertices_to_remove = densities < density_threshold
    mesh_o3d.remove_vertices_by_mask(vertices_to_remove)
    
    mesh_o3d.compute_vertex_normals()

    # Convert Open3D mesh to trimesh
    vertices = np.asarray(mesh_o3d.vertices)
    faces = np.asarray(mesh_o3d.triangles)
    
    # Transfer vertex colors
    vertex_colors = None
    if mesh_o3d.has_vertex_colors():
        vc = np.asarray(mesh_o3d.vertex_colors)
        vertex_colors = np.column_stack([vc, np.ones(len(vc))])  # Add alpha

    mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors
    )
    
    # Decimate if too many faces (keep it browser-friendly)
    MAX_FACES = 50000
    if len(mesh.faces) > MAX_FACES:
        logger.info(f"[Pipeline] Decimating {len(mesh.faces)} → {MAX_FACES} faces")
        mesh = mesh.simplify_quadric_decimation(MAX_FACES)
    
    mesh.fix_normals()
    logger.info(f"[Pipeline] Final mesh: {len(mesh.vertices)} verts, {len(mesh.faces)} faces")
    return mesh


# ─────────────────────────────────────────────────────────────
# STEP 7: Export to GLB
# ─────────────────────────────────────────────────────────────
def export_glb(mesh, output_path):
    """Export trimesh to GLB format."""
    mesh.export(output_path, file_type="glb")
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    logger.info(f"[Pipeline] Exported GLB: {output_path} ({file_size_mb:.1f} MB)")
    return output_path


# ─────────────────────────────────────────────────────────────
# MAIN PIPELINE ENTRY POINT
# ─────────────────────────────────────────────────────────────
def process_selfie(image_path, output_dir="static/exports", skip_depth=False):
    """
    Full selfie-to-3D pipeline.
    
    Args:
        image_path: Path to uploaded selfie image
        output_dir: Where to save output files
        skip_depth: If True, only generate face mesh preview (faster)
    
    Returns:
        dict: {
            "glb_path": str,           # Full 3D model path (or None if skip_depth)
            "preview_glb": str,        # Fast face mesh preview path
            "face_landmarks": list,    # 468 face landmarks for rigging
            "success": bool,
            "error": str or None
        }
    """
    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    
    result = {
        "glb_path": None,
        "preview_glb": None,
        "face_landmarks": [],
        "success": False,
        "error": None
    }

    try:
        # Step 1: Remove background
        logger.info(f"[Pipeline] Processing: {image_path}")
        nobg_img, nobg_path = remove_background(image_path)

        # Step 2: Face mesh preview (fast — always do this)
        preview_path, _, landmarks = generate_face_mesh(image_path, output_dir)
        if preview_path:
            result["preview_glb"] = preview_path
            result["face_landmarks"] = landmarks
        
        if skip_depth:
            result["glb_path"] = preview_path
            result["success"] = preview_path is not None
            return result

        # Steps 3-6: Depth → Point Cloud → Mesh
        rgb_img, depth_map = estimate_depth(nobg_path)
        mesh = depth_to_mesh(rgb_img, depth_map, nobg_img, step=2)
        
        if mesh is None:
            result["error"] = "Mesh reconstruction failed — too few points"
            result["glb_path"] = preview_path  # Fall back to face mesh
            result["success"] = preview_path is not None
            return result

        # Step 7: Export
        glb_path = os.path.join(output_dir, f"{base_name}_avatar.glb")
        export_glb(mesh, glb_path)
        
        result["glb_path"] = glb_path
        result["success"] = True

        # Cleanup temp files
        try:
            os.remove(nobg_path)
        except OSError:
            pass

    except Exception as e:
        logger.exception(f"[Pipeline] Error: {e}")
        result["error"] = str(e)

    return result


# ─────────────────────────────────────────────────────────────
# FLASK ROUTE — Drop this into routes.py or import it
# ─────────────────────────────────────────────────────────────
def register_selfie_routes(api_blueprint, upload_folder="static/uploads", export_folder="static/exports"):
    """
    Register the unified selfie upload route on a Flask blueprint.
    
    Usage in routes.py:
        from api.utils.selfie_pipeline import register_selfie_routes
        register_selfie_routes(api, UPLOAD_FOLDER, "static/exports")
    """
    from flask import request, jsonify
    from werkzeug.utils import secure_filename

    ALLOWED = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

    @api_blueprint.route('/upload-selfie-v2', methods=['POST'])
    def upload_selfie_v2():
        image = request.files.get('image')
        if not image:
            return jsonify({"error": "No image uploaded"}), 400

        ext = image.filename.rsplit('.', 1)[-1].lower() if '.' in image.filename else ''
        if ext not in ALLOWED:
            return jsonify({"error": f"Invalid file type: .{ext}"}), 400

        filename = secure_filename(image.filename)
        filepath = os.path.join(upload_folder, filename)
        os.makedirs(upload_folder, exist_ok=True)
        image.save(filepath)

        # Check if user wants fast preview only
        quick_mode = request.form.get('quick', 'false').lower() == 'true'

        result = process_selfie(filepath, export_folder, skip_depth=quick_mode)

        if result["success"]:
            response = {
                "message": "Avatar generated successfully",
                "avatar_url": result["glb_path"],
                "preview_url": result["preview_glb"],
                "face_landmarks": result["face_landmarks"],
            }
            return jsonify(response), 200
        else:
            return jsonify({
                "error": result["error"] or "Avatar generation failed",
                "preview_url": result["preview_glb"],  # May still have face preview
            }), 500