# src/api/utils/selfie_to_avatar.py
# Complete Selfie to 3D Avatar Pipeline
# Connects: Upload → Background Removal → Depth Estimation → 3D Reconstruction → Export

import os
import cv2
import numpy as np
import torch
from PIL import Image
from rembg import remove
import open3d as o3d
import trimesh
import tempfile

# ============================================
# 1. DEPTH ESTIMATION (MiDaS)
# ============================================

_midas_model = None
_midas_transform = None
_midas_device = None

def load_midas():
    """Load MiDaS model for depth estimation (cached)"""
    global _midas_model, _midas_transform, _midas_device
    
    if _midas_model is None:
        print("Loading MiDaS model...")
        model_type = "DPT_Large"  # Best quality
        _midas_model = torch.hub.load("intel-isl/MiDaS", model_type)
        _midas_model.eval()
        _midas_transform = torch.hub.load("intel-isl/MiDaS", "transforms").dpt_transform
        _midas_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        _midas_model.to(_midas_device)
        print(f"MiDaS loaded on {_midas_device}")
    
    return _midas_model, _midas_transform, _midas_device


def estimate_depth(image_path):
    """
    Estimate depth map from image using MiDaS
    Returns: (original_image_rgb, depth_map)
    """
    model, transform, device = load_midas()
    
    # Load image
    img = cv2.imread(image_path)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    # Transform for MiDaS
    input_batch = transform(img_rgb).to(device)
    
    # Predict depth
    with torch.no_grad():
        prediction = model(input_batch)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=img_rgb.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()
    
    depth_map = prediction.cpu().numpy()
    
    # Normalize depth
    depth_map = (depth_map - depth_map.min()) / (depth_map.max() - depth_map.min())
    
    return img_rgb, depth_map


# ============================================
# 2. BACKGROUND REMOVAL
# ============================================

def remove_background(input_path, output_path=None):
    """
    Remove background from image using rembg
    Returns path to no-background image
    """
    with open(input_path, "rb") as f:
        input_bytes = f.read()
    
    # Remove background
    no_bg_bytes = remove(input_bytes)
    
    # Save to file
    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_nobg.png"
    
    with open(output_path, "wb") as f:
        f.write(no_bg_bytes)
    
    return output_path


# ============================================
# 3. POINT CLOUD GENERATION
# ============================================

def depth_to_pointcloud(img_rgb, depth_map, sample_step=2):
    """
    Convert RGB image + depth map to 3D point cloud
    
    Args:
        img_rgb: RGB image array
        depth_map: Normalized depth map
        sample_step: Downsample factor for performance
    
    Returns: Open3D PointCloud
    """
    h, w = depth_map.shape
    
    # Camera intrinsics (approximation)
    fx = fy = max(h, w) * 1.2
    cx = w / 2
    cy = h / 2
    
    points = []
    colors = []
    
    for y in range(0, h, sample_step):
        for x in range(0, w, sample_step):
            z = depth_map[y, x]
            
            # Skip invalid depth
            if z <= 0.01 or np.isnan(z):
                continue
            
            # Check if pixel has content (not transparent)
            if img_rgb.shape[2] == 4:  # RGBA
                if img_rgb[y, x, 3] < 128:  # Transparent
                    continue
            
            # Back-project to 3D
            X = (x - cx) * z / fx
            Y = (y - cy) * z / fy
            Z = z
            
            points.append([X, -Y, -Z])  # Flip Y and Z for correct orientation
            
            # Get color
            if img_rgb.shape[2] == 4:
                colors.append(img_rgb[y, x, :3] / 255.0)
            else:
                colors.append(img_rgb[y, x] / 255.0)
    
    # Create Open3D point cloud
    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.array(points))
    pcd.colors = o3d.utility.Vector3dVector(np.array(colors))
    
    # Estimate normals for Poisson reconstruction
    pcd.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.1, max_nn=30)
    )
    pcd.orient_normals_consistent_tangent_plane(k=15)
    
    return pcd


# ============================================
# 4. MESH RECONSTRUCTION
# ============================================

def pointcloud_to_mesh(pcd, depth=8):
    """
    Convert point cloud to mesh using Poisson surface reconstruction
    
    Args:
        pcd: Open3D PointCloud with normals
        depth: Octree depth (higher = more detail, slower)
    
    Returns: Open3D TriangleMesh
    """
    print(f"Running Poisson reconstruction (depth={depth})...")
    
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        pcd, depth=depth, linear_fit=False
    )
    
    # Remove low-density vertices (cleanup)
    vertices_to_remove = densities < np.quantile(densities, 0.01)
    mesh.remove_vertices_by_mask(vertices_to_remove)
    
    # Compute normals for rendering
    mesh.compute_vertex_normals()
    
    return mesh


# ============================================
# 5. MESH EXPORT
# ============================================

