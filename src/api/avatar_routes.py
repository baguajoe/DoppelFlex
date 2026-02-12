# src/api/avatar_routes.py
# Comprehensive Avatar Generation API Routes
# Fixed import paths for kiosk project structure

from flask import Blueprint, request, jsonify, send_file, send_from_directory
from werkzeug.utils import secure_filename
import os
import cv2
import numpy as np
import mediapipe as mp
import trimesh
import tempfile

# Create Blueprint
avatar_api = Blueprint('avatar_api', __name__)

# Configuration
UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'static/uploads')
EXPORT_FOLDER = os.environ.get('EXPORT_FOLDER', 'static/exports')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Ensure folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(EXPORT_FOLDER, exist_ok=True)

# Initialize MediaPipe
mp_face_mesh = mp.solutions.face_mesh
mp_face_detection = mp.solutions.face_detection


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ============================================
# ROUTE 1: Face Detection (Quick Check)
# ============================================

@avatar_api.route('/api/detect-face', methods=['POST'])
def detect_face():
    """
    Quick face detection to validate image before processing
    Returns bounding box and confidence
    """
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    image = request.files['image']
    if not allowed_file(image.filename):
        return jsonify({"error": "Invalid file type"}), 400
    
    # Save temporarily
    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)
    
    try:
        # Detect face
        img = cv2.imread(filepath)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        with mp_face_detection.FaceDetection(min_detection_confidence=0.5) as face_detection:
            results = face_detection.process(img_rgb)
        
        if not results.detections:
            return jsonify({
                "detected": False,
                "error": "No face detected in image"
            }), 400
        
        # Get first face
        detection = results.detections[0]
        bbox = detection.location_data.relative_bounding_box
        
        return jsonify({
            "detected": True,
            "confidence": float(detection.score[0]),
            "bounding_box": {
                "x": float(bbox.xmin),
                "y": float(bbox.ymin),
                "width": float(bbox.width),
                "height": float(bbox.height)
            },
            "image_path": f"/static/uploads/{filename}"
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============================================
# ROUTE 2: Generate Face Mesh (MediaPipe)
# ============================================

@avatar_api.route('/api/generate-face-mesh', methods=['POST'])
def generate_face_mesh():
    """
    Generate a 3D face mesh from image using MediaPipe
    Returns a GLB file with 468 facial landmarks
    """
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    image = request.files['image']
    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)
    
    try:
        # Read image
        img = cv2.imread(filepath)
        h, w, _ = img.shape
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Process with face mesh
        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        ) as face_mesh:
            results = face_mesh.process(img_rgb)
        
        if not results.multi_face_landmarks:
            return jsonify({"error": "No face landmarks detected"}), 400
        
        # Extract vertices
        landmarks = results.multi_face_landmarks[0]
        vertices = []
        for lm in landmarks.landmark:
            x = lm.x * w
            y = lm.y * h
            z = lm.z * 100  # Scale depth
            vertices.append([x, -y, -z])  # Flip for correct orientation
        
        vertices = np.array(vertices)
        
        # Create faces from MediaPipe tesselation
        from mediapipe.python.solutions.face_mesh_connections import FACEMESH_TESSELATION
        
        # Convert tesselation connections to triangles
        edges = list(FACEMESH_TESSELATION)
        faces = []
        
        # Simple triangulation based on edge connectivity
        for i in range(len(edges) - 2):
            e1 = edges[i]
            e2 = edges[i + 1]
            
            # Check if they share a vertex
            shared = set(e1) & set(e2)
            if shared:
                all_verts = list(set(e1) | set(e2))
                if len(all_verts) == 3:
                    faces.append(all_verts)
        
        # Create mesh
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        
        # Export
        output_filename = f"{os.path.splitext(filename)[0]}_facemesh.glb"
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        mesh.export(output_path)
        
        return jsonify({
            "success": True,
            "face_mesh_url": f"/static/uploads/{output_filename}",
            "vertices_count": len(vertices),
            "faces_count": len(faces)
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================
# ROUTE 3: Generate 3D Avatar (Full Pipeline)
# ============================================

@avatar_api.route('/api/generate-avatar', methods=['POST'])
def generate_avatar():
    """
    Generate 3D avatar from selfie
    Uses selfie_to_avatar if available, falls back to face mesh
    """
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    image = request.files['image']
    quality = request.form.get('quality', 'medium')
    
    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)
    
    try:
        # Try to use the full pipeline
        try:
            from api.utils.selfie_to_avatar import selfie_to_avatar
            
            print(f"Starting avatar generation for {filename} (quality: {quality})")
            
            results = selfie_to_avatar(
                input_path=filepath,
                output_dir=UPLOAD_FOLDER,
                quality=quality
            )
            
            if results["status"] == "error":
                raise Exception(results.get("error", "Pipeline failed"))
            
            avatar_glb = results.get("avatar_glb")
            if avatar_glb:
                avatar_url = f"/static/uploads/{os.path.basename(avatar_glb)}"
                return jsonify({
                    "success": True,
                    "avatar_model_url": avatar_url,
                    "depth_map_url": f"/static/uploads/{os.path.basename(results.get('depth_map', ''))}",
                    "status": results["status"]
                })
                
        except ImportError as e:
            print(f"Full pipeline not available: {e}, falling back to face mesh")
        
        # Fallback: Use MediaPipe face mesh
        img = cv2.imread(filepath)
        h, w, _ = img.shape
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        ) as face_mesh:
            results = face_mesh.process(img_rgb)
        
        if not results.multi_face_landmarks:
            return jsonify({"error": "No face landmarks detected"}), 400
        
        # Extract vertices
        landmarks = results.multi_face_landmarks[0]
        vertices = np.array([[lm.x * w, -lm.y * h, -lm.z * 100] for lm in landmarks.landmark])
        
        # Create faces
        from mediapipe.python.solutions.face_mesh_connections import FACEMESH_TESSELATION
        edges = list(FACEMESH_TESSELATION)
        faces = []
        for i in range(len(edges) - 2):
            e1, e2 = edges[i], edges[i + 1]
            shared = set(e1) & set(e2)
            if shared:
                all_verts = list(set(e1) | set(e2))
                if len(all_verts) == 3:
                    faces.append(all_verts)
        
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        
        output_filename = f"{os.path.splitext(filename)[0]}_avatar.glb"
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        mesh.export(output_path)
        
        return jsonify({
            "success": True,
            "avatar_model_url": f"/static/uploads/{output_filename}",
            "status": "success",
            "method": "face_mesh_fallback"
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================
# ROUTE 4: Generate Full Body Avatar
# ============================================

@avatar_api.route('/api/generate-full-avatar', methods=['POST'])
def generate_full_avatar():
    """
    Generate full body avatar
    """
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400
    
    image = request.files['image']
    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)
    
    try:
        # First generate face mesh
        img = cv2.imread(filepath)
        h, w, _ = img.shape
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        ) as face_mesh:
            results = face_mesh.process(img_rgb)
        
        if not results.multi_face_landmarks:
            return jsonify({"error": "No face detected"}), 400
        
        # Create face mesh
        landmarks = results.multi_face_landmarks[0]
        face_vertices = np.array([[lm.x * w, -lm.y * h, -lm.z * 100] for lm in landmarks.landmark])
        
        from mediapipe.python.solutions.face_mesh_connections import FACEMESH_TESSELATION
        edges = list(FACEMESH_TESSELATION)
        face_faces = []
        for i in range(len(edges) - 2):
            e1, e2 = edges[i], edges[i + 1]
            shared = set(e1) & set(e2)
            if shared:
                all_verts = list(set(e1) | set(e2))
                if len(all_verts) == 3:
                    face_faces.append(all_verts)
        
        face_mesh_obj = trimesh.Trimesh(vertices=face_vertices, faces=face_faces)
        
        # Create simple body
        body = create_simple_body()
        
        # Position face on body
        face_center = face_mesh_obj.centroid
        body_bounds = body.bounds
        head_position = [
            (body_bounds[0][0] + body_bounds[1][0]) / 2,
            body_bounds[1][1] - 0.05,
            (body_bounds[0][2] + body_bounds[1][2]) / 2
        ]
        
        # Scale and position face
        face_height = face_mesh_obj.bounds[1][1] - face_mesh_obj.bounds[0][1]
        target_height = 0.15
        scale = target_height / face_height if face_height > 0 else 1
        
        face_mesh_obj.apply_scale(scale)
        face_mesh_obj.apply_translation(np.array(head_position) - face_mesh_obj.centroid)
        
        # Combine
        combined = trimesh.util.concatenate([body, face_mesh_obj])
        
        output_filename = f"{os.path.splitext(filename)[0]}_fullbody.glb"
        output_path = os.path.join(UPLOAD_FOLDER, output_filename)
        combined.export(output_path)
        
        # Generate bone positions
        bones = generate_bone_positions(combined)
        
        return jsonify({
            "success": True,
            "avatar_url": f"/static/uploads/{output_filename}",
            "bones": bones
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================
# ROUTE 5: Export Avatar
# ============================================

@avatar_api.route('/api/export-avatar', methods=['POST'])
def export_avatar():
    """Export avatar in various formats"""
    data = request.json or {}
    
    avatar_path = data.get('avatar_path') or data.get('avatarModel')
    export_format = data.get('format') or data.get('fileType', 'glb')
    rigging_preset = data.get('rigging_preset') or data.get('riggingPreset', 'unity')
    
    if not avatar_path:
        return jsonify({"error": "No avatar path provided"}), 400
    
    # Handle relative paths
    if avatar_path.startswith('/static/'):
        avatar_path = avatar_path[1:]
    
    if not os.path.exists(avatar_path):
        avatar_path = os.path.join('static', 'uploads', os.path.basename(avatar_path))
    
    if not os.path.exists(avatar_path):
        return jsonify({"error": f"Avatar file not found: {avatar_path}"}), 404
    
    try:
        mesh = trimesh.load(avatar_path)
        
        base_name = os.path.splitext(os.path.basename(avatar_path))[0]
        output_filename = f"{base_name}_{rigging_preset}.{export_format}"
        output_path = os.path.join(EXPORT_FOLDER, output_filename)
        
        os.makedirs(EXPORT_FOLDER, exist_ok=True)
        
        if export_format.lower() in ['glb', 'gltf', 'obj']:
            mesh.export(output_path, file_type=export_format.lower())
        else:
            mesh.export(output_path)
        
        return send_file(
            output_path,
            as_attachment=True,
            download_name=output_filename
        )
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ============================================
# HELPER FUNCTIONS
# ============================================

def create_simple_body():
    """Create a simple humanoid body"""
    # Torso
    torso = trimesh.creation.box(extents=[0.4, 0.6, 0.2])
    torso.apply_translation([0, 0.8, 0])
    
    # Arms
    left_arm = trimesh.creation.cylinder(radius=0.05, height=0.5)
    left_arm.apply_translation([-0.35, 0.9, 0])
    
    right_arm = trimesh.creation.cylinder(radius=0.05, height=0.5)
    right_arm.apply_translation([0.35, 0.9, 0])
    
    # Legs
    left_leg = trimesh.creation.cylinder(radius=0.07, height=0.8)
    left_leg.apply_translation([-0.12, 0.2, 0])
    
    right_leg = trimesh.creation.cylinder(radius=0.07, height=0.8)
    right_leg.apply_translation([0.12, 0.2, 0])
    
    return trimesh.util.concatenate([torso, left_arm, right_arm, left_leg, right_leg])


def generate_bone_positions(mesh):
    """Generate bone positions for rigging"""
    bounds = mesh.bounds
    height = bounds[1][1] - bounds[0][1]
    center_x = (bounds[0][0] + bounds[1][0]) / 2
    center_z = (bounds[0][2] + bounds[1][2]) / 2
    base_y = bounds[0][1]
    
    return {
        "Hips": [center_x, base_y + height * 0.5, center_z],
        "Spine": [center_x, base_y + height * 0.55, center_z],
        "Chest": [center_x, base_y + height * 0.70, center_z],
        "Neck": [center_x, base_y + height * 0.82, center_z],
        "Head": [center_x, base_y + height * 0.90, center_z],
        "LeftArm": [center_x - height * 0.15, base_y + height * 0.75, center_z],
        "RightArm": [center_x + height * 0.15, base_y + height * 0.75, center_z],
        "LeftLeg": [center_x - height * 0.06, base_y + height * 0.28, center_z],
        "RightLeg": [center_x + height * 0.06, base_y + height * 0.28, center_z],
    }


# ============================================
# HEALTH CHECK
# ============================================

@avatar_api.route('/api/avatar-health', methods=['GET'])
def avatar_health():
    """Health check"""
    return jsonify({
        "status": "healthy",
        "services": {
            "face_detection": True,
            "face_mesh": True,
            "mesh_generation": True,
            "export": True
        }
    })


# ============================================
# REGISTER BLUEPRINT
# ============================================

def register_avatar_routes(app):
    """Register avatar routes with Flask app"""
    app.register_blueprint(avatar_api)
    print("✅ Avatar API routes registered")