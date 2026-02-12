import torch
import cv2
import numpy as np
import open3d as o3d
from torchvision.transforms import Compose, Resize, ToTensor, Normalize
from PIL import Image
import matplotlib.pyplot as plt
import argparse

# Set device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Load MiDaS model (MiDaS_small is lightweight and fast)
# model_type = "MiDaS_small"
# midas = torch.hub.load("intel-isl/MiDaS", model_type)
model_type = "MiDaS_large"
midas = torch.hub.load("intel-isl/MiDaS", model_type)
midas.to(device)
midas.eval()

# Load transform
midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
transform = midas_transforms.small_transform


def estimate_depth(image_path):
    """Estimate depth from selfie using MiDaS."""
    img = Image.open(image_path).convert("RGB")
    img_np = np.array(img)

    # MiDaS_small uses a plain transform, not a dict with 'image'
    transformed = transform(img_np)
    
    # Check if transformed is a dict or tensor
    if isinstance(transformed, dict):
        input_tensor = transformed["image"]
    else:
        input_tensor = transformed

    input_tensor = input_tensor.to(device)
    
    with torch.no_grad():
        prediction = midas(input_tensor)
        prediction = torch.nn.functional.interpolate(
            prediction.unsqueeze(1),
            size=img_np.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

    depth_map = prediction.cpu().numpy()
    return img_np, depth_map


def depth_to_mesh(image, depth_map, output_path="avatar_output.ply", sample_step=3):
    """Convert depth map and RGB to point cloud and mesh."""
    h, w = depth_map.shape
    fx = fy = 1.0  # Focal lengths (mocked)
    cx = w / 2
    cy = h / 2

    points = []
    colors = []

    for y in range(0, h, sample_step):
        for x in range(0, w, sample_step):
            z = depth_map[y, x]
            if np.isnan(z) or z <= 0:
                continue
            X = (x - cx) * z / fx
            Y = (y - cy) * z / fy
            points.append((X, Y, z))
            colors.append(image[y, x] / 255.0)

    pc = o3d.geometry.PointCloud()
    pc.points = o3d.utility.Vector3dVector(np.array(points))
    pc.colors = o3d.utility.Vector3dVector(np.array(colors))
    pc.estimate_normals()

    mesh, _ = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pc, depth=8)
    mesh.compute_vertex_normals()

    o3d.io.write_triangle_mesh(output_path, mesh)
    print(f"✅ Mesh saved to: {output_path}")


def show_depth_map(depth_map):
    """Display the estimated depth map with matplotlib."""
    plt.imshow(depth_map, cmap='inferno')
    plt.title("Estimated Depth Map")
    plt.colorbar(label="Depth")
    plt.axis("off")
    plt.show()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate 3D avatar from selfie")
    parser.add_argument("--input", required=True, help="Path to input selfie image")
    parser.add_argument("--output", default="avatars/your_avatar.ply", help="Output mesh file")
    parser.add_argument("--show-depth", action="store_true", help="Show depth map preview")
    args = parser.parse_args()

    print("🔍 Estimating depth...")
    rgb_img, depth_map = estimate_depth(args.input)

    if args.show_depth:
        show_depth_map(depth_map)

    print("🛠 Creating 3D mesh...")
    depth_to_mesh(rgb_img, depth_map, output_path=args.output)