def export_mesh(mesh, output_path, file_format="glb"):
    """
    Export mesh to file (GLB, OBJ, PLY)
    
    Uses trimesh for GLB export (better compatibility)
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    
    # Convert Open3D mesh to trimesh for better export options
    vertices = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.triangles)
    
    # Get vertex colors if available
    vertex_colors = None
    if mesh.has_vertex_colors():
        colors = np.asarray(mesh.vertex_colors)
        # Convert to RGBA uint8
        vertex_colors = (colors * 255).astype(np.uint8)
        # Add alpha channel
        alpha = np.full((vertex_colors.shape[0], 1), 255, dtype=np.uint8)
        vertex_colors = np.hstack([vertex_colors, alpha])
    
    # Create trimesh
    tri_mesh = trimesh.Trimesh(
        vertices=vertices,
        faces=faces,
        vertex_colors=vertex_colors
    )
    
    # Export
    if file_format.lower() in ["glb", "gltf"]:
        tri_mesh.export(output_path, file_type="glb")
    elif file_format.lower() == "obj":
        tri_mesh.export(output_path, file_type="obj")
    elif file_format.lower() == "ply":
        o3d.io.write_triangle_mesh(output_path, mesh)
    else:
        tri_mesh.export(output_path)
    
    print(f"Exported mesh to {output_path}")
    return output_path


# ============================================
# 6. MAIN PIPELINE
# ============================================

def selfie_to_avatar(input_path, output_dir="static/uploads", quality="medium"):
    """
    Complete pipeline: Selfie → 3D Avatar
    
    Args:
        input_path: Path to selfie image
        output_dir: Directory to save outputs
        quality: "low", "medium", "high" (affects detail and speed)
    
    Returns: dict with paths to generated files
    """
    print(f"\n{'='*50}")
    print(f"Starting Avatar Generation Pipeline")
    print(f"Input: {input_path}")
    print(f"Quality: {quality}")
    print(f"{'='*50}\n")
    
    # Quality presets
    quality_settings = {
        "low": {"sample_step": 4, "poisson_depth": 6},
        "medium": {"sample_step": 2, "poisson_depth": 8},
        "high": {"sample_step": 1, "poisson_depth": 10},
    }
    settings = quality_settings.get(quality, quality_settings["medium"])
    
    os.makedirs(output_dir, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    
    results = {
        "input": input_path,
        "status": "processing"
    }
    
    try:
        # Step 1: Remove background
        print("Step 1/4: Removing background...")
        nobg_path = os.path.join(output_dir, f"{base_name}_nobg.png")
        remove_background(input_path, nobg_path)
        results["nobg_image"] = nobg_path
        
        # Step 2: Estimate depth
        print("Step 2/4: Estimating depth...")
        img_nobg = cv2.imread(nobg_path, cv2.IMREAD_UNCHANGED)
        img_rgb, depth_map = estimate_depth(nobg_path)
        
        # Save depth map visualization
        depth_vis = (depth_map * 255).astype(np.uint8)
        depth_vis_path = os.path.join(output_dir, f"{base_name}_depth.png")
        cv2.imwrite(depth_vis_path, depth_vis)
        results["depth_map"] = depth_vis_path
        
        # Step 3: Generate point cloud
        print("Step 3/4: Generating point cloud...")
        
        # Use the no-bg image for colors
        if img_nobg.shape[2] == 4:  # RGBA
            img_for_pc = img_nobg
        else:
            img_for_pc = cv2.cvtColor(img_nobg, cv2.COLOR_BGR2RGB)
        
        pcd = depth_to_pointcloud(
            img_for_pc, 
            depth_map, 
            sample_step=settings["sample_step"]
        )
        
        # Save point cloud
        pcd_path = os.path.join(output_dir, f"{base_name}_pointcloud.ply")
        o3d.io.write_point_cloud(pcd_path, pcd)
        results["pointcloud"] = pcd_path
        
        # Step 4: Reconstruct mesh
        print("Step 4/4: Reconstructing mesh...")
        mesh = pointcloud_to_mesh(pcd, depth=settings["poisson_depth"])
        
        # Export as GLB
        glb_path = os.path.join(output_dir, f"{base_name}_avatar.glb")
        export_mesh(mesh, glb_path, "glb")
        results["avatar_glb"] = glb_path
        
        # Also export as OBJ for compatibility
        obj_path = os.path.join(output_dir, f"{base_name}_avatar.obj")
        export_mesh(mesh, obj_path, "obj")
        results["avatar_obj"] = obj_path
        
        # Cleanup temp files
        try:
            os.remove(nobg_path)
        except:
            pass
        
        results["status"] = "success"
        results["message"] = "Avatar generated successfully"
        
        print(f"\n{'='*50}")
        print("Pipeline Complete!")
        print(f"Avatar saved to: {glb_path}")
        print(f"{'='*50}\n")
        
    except Exception as e:
        print(f"Error in pipeline: {str(e)}")
        import traceback
        traceback.print_exc()
        results["status"] = "error"
        results["error"] = str(e)
    
    return results


# ============================================
# CLI USAGE
# ============================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python selfie_to_avatar.py <image_path> [quality]")
        print("Quality options: low, medium, high")
        sys.exit(1)
    
    input_image = sys.argv[1]
    quality = sys.argv[2] if len(sys.argv) > 2 else "medium"
    
    results = selfie_to_avatar(input_image, quality=quality)
    print("\nResults:")
    for key, value in results.items():
        print(f"  {key}: {value}")