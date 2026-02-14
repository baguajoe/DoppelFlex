# src/api/illustration_routes.py
# API routes for 2D illustration to 3D conversion
# Add to your main routes.py or register as a Blueprint

from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
import os

from .utils.illustration_to_3d import illustration_to_3d

illustration_api = Blueprint("illustration_api", __name__)

UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "static/uploads")
EXPORT_FOLDER = os.environ.get("EXPORT_FOLDER", "static/exports")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@illustration_api.route("/api/illustration-to-3d", methods=["POST"])
def convert_illustration():
    """
    Convert a 2D illustration to a 3D model.
    
    Expects:
        - image: File upload (PNG/JPG)
        - type: 'head' or 'full_body' (form field)
        - format: 'glb', 'obj', or 'ply' (form field, optional, default: glb)
        - add_back: 'true' or 'false' (form field, optional, default: true)
    
    Returns:
        JSON with model URL, depth preview, and mesh stats
    """
    image = request.files.get("image")

    if not image:
        return jsonify({"error": "No image uploaded"}), 400

    if not allowed_file(image.filename):
        return jsonify({
            "error": "Invalid file type. Supported: PNG, JPG, JPEG, WEBP"
        }), 400

    # Get parameters
    illustration_type = request.form.get("type", "full_body")
    export_format = request.form.get("format", "glb")
    add_back = request.form.get("add_back", "true").lower() == "true"

    if illustration_type not in ("head", "full_body"):
        return jsonify({"error": "Type must be 'head' or 'full_body'"}), 400

    if export_format not in ("glb", "obj", "ply"):
        return jsonify({"error": "Format must be 'glb', 'obj', or 'ply'"}), 400

    # Save uploaded file
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)

    try:
        result = illustration_to_3d(
            input_path=filepath,
            output_dir=EXPORT_FOLDER,
            illustration_type=illustration_type,
            add_back=add_back,
            export_format=export_format,
        )

        if "error" in result:
            return jsonify(result), 422

        return jsonify({
            "success": True,
            "model_url": result["model_url"],
            "depth_preview_url": result["depth_preview_url"],
            "stats": {
                "vertices": result["vertex_count"],
                "faces": result["face_count"],
                "format": result["format"],
                "type": result["illustration_type"],
            },
        }), 200

    except Exception as e:
        print(f"Illustration to 3D error: {e}")
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

    finally:
        # Clean up uploaded file
        try:
            os.remove(filepath)
        except:
            pass


# ---- Register this blueprint in your main app ----
# In your app.py or __init__.py:
#
# from api.illustration_routes import illustration_api
# app.register_blueprint(illustration_api)