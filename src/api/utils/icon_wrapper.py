import subprocess
import os

def send_to_icon(input_image_path):
    output_path = os.path.join("ICON", "results", os.path.basename(input_image_path).split('.')[0])
    os.makedirs(output_path, exist_ok=True)

    command = [
        "python", "apps/demo.py",
        "--cfg", "configs/icon-filter.yaml",
        "--input_image", input_image_path,
        "--output_dir", output_path
    ]

    try:
        subprocess.run(command, cwd="ICON", check=True)
        output_file = os.path.join(output_path, "recon.obj")
        return output_file if os.path.exists(output_file) else None
    except Exception as e:
        print(f"[ICON Error] {e}")
        return None
