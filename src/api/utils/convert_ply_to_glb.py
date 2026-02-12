import open3d as o3d
import os

def convert_ply_to_glb(ply_path, output_dir="static/uploads"):
    if not os.path.exists(ply_path):
        raise FileNotFoundError(f"PLY file not found: {ply_path}")

    mesh = o3d.io.read_triangle_mesh(ply_path)
    glb_filename = os.path.splitext(os.path.basename(ply_path))[0] + ".glb"
    glb_path = os.path.join(output_dir, glb_filename)

    o3d.io.write_triangle_mesh(glb_path, mesh)
    return glb_path
