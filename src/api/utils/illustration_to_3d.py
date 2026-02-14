# src/api/utils/illustration_to_3d.py
# Convert 2D illustrations (hand-drawn or digital) to 3D mesh
# Supports: head/face illustrations and full-body character art
# Pipeline: Background removal → Edge enhancement → Depth estimation → Point cloud → Mesh

import os
import cv2
import torch
import numpy as np
import open3d as o3d
import trimesh
from PIL import Image, ImageFilter, ImageEnhance
from rembg import remove

# Lazy-loaded MiDaS model (only loads when actually needed, not at import time)
_midas = None
_transform = None
_device = None


def _get_midas():
    global _midas, _transform, _device
    if _midas is None:
        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        _midas = torch.hub.load("intel-isl/MiDaS", "DPT_Large")
        _midas.to(_device)
        _midas.eval()
        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
        _transform = midas_transforms.dpt_transform
    return _midas, _transform, _device


def preprocess_illustration(image_path, illustration_type="full_body"):
    """
    Preprocess illustration for better depth estimation.
    Illustrations need different treatment than photos:
    - Enhance edges/outlines (they define shape)
    - Normalize colors (flat shading vs photo realism)
    - Remove background cleanly
    """
    # Remove background
    with open(image_path, "rb") as f:
        input_bytes = f.read()
    no_bg = remove(input_bytes)

    temp_path = image_path.rsplit(".", 1)[0] + "_nobg.png"
    with open(temp_path, "wb") as f:
        f.write(no_bg)

    img = Image.open(temp_path).convert("RGBA")

    # Create alpha mask for the character region
    alpha = np.array(img)[:, :, 3]
    mask = (alpha > 10).astype(np.uint8) * 255

    # Convert to RGB for processing
    img_rgb = img.convert("RGB")

    # Enhance contrast - illustrations often have flat colors
    enhancer = ImageEnhance.Contrast(img_rgb)
    img_rgb = enhancer.enhance(1.3)

    # Enhance edges - helps MiDaS understand shape from line art
    enhancer = ImageEnhance.Sharpness(img_rgb)
    img_rgb = enhancer.enhance(1.5)

    # For head illustrations, add synthetic shading to help depth estimation
    if illustration_type == "head":
        img_rgb = add_synthetic_shading(img_rgb, mask)

    img_rgb.save(temp_path)

    return temp_path, mask


def add_synthetic_shading(img, mask):
    """
    Add subtle gradient shading to flat illustrations to help depth estimation.
    Simulates light direction to give MiDaS depth cues.
    """
    img_np = np.array(img).astype(np.float32)
    h, w = mask.shape

    # Create a radial gradient (center = closest, edges = further)
    y_coords, x_coords = np.ogrid[:h, :w]
    center_y, center_x = h // 2, w // 2

    # Find centroid of the character mask
    moments = cv2.moments(mask)
    if moments["m00"] > 0:
        center_x = int(moments["m10"] / moments["m00"])
        center_y = int(moments["m01"] / moments["m00"])

    # Radial distance from center (normalized)
    dist = np.sqrt((x_coords - center_x) ** 2 + (y_coords - center_y) ** 2)
    max_dist = np.sqrt(center_x ** 2 + center_y ** 2)
    dist_norm = dist / max(max_dist, 1)

    # Apply subtle darkening toward edges (simulates 3D curvature)
    shading = 1.0 - (dist_norm * 0.15)  # Very subtle - max 15% darkening
    shading = np.clip(shading, 0.85, 1.0)

    # Only apply where mask is active
    mask_float = (mask / 255.0).astype(np.float32)
    for c in range(3):
        img_np[:, :, c] = img_np[:, :, c] * (1 - mask_float) + \
                           img_np[:, :, c] * shading * mask_float

    return Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))


def estimate_depth_illustration(image_path, mask):
    """
    Estimate depth from preprocessed illustration using MiDaS.
    Applies mask to isolate character from background.
    """
    img = Image.open(image_path).convert("RGB")
    img_np = np.array(img)

    midas, transform, device = _get_midas()

    # Apply MiDaS transform
    input_tensor = transform(img_np).to(device)

    with torch.no_grad():
        prediction = midas(input_tensor)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=img_np.shape[:2],
            mode="bilinear",
            align_corners=False,
        ).squeeze()

    depth_map = prediction.cpu().numpy()

    # Normalize depth to useful range
    valid_depth = depth_map[mask > 0]
    if len(valid_depth) > 0:
        d_min, d_max = valid_depth.min(), valid_depth.max()
        if d_max > d_min:
            depth_map = (depth_map - d_min) / (d_max - d_min)
        else:
            depth_map = np.ones_like(depth_map) * 0.5

    # Zero out background
    depth_map[mask == 0] = 0

    return img_np, depth_map


def create_mesh_from_depth(img_np, depth_map, mask, illustration_type="full_body",
                           depth_scale=80, sample_step=2, poisson_depth=8):
    """
    Create 3D mesh from depth map and color image.
    
    Args:
        img_np: RGB image as numpy array
        depth_map: Normalized depth map (0-1)
        mask: Character mask
        illustration_type: 'head' or 'full_body'
        depth_scale: How much to extrude depth (higher = more 3D)
        sample_step: Pixel sampling step (lower = more detail, slower)
        poisson_depth: Poisson reconstruction detail level
    """
    h, w = depth_map.shape
    fx = fy = max(h, w)
    cx, cy = w / 2, h / 2

    points = []
    colors = []

    # Adjust depth scale based on type
    if illustration_type == "head":
        depth_scale = 120  # More depth for face features
        sample_step = 1  # Higher detail for face
    else:
        depth_scale = 80
        sample_step = 2

    for y in range(0, h, sample_step):
        for x in range(0, w, sample_step):
            if mask[y, x] == 0:
                continue

            z = depth_map[y, x] * depth_scale
            if z <= 0:
                continue

            X = (x - cx) * z / fx
            Y = -(y - cy) * z / fy  # Flip Y for 3D convention
            points.append([X, Y, z])
            colors.append(img_np[y, x] / 255.0)

    if len(points) < 100:
        return None

    # Create Open3D point cloud
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(points))
    pcd.colors = o3d.utility.Vector3dVector(np.array(colors))
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=5, max_nn=30)
    )
    pcd.orient_normals_towards_camera_location(camera_location=np.array([0, 0, -100]))

    # Statistical outlier removal
    pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)

    # Poisson surface reconstruction
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=poisson_depth
    )

    # Remove low-density vertices (usually noise at edges)
    densities = np.asarray(densities)
    density_threshold = np.quantile(densities, 0.05)
    vertices_to_remove = densities < density_threshold
    mesh.remove_vertices_by_mask(vertices_to_remove)

    # Smooth mesh
    mesh = mesh.filter_smooth_laplacian(number_of_iterations=5)
    mesh.compute_vertex_normals()

    return mesh


def add_back_face(mesh, depth_offset=-10):
    """
    Add a flat or slightly curved back face to make the mesh more solid.
    Illustrations only give us the front view, so we mirror/flatten the back.
    """
    vertices = np.asarray(mesh.vertices)
    triangles = np.asarray(mesh.triangles)
    colors = np.asarray(mesh.vertex_colors) if mesh.has_vertex_colors() else None

    # Create back vertices (flatten z and offset)
    back_vertices = vertices.copy()
    z_min = vertices[:, 2].min()
    back_vertices[:, 2] = z_min + depth_offset

    # Flip triangle winding for back face
    back_triangles = triangles[:, ::-1] + len(vertices)

    # Combine front and back
    all_vertices = np.vstack([vertices, back_vertices])
    all_triangles = np.vstack([triangles, back_triangles])

    combined = o3d.geometry.TriangleMesh()
    combined.vertices = o3d.utility.Vector3dVector(all_vertices)
    combined.triangles = o3d.utility.Vector3iVector(all_triangles)

    if colors is not None:
        # Slightly darken back face colors
        back_colors = colors * 0.7
        all_colors = np.vstack([colors, back_colors])
        combined.vertex_colors = o3d.utility.Vector3dVector(all_colors)

    combined.compute_vertex_normals()
    return combined


def illustration_to_3d(input_path, output_dir="static/exports",
                        illustration_type="full_body", add_back=True,
                        export_format="glb"):
    """
    Main pipeline: Convert 2D illustration to 3D model.
    
    Args:
        input_path: Path to illustration image
        output_dir: Output directory for exported mesh
        illustration_type: 'head' or 'full_body'
        add_back: Whether to add a back face to the model
        export_format: 'glb', 'obj', or 'ply'
    
    Returns:
        dict with model path, preview info, and metadata
    """
    os.makedirs(output_dir, exist_ok=True)
    basename = os.path.basename(input_path).rsplit(".", 1)[0]

    # Step 1: Preprocess
    processed_path, mask = preprocess_illustration(input_path, illustration_type)

    # Step 2: Estimate depth
    img_np, depth_map = estimate_depth_illustration(processed_path, mask)

    # Step 3: Create mesh
    mesh = create_mesh_from_depth(img_np, depth_map, mask, illustration_type)

    if mesh is None:
        # Cleanup
        try:
            os.remove(processed_path)
        except:
            pass
        return {"error": "Could not generate 3D mesh. Try a clearer illustration with distinct outlines."}

    # Step 4: Add back face for solid look
    if add_back:
        mesh = add_back_face(mesh)

    # Step 5: Export
    if export_format == "glb":
        # Convert Open3D mesh to trimesh for GLB export
        vertices = np.asarray(mesh.vertices)
        faces = np.asarray(mesh.triangles)

        vertex_colors = None
        if mesh.has_vertex_colors():
            vertex_colors = (np.asarray(mesh.vertex_colors) * 255).astype(np.uint8)
            # Add alpha channel
            alpha = np.full((vertex_colors.shape[0], 1), 255, dtype=np.uint8)
            vertex_colors = np.hstack([vertex_colors, alpha])

        tri_mesh = trimesh.Trimesh(
            vertices=vertices,
            faces=faces,
            vertex_colors=vertex_colors
        )

        output_path = os.path.join(output_dir, f"{basename}_3d.glb")
        tri_mesh.export(output_path)

    elif export_format == "obj":
        output_path = os.path.join(output_dir, f"{basename}_3d.obj")
        o3d.io.write_triangle_mesh(output_path, mesh)

    else:  # ply
        output_path = os.path.join(output_dir, f"{basename}_3d.ply")
        o3d.io.write_triangle_mesh(output_path, mesh)

    # Save depth map preview
    depth_preview_path = os.path.join(output_dir, f"{basename}_depth.png")
    depth_visual = (depth_map * 255).astype(np.uint8)
    depth_colored = cv2.applyColorMap(depth_visual, cv2.COLORMAP_INFERNO)
    cv2.imwrite(depth_preview_path, depth_colored)

    # Cleanup temp files
    try:
        os.remove(processed_path)
    except:
        pass

    return {
        "model_path": output_path,
        "model_url": f"/static/exports/{os.path.basename(output_path)}",
        "depth_preview_url": f"/static/exports/{os.path.basename(depth_preview_path)}",
        "illustration_type": illustration_type,
        "vertex_count": len(np.asarray(mesh.vertices)),
        "face_count": len(np.asarray(mesh.triangles)),
        "format": export_format,
    }


# Convenience functions
def head_illustration_to_3d(input_path, output_dir="static/exports", export_format="glb"):
    """Convert a head/face illustration to 3D."""
    return illustration_to_3d(input_path, output_dir, "head", True, export_format)


def body_illustration_to_3d(input_path, output_dir="static/exports", export_format="glb"):
    """Convert a full-body illustration to 3D."""
    return illustration_to_3d(input_path, output_dir, "full_body", True, export_format)