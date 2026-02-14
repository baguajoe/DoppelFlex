# pyright: reportMissingImports=false

# api/routes.py
# ═══════════════════════════════════════════════════════════════
#  FIXES APPLIED:
#  [FIX-1] upload-video moved from @app.route → @api.route
#  [FIX-2] Duplicate process-pose route removed (kept JSON version)
#  [FIX-3] Added /save-dance-session
#  [FIX-4] Added /account-info, /update-email, /update-password (JWT-protected)
#  [FIX-5] Added /save-mocap-session
#  [FIX-6] Added /generate-full-avatar
#  [FIX-7] Fixed /api/usage double-prefix → /usage
#  [FIX-8] Renamed process_pose() video helper → process_video_pose()
#  [FIX-9] Removed stale `app = Flask(__name__)` (not needed in blueprint)
#  [FIX-10] Removed duplicate non-JWT account routes (kept JWT versions only)
# ═══════════════════════════════════════════════════════════════

from flask import request, jsonify, Blueprint, Response, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity, create_access_token
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash
from flask_cors import CORS
import os
import subprocess
import requests
import json
import uuid
import trimesh
import stripe
import logging
import tempfile
import librosa
import cv2
import mediapipe as mp
import numpy as np

from moviepy.editor import AudioFileClip, VideoFileClip, ImageSequenceClip
from flask import send_file
from uuid import uuid4
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from api.models import (
    db, Avatar, Customization, RiggedAvatar, User, UserUsage,
    MotionCaptureSession, MotionAudioSync, MotionSession, FBXExporter,
    SavedOutfit, Outfit, AvatarPreset
)
from api.utils.process_pose_video import process_and_save_pose
from api.utils.rigging import external_rigging_tool
from api.utils.skeleton_builder import create_default_skeleton
from api.utils.selfie_to_depth import selfie_to_avatar
from api.utils.avatar_merge import merge_head_and_body
from api.utils.multi_view_to_mesh import generate_mesh_from_views
from api.utils.video import generate_frame_images


# ── Blueprint setup ──
api = Blueprint('api', __name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

STRIPE_PRICE_IDS = {
    "Basic": "price_123_basic",
    "Pro": "price_456_pro",
    "Premium": "price_789_premium"
}

# MediaPipe setup
mp_face_detection = mp.solutions.face_detection
face_detection = mp_face_detection.FaceDetection(min_detection_confidence=0.5)
mp_drawing = mp.solutions.drawing_utils
mp_pose = mp.solutions.pose
pose_detector = mp_pose.Pose()

UPLOAD_FOLDER = os.path.join("static", "uploads")
OUTPUT_FOLDER = "static/exports"
EXPORT_FOLDER = "static/exports"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

DEEP3D_API_URL = "https://api.deep3d.com/generate-avatar"
DEEP3D_API_KEY = os.getenv("DEEP3D_API_KEY")

CORS(api)

PLAN_LIMITS = {
    "Basic": 5,
    "Pro": 20,
    "Premium": float("inf")
}

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def process_video_pose(video_path):
    """Process a video file and extract pose landmarks frame-by-frame."""
    cap = cv2.VideoCapture(video_path)
    pose_data = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose_detector.process(rgb_frame)

        if results.pose_landmarks:
            pose_landmarks = [
                (lm.x, lm.y, lm.z)
                for lm in results.pose_landmarks.landmark
            ]
            pose_data.append(pose_landmarks)

    cap.release()

    if pose_data:
        pose_data_file = f"pose_data_{uuid4().hex[:8]}.json"
        with open(os.path.join(UPLOAD_FOLDER, pose_data_file), 'w') as f:
            json.dump(pose_data, f)
        return pose_data_file

    return None


def send_to_deep3d(filepath):
    """Send the uploaded selfie to Deep3D API to generate the 3D avatar."""
    try:
        with open(filepath, 'rb') as image_file:
            files = {'image': image_file}
            headers = {"Authorization": f"Bearer {DEEP3D_API_KEY}"}
            response = requests.post(DEEP3D_API_URL, files=files, headers=headers)

        response.raise_for_status()
        data = response.json()
        return data.get("avatar_url")
    except Exception as e:
        print(f"[Deep3D Error] {e}")
        return None


# ═══════════════════════════════════════════════════════════════
#  AUTH ROUTES
# ═══════════════════════════════════════════════════════════════

@api.route("/signup", methods=["POST"])
def signup():
    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if not username or not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({"error": "User already exists"}), 409

    hashed_password = generate_password_hash(password)
    new_user = User(username=username, email=email, password_hash=hashed_password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"message": "User created successfully"}), 201


@api.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing email or password"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401

    # Generate a REAL JWT token (not a UUID)
    access_token = create_access_token(identity=str(user.id))

    return jsonify({
        "message": "Login successful",
        "user_id": user.id,
        "username": user.username,
        "token": access_token
    }), 200


@api.route("/authenticate", methods=["GET"])
@jwt_required()
def authenticate():
    """Verify the JWT token is still valid. Called by flux.js on page load."""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "authenticated": True,
        "user_id": user.id,
        "username": user.username,
        "email": user.email,
    }), 200


@api.route("/account-info", methods=["GET"])
@jwt_required()
def account_info():
    """Get current user's account info for the settings page."""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "email": user.email,
        "username": user.username,
        "plan": getattr(user, 'subscription_plan', 'Basic'),
    }), 200


@api.route("/update-email", methods=["POST"])
@jwt_required()
def update_email():
    """Update the current user's email."""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    new_email = data.get("email")
    if not new_email:
        return jsonify({"error": "Email is required"}), 400

    existing = User.query.filter_by(email=new_email).first()
    if existing and existing.id != user.id:
        return jsonify({"error": "Email already in use"}), 409

    user.email = new_email
    db.session.commit()
    return jsonify({"message": "Email updated successfully"}), 200


@api.route("/update-password", methods=["POST"])
@jwt_required()
def update_password():
    """Update the current user's password."""
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    current_password = data.get("current_password")
    new_password = data.get("new_password")

    if not current_password or not new_password:
        return jsonify({"error": "Both current and new password are required"}), 400

    if not check_password_hash(user.password_hash, current_password):
        return jsonify({"error": "Current password is incorrect"}), 401

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({"message": "Password updated successfully"}), 200


# ═══════════════════════════════════════════════════════════════
#  AVATAR ROUTES
# ═══════════════════════════════════════════════════════════════

@api.route("/create-avatar", methods=["POST"])
def create_avatar():
    image = request.files.get("image")
    user_id = request.form.get("user_id")

    if not image or not user_id:
        return jsonify({"error": "Missing image or user ID"}), 400

    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)

    try:
        img = cv2.imread(filepath)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = face_detection.process(img_rgb)

        if not results.detections:
            os.remove(filepath)
            return jsonify({"error": "No face detected in the image."}), 400

        ply_path = selfie_to_avatar(filepath, output_path=EXPORT_FOLDER)
        if not ply_path or not os.path.exists(ply_path):
            return jsonify({"error": "3D mesh generation failed."}), 500

        mesh = trimesh.load(ply_path)
        glb_filename = os.path.splitext(os.path.basename(ply_path))[0] + ".glb"
        glb_path = os.path.join(EXPORT_FOLDER, glb_filename)
        mesh.export(glb_path, file_type="glb")

        if not os.path.exists(glb_path):
            return jsonify({"error": "GLB conversion failed."}), 500

        avatar_url = f"/static/exports/{glb_filename}"
        avatar = Avatar(user_id=user_id, avatar_url=avatar_url, filename=glb_filename)
        db.session.add(avatar)
        db.session.commit()

        return jsonify({
            "avatar_url": avatar_url,
            "avatar_id": avatar.id,
            "ply_url": f"/static/exports/{os.path.basename(ply_path)}",
        }), 200

    except Exception as e:
        print(f"[create-avatar] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api.route("/generate-avatar", methods=["POST"])
def generate_avatar():
    """Generate face mesh from selfie (Step 2 of UploadPage pipeline)."""
    try:
        import pyvista as pv
        import scipy.spatial as sp
    except ImportError as e:
        return jsonify({"error": f"Server missing required library: {str(e)}"}), 500

    image = request.files.get("image")
    if not image:
        return jsonify({"error": "No image uploaded"}), 400

    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)

    try:
        mp_face_mesh = mp.solutions.face_mesh
        face_mesh = mp_face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1)

        img = cv2.imread(filepath)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(img_rgb)

        if not results.multi_face_landmarks:
            return jsonify({"error": "No face landmarks detected"}), 400

        landmarks = results.multi_face_landmarks[0]
        points = np.array([(lm.x, lm.y, lm.z) for lm in landmarks.landmark])

        cloud = pv.PolyData(points)
        mesh = cloud.delaunay_2d()

        glb_filename = f"face_mesh_{uuid4().hex[:8]}.glb"
        glb_path = os.path.join(EXPORT_FOLDER, glb_filename)

        tri_mesh = trimesh.Trimesh(
            vertices=np.array(mesh.points),
            faces=np.array(mesh.faces).reshape(-1, 4)[:, 1:]
        )
        tri_mesh.export(glb_path, file_type="glb")

        return jsonify({
            "avatar_model_url": f"/static/exports/{glb_filename}"
        }), 200

    except Exception as e:
        print(f"[generate-avatar] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api.route("/generate-full-avatar", methods=["POST"])
def generate_full_avatar():
    """Generate a full-body avatar from a selfie image."""
    image = request.files.get("image")
    if not image:
        return jsonify({"error": "No image uploaded"}), 400

    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)

    try:
        output_path = selfie_to_avatar(filepath, output_path=EXPORT_FOLDER)

        if not output_path or not os.path.exists(output_path):
            return jsonify({"error": "Full avatar generation failed"}), 500

        if output_path.endswith(".ply"):
            mesh = trimesh.load(output_path)
            glb_filename = os.path.splitext(os.path.basename(output_path))[0] + ".glb"
            glb_path = os.path.join(EXPORT_FOLDER, glb_filename)
            mesh.export(glb_path, file_type="glb")
            output_path = glb_path

        return send_file(output_path, mimetype="model/gltf-binary", as_attachment=True,
                         download_name="full_avatar.glb")

    except Exception as e:
        print(f"[generate-full-avatar] Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api.route("/save-avatar", methods=["POST"])
def save_avatar():
    data = request.json
    avatar_id = data.get("avatar_id")
    customization_data = data.get("customization")

    if not avatar_id or not customization_data:
        return jsonify({"error": "Missing data"}), 400

    existing = Customization.query.filter_by(avatar_id=avatar_id).first()
    if existing:
        existing.skin_color = customization_data.get("skin_color")
        existing.outfit_color = customization_data.get("outfit_color")
        existing.accessories = customization_data.get("accessories")
    else:
        new_custom = Customization(
            avatar_id=avatar_id,
            skin_color=customization_data.get("skin_color"),
            outfit_color=customization_data.get("outfit_color"),
            accessories=customization_data.get("accessories")
        )
        db.session.add(new_custom)

    db.session.commit()
    return jsonify({"message": "Customization saved"}), 200


@api.route("/save-avatar-preset", methods=["POST"])
def save_avatar_preset():
    try:
        data = request.get_json()
        new_preset = AvatarPreset(
            user_id=data["user_id"],
            height=data["height"],
            weight=data["weight"],
            skin_color=data["skin_color"],
            outfit_color=data["outfit_color"],
            accessories=data["accessories"]
        )
        db.session.add(new_preset)
        db.session.commit()
        return jsonify({"message": "Preset saved successfully!"}), 200
    except Exception as e:
        print("[ERROR]", e)
        return jsonify({"error": "Failed to save preset"}), 500


@api.route("/delete-avatar/<int:avatar_id>", methods=["DELETE"])
def delete_avatar(avatar_id):
    avatar = Avatar.query.get(avatar_id)
    if not avatar:
        return jsonify({"error": "Avatar not found"}), 404
    db.session.delete(avatar)
    db.session.commit()
    return jsonify({"message": "Avatar deleted"}), 200


@api.route("/get-avatar/<int:user_id>", methods=["GET"])
def get_avatar(user_id):
    avatar = Avatar.query.filter_by(user_id=user_id).order_by(Avatar.created_at.desc()).first()
    if not avatar:
        return jsonify({"error": "No avatar found"}), 404

    customization = Customization.query.filter_by(avatar_id=avatar.id).first()
    return jsonify({
        "avatar_url": avatar.avatar_url,
        "customization": {
            "skin_color": customization.skin_color if customization else None,
            "outfit_color": customization.outfit_color if customization else None,
            "accessories": customization.accessories if customization else None
        }
    }), 200


@api.route('/save-avatar-customization', methods=['POST'])
@jwt_required()
def save_avatar_customization():
    user_id = get_jwt_identity()
    data = request.get_json()

    new_avatar = Avatar(
        user_id=user_id,
        skin_color=data.get('skin_color'),
        outfit_color=data.get('outfit_color'),
        height=data.get('height'),
        weight=data.get('weight'),
        accessories=data.get('accessories'),
        model_url=data.get('model_url'),
        selfie_url=data.get('selfie_url')
    )
    db.session.add(new_avatar)
    db.session.commit()

    return jsonify({"message": "Avatar customization saved", "avatar_id": new_avatar.id}), 200


# ═══════════════════════════════════════════════════════════════
#  AUDIO / BEAT ANALYSIS
# ═══════════════════════════════════════════════════════════════

@api.route('/analyze-beats', methods=['POST'])
def analyze_beats():
    file = request.files.get("audio")
    if not file:
        return jsonify({"error": "No audio file provided"}), 400

    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        file.save(temp_file.name)
        y, sr = librosa.load(temp_file.name)
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    return jsonify({"tempo": tempo, "beat_times": beat_times}), 200


@api.route("/analyze-voice", methods=["POST"])
def analyze_voice():
    audio = request.files.get("audio")
    if not audio:
        return jsonify({"error": "No audio uploaded"}), 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        audio.save(temp_file.name)
        y, sr = librosa.load(temp_file.name)
        duration = librosa.get_duration(y=y, sr=sr)

        mock_visemes = [
            {"time": 0.0, "viseme": "A"},
            {"time": 0.3, "viseme": "E"},
            {"time": 0.5, "viseme": "O"},
            {"time": 0.8, "viseme": "M"}
        ]

        return jsonify({"duration": duration, "visemes": mock_visemes}), 200


# ═══════════════════════════════════════════════════════════════
#  POSE / MOTION CAPTURE
# ═══════════════════════════════════════════════════════════════

@api.route('/process-pose', methods=['POST'])
def process_pose():
    """Accept pose landmarks from frontend MediaPipe and echo them back."""
    pose_data = request.json.get('pose_data')
    if not pose_data:
        return jsonify({"error": "No pose_data provided"}), 400
    return jsonify({"pose_landmarks": pose_data}), 200


@api.route('/upload-video', methods=['POST'])
def upload_video():
    """Upload a video file, extract pose data frame-by-frame, return JSON."""
    video = request.files.get("video")
    if not video:
        return jsonify({"error": "No video file provided"}), 400

    filename = secure_filename(video.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    video.save(filepath)

    pose_data_file = process_video_pose(filepath)

    if pose_data_file:
        return jsonify({
            "message": "Video processed successfully",
            "pose_data_file": pose_data_file,
            "video_url": f"/static/uploads/{filename}"
        }), 200
    else:
        return jsonify({"error": "Pose processing failed — no landmarks detected"}), 500


# ═══════════════════════════════════════════════════════════════
#  MOTION SESSIONS
# ═══════════════════════════════════════════════════════════════

@api.route("/save-motion-session", methods=["POST"])
def save_motion_session():
    data = request.json
    user_id = data.get("user_id")
    session_name = data.get("session_name")
    frames = data.get("frames")

    session = MotionSession(user_id=user_id, session_name=session_name, data=frames)
    db.session.add(session)
    db.session.commit()
    return jsonify({"message": "Motion session saved", "id": session.id})


@api.route("/save-mocap-session", methods=["POST"])
def save_mocap_session():
    """Save raw landmark data from live motion capture recording."""
    data = request.json
    user_id = data.get("user_id")
    landmarks = data.get("landmarks")

    if not user_id or not landmarks:
        return jsonify({"error": "Missing user_id or landmarks"}), 400

    pose_filename = f"mocap_{uuid4().hex[:8]}.json"
    pose_filepath = os.path.join(UPLOAD_FOLDER, pose_filename)

    with open(pose_filepath, 'w') as f:
        json.dump(landmarks, f)

    session = MotionCaptureSession(
        user_id=user_id,
        pose_data_url=f"/static/uploads/{pose_filename}",
        source_type="live_webcam",
        created_at=datetime.utcnow()
    )
    db.session.add(session)
    db.session.commit()

    return jsonify({
        "message": "MoCap session saved",
        "id": session.id,
        "pose_data_url": f"/static/uploads/{pose_filename}"
    }), 200


@api.route("/save-dance-session", methods=["POST"])
def save_dance_session():
    """Save a complete dance sync session: song, tempo, beats, style, video."""
    data = request.json
    user_id = data.get("user_id")
    song_name = data.get("song_name", "Untitled")
    tempo = data.get("tempo")
    beat_times = data.get("beat_times", [])
    style = data.get("style", "bounce")
    video_url = data.get("video_url")

    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    sync = MotionAudioSync(
        user_id=user_id,
        audio_filename=song_name,
        beat_timestamps=beat_times,
        created_at=datetime.utcnow()
    )
    db.session.add(sync)
    db.session.commit()

    return jsonify({
        "message": "Dance session saved",
        "id": sync.id,
        "song": song_name,
        "tempo": tempo,
        "beats": len(beat_times),
        "style": style,
    }), 200


@api.route("/motion-sessions/<int:user_id>", methods=["GET"])
def get_motion_sessions(user_id):
    motion_sessions = MotionSession.query.filter_by(user_id=user_id).all()
    motion_capture_sessions = MotionCaptureSession.query.filter_by(user_id=user_id).all()

    all_sessions = []

    all_sessions.extend([{
        "id": s.id,
        "name": s.session_name,
        "source_type": "recorded",
        "created_at": s.created_at.isoformat()
    } for s in motion_sessions])

    all_sessions.extend([{
        "id": s.id,
        "avatar_id": s.avatar_id,
        "pose_data_url": s.pose_data_url,
        "source_type": s.source_type,
        "created_at": s.created_at.isoformat()
    } for s in motion_capture_sessions])

    return jsonify(all_sessions)


@api.route("/get-saved-sessions/<int:user_id>", methods=["GET"])
def get_saved_sessions(user_id):
    sessions = MotionSession.query.filter_by(user_id=user_id).order_by(MotionSession.created_at.desc()).all()
    return jsonify([
        {
            "id": s.id,
            "name": s.session_name,
            "created_at": s.created_at.isoformat(),
        } for s in sessions
    ])


@api.route("/get-user-sessions/<int:user_id>", methods=["GET"])
def get_user_sessions(user_id):
    """Alias used by ProfilePage."""
    return get_saved_sessions(user_id)


@api.route("/update-session-links", methods=["POST"])
def update_session_links():
    data = request.json
    session_id = data.get("session_id")
    rigged_avatar_id = data.get("rigged_avatar_id")
    audio_filename = data.get("audio_filename")
    beat_timestamps = data.get("beat_timestamps")

    session = MotionCaptureSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    session.rigged_avatar_id = rigged_avatar_id
    session.audio_filename = audio_filename
    session.beat_timestamps = beat_timestamps

    db.session.commit()
    return jsonify({"message": "Session updated with audio and rig links"}), 200


@api.route('/delete-session/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    session = MotionSession.query.get(session_id)
    if session:
        db.session.delete(session)
        db.session.commit()
        return jsonify({'message': 'Deleted'}), 200
    return jsonify({'error': 'Not found'}), 404


# ═══════════════════════════════════════════════════════════════
#  BEAT MAP / AUDIO SYNC
# ═══════════════════════════════════════════════════════════════

@api.route("/save-beat-map", methods=["POST"])
def save_beat_map():
    if request.content_type and request.content_type.startswith("application/json"):
        data = request.get_json()
        user_id = data.get("user_id")
        avatar_id = data.get("avatar_id")
        audio_filename = data.get("audio_filename")
        beat_timestamps = data.get("beat_timestamps")

        if not all([user_id, audio_filename, beat_timestamps]):
            return jsonify({"error": "Missing required fields"}), 400

    elif request.content_type and request.content_type.startswith("multipart/form-data"):
        audio = request.files.get("audio")
        song_name = request.form.get("song_name")
        beat_timestamps = request.form.get("beat_times", "[]")
        user_id = request.form.get("user_id", None)

        if not audio or not song_name:
            return jsonify({"error": "Missing song name or audio file"}), 400

        filename = secure_filename(audio.filename)
        filepath = os.path.join("static", "uploads", filename)
        audio.save(filepath)

        audio_filename = filename
        avatar_id = None
        try:
            beat_timestamps = json.loads(beat_timestamps)
        except Exception:
            return jsonify({"error": "Invalid beat_times format"}), 400
    else:
        return jsonify({"error": "Unsupported Content-Type"}), 415

    beat_map = MotionAudioSync(
        user_id=user_id,
        avatar_id=avatar_id,
        audio_filename=audio_filename,
        beat_timestamps=beat_timestamps,
        created_at=datetime.utcnow()
    )
    db.session.add(beat_map)
    db.session.commit()

    return jsonify({"message": "Beat map saved", "id": beat_map.id}), 201


@api.route("/get-beat-map/<int:user_id>", methods=["GET"])
def get_beat_maps(user_id):
    beat_maps = MotionAudioSync.query.filter_by(user_id=user_id).all()
    return jsonify([
        {
            "id": b.id,
            "audio_filename": b.audio_filename,
            "avatar_id": b.avatar_id,
            "beat_timestamps": b.beat_timestamps,
            "created_at": b.created_at.isoformat()
        }
        for b in beat_maps
    ]), 200


@api.route("/beat-map/<int:beat_map_id>", methods=["DELETE"])
def delete_beat_map(beat_map_id):
    beat_map = MotionAudioSync.query.get(beat_map_id)
    if not beat_map:
        return jsonify({"error": "Beat map not found"}), 404
    db.session.delete(beat_map)
    db.session.commit()
    return jsonify({"message": "Beat map deleted successfully"}), 200


@api.route("/beat-map/<int:beat_map_id>", methods=["PUT"])
def update_beat_map(beat_map_id):
    beat_map = MotionAudioSync.query.get(beat_map_id)
    if not beat_map:
        return jsonify({"error": "Beat map not found"}), 404

    data = request.json
    beat_timestamps = data.get("beat_timestamps")
    if not beat_timestamps:
        return jsonify({"error": "Missing beat_timestamps"}), 400

    beat_map.beat_timestamps = beat_timestamps
    db.session.commit()
    return jsonify({"message": "Beat map updated"}), 200


@api.route("/audio-sync", methods=["POST"])
def save_audio_sync():
    data = request.json
    user_id = data.get("user_id")
    avatar_id = data.get("avatar_id")
    audio_filename = data.get("audio_filename")
    beat_timestamps = data.get("beat_timestamps")
    custom_notes = data.get("custom_notes")

    if not user_id or not audio_filename or not beat_timestamps:
        return jsonify({"error": "Missing required fields"}), 400

    sync = MotionAudioSync(
        user_id=user_id,
        avatar_id=avatar_id,
        audio_filename=audio_filename,
        beat_timestamps=beat_timestamps,
        custom_notes=custom_notes,
    )
    db.session.add(sync)
    db.session.commit()
    return jsonify({"message": "Audio sync saved", "id": sync.id}), 200


@api.route("/audio-sync/<int:user_id>", methods=["GET"])
def get_audio_syncs(user_id):
    syncs = MotionAudioSync.query.filter_by(user_id=user_id).all()
    return jsonify([
        {
            "id": s.id,
            "audio_filename": s.audio_filename,
            "beat_timestamps": s.beat_timestamps,
            "custom_notes": s.custom_notes,
        } for s in syncs
    ])


@api.route("/save-beat-timestamps", methods=["POST"])
def save_beat_timestamps():
    data = request.json
    user_id = data.get("user_id")
    song_name = data.get("song_name")
    beat_times = data.get("beat_times")

    if not user_id or not song_name or not beat_times:
        return jsonify({"error": "Missing fields"}), 400

    beat = MotionAudioSync(
        user_id=user_id,
        song_name=song_name,
        beat_timestamps=beat_times,
        created_at=datetime.utcnow()
    )
    db.session.add(beat)
    db.session.commit()
    return jsonify({"message": "Beat timestamps saved", "id": beat.id})


# ═══════════════════════════════════════════════════════════════
#  VIDEO CONVERSION
# ═══════════════════════════════════════════════════════════════

@api.route("/convert-to-mp4", methods=["POST"])
def convert_to_mp4():
    data = request.get_json()
    video_file = data.get("filename")
    if not video_file:
        return jsonify({"error": "Missing filename"}), 400

    input_path = os.path.join("static", "uploads", video_file)
    output_filename = video_file.replace(".webm", ".mp4")
    output_path = os.path.join("static", "exports", output_filename)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    command = ["ffmpeg", "-y", "-i", input_path, "-c:v", "libx264",
               "-preset", "fast", "-crf", "23", output_path]

    try:
        subprocess.run(command, check=True)
        return jsonify({
            "message": "Conversion successful",
            "mp4_url": f"/static/exports/{output_filename}"
        }), 200
    except subprocess.CalledProcessError as e:
        return jsonify({"error": str(e)}), 500


@api.route("/convert-to-avi", methods=["POST"])
def convert_to_avi():
    video_file = request.json.get("filename")
    if not video_file:
        return jsonify({"error": "Missing filename"}), 400

    video_path = os.path.join(UPLOAD_FOLDER, video_file)
    avi_filename = video_file.replace(".webm", ".avi")
    avi_path = os.path.join(UPLOAD_FOLDER, avi_filename)

    command = ["ffmpeg", "-y", "-i", video_path, "-c:v", "libx264",
               "-preset", "fast", "-crf", "23", avi_path]

    try:
        subprocess.run(command, check=True)
        return jsonify({"avi_url": f"/static/uploads/{avi_filename}"}), 200
    except subprocess.CalledProcessError as e:
        return jsonify({"error": str(e)}), 500


@api.route("/convert-to-mov", methods=["POST"])
def convert_to_mov():
    video_file = request.json.get("filename")
    if not video_file:
        return jsonify({"error": "Missing filename"}), 400

    video_path = os.path.join(UPLOAD_FOLDER, video_file)
    mov_filename = video_file.replace(".webm", ".mov")
    mov_path = os.path.join(UPLOAD_FOLDER, mov_filename)

    command = ["ffmpeg", "-y", "-i", video_path, "-c:v", "prores_ks", mov_path]

    try:
        subprocess.run(command, check=True)
        return jsonify({"mov_url": f"/static/uploads/{mov_filename}"}), 200
    except subprocess.CalledProcessError as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════
#  VIDEO EXPORT
# ═══════════════════════════════════════════════════════════════

@api.route("/export-video", methods=["POST"])
def export_video():
    data = request.json
    output_path = "static/exports/animation.mp4"
    return send_file(output_path, as_attachment=True)


@api.route("/export-mp4", methods=["POST"])
def export_mp4():
    data = request.get_json()
    frames = data.get("frames")
    audio_path = data.get("audio_path")

    image_paths = generate_frame_images(frames)
    audio_clip = AudioFileClip(audio_path)
    video = ImageSequenceClip(image_paths, fps=30).set_audio(audio_clip)
    video_path = f"static/exports/session_{uuid4()}.mp4"
    video.write_videofile(video_path, codec="libx264", audio_codec="aac")

    return send_file(video_path, as_attachment=True)


@api.route("/save-fx-timeline", methods=["POST"])
def save_fx_timeline():
    data = request.get_json()
    session_id = data.get("session_id")
    fx_timeline = data.get("fx_timeline")

    session = MotionSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    session.fx_timeline = fx_timeline
    db.session.commit()
    return jsonify({"message": "FX timeline saved successfully"}), 200


# ═══════════════════════════════════════════════════════════════
#  RIGGING
# ═══════════════════════════════════════════════════════════════

@api.route("/rig-avatar", methods=["POST"])
def rig_avatar():
    avatar_id = request.json.get("avatar_id")
    user_id = request.json.get("user_id")

    if not avatar_id or not user_id:
        return jsonify({"error": "Missing avatar_id or user_id"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user_usage = UserUsage.query.filter_by(user_id=user_id).first()
    if not user_usage:
        user_usage = UserUsage(user_id=user_id, rigging_sessions=0)

    plan = user.subscription_plan
    limit = PLAN_LIMITS.get(plan, 5)

    if user_usage.rigging_sessions >= limit:
        return jsonify({
            "error": "Rigging limit reached for your plan",
            "plan": plan,
            "limit": limit
        }), 403

    avatar = Avatar.query.get(avatar_id)
    if not avatar:
        return jsonify({"error": "Avatar not found"}), 404

    glb_path = os.path.join("static/uploads", avatar.filename)

    rigged_file_path, bone_map = external_rigging_tool(glb_path)
    if not rigged_file_path:
        return jsonify({"error": "Rigging failed"}), 500

    rig = RiggedAvatar(
        user_id=user_id,
        avatar_id=avatar_id,
        rig_type="auto",
        rig_file_url=rigged_file_path,
        bone_map_json=bone_map
    )
    db.session.add(rig)
    db.session.flush()

    skeleton_id = create_default_skeleton(rig.id)

    user_usage.rigging_sessions += 1
    db.session.add(user_usage)
    db.session.commit()

    return jsonify({
        "message": "Avatar rigged successfully",
        "rig_url": rigged_file_path,
        "rigged_avatar_id": rig.id,
        "skeleton_id": skeleton_id,
        "bone_map": bone_map,
        "usage": user_usage.rigging_sessions,
        "limit": limit
    }), 200


# ═══════════════════════════════════════════════════════════════
#  SELFIE / DEEP3D / LOCAL AVATAR
# ═══════════════════════════════════════════════════════════════

@api.route('/upload-selfie', methods=['POST'])
def upload_selfie():
    image = request.files.get('image')
    if not image:
        return jsonify({"error": "No image uploaded"}), 400

    if not allowed_file(image.filename):
        return jsonify({"error": "Invalid file type. Only image files are allowed."}), 400

    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)

    avatar_url = send_to_deep3d(filepath)
    if avatar_url:
        return jsonify({"avatar_url": avatar_url}), 200
    else:
        return jsonify({"error": "Avatar generation failed"}), 500


@api.route("/generate-local-avatar", methods=["POST"])
def generate_local_avatar():
    image = request.files.get("image")
    user_id = request.form.get("user_id")

    if not image or not user_id:
        return jsonify({"error": "Missing image or user ID"}), 400

    filename = secure_filename(image.filename)
    input_path = os.path.join("uploads", filename)
    image.save(input_path)

    output_file = selfie_to_avatar(input_path)

    avatar = Avatar(
        user_id=user_id,
        avatar_url=f"/{output_file}",
        filename=os.path.basename(output_file)
    )
    db.session.add(avatar)
    db.session.commit()

    return jsonify({"avatar_url": f"/{output_file}"}), 200


@api.route("/merge-avatar-body", methods=["POST"])
def merge_avatar_body():
    data = request.get_json()
    head_filename = data.get("head_filename")
    body_template = data.get("body_template")
    user_id = data.get("user_id")

    if not head_filename or not body_template or not user_id:
        return jsonify({"error": "Missing required fields"}), 400

    head_path = os.path.join("static", "uploads", head_filename)
    body_path = os.path.join("static", "bodies", body_template)

    if not os.path.exists(head_path):
        return jsonify({"error": "Head file not found"}), 404
    if not os.path.exists(body_path):
        return jsonify({"error": "Body template not found"}), 404

    export_folder = os.path.join("static", "exports")
    os.makedirs(export_folder, exist_ok=True)

    output_filename = f"merged_{uuid.uuid4().hex}.glb"
    output_path = os.path.join(export_folder, output_filename)

    try:
        merged_path = merge_head_and_body(head_path, body_path, output_path)

        avatar = Avatar(
            user_id=user_id,
            avatar_url="/" + merged_path.replace("\\", "/"),
            filename=output_filename
        )
        db.session.add(avatar)
        db.session.commit()

        return jsonify({
            "message": "Merged avatar created",
            "avatar_url": "/" + merged_path.replace("\\", "/"),
            "avatar_id": avatar.id
        }), 200

    except Exception as e:
        print(f"[Merge Error] {e}")
        return jsonify({"error": "Failed to merge avatar"}), 500


@api.route("/generate-mesh-from-views", methods=["POST"])
def generate_mesh_from_views_route():
    try:
        files = request.files
        required_views = ['front', 'left', 'right']

        for view in required_views:
            if view not in files:
                return jsonify({"error": f"Missing view: {view}"}), 400

        filenames = {}
        for view in required_views:
            file = files[view]
            filename = f"{view}_{uuid.uuid4().hex}_{secure_filename(file.filename)}"
            save_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(save_path)
            filenames[view] = save_path

        output_path = generate_mesh_from_views(
            front_path=filenames['front'],
            left_path=filenames['left'],
            right_path=filenames['right'],
            output_dir=OUTPUT_FOLDER
        )

        return jsonify({
            "message": "3D mesh generated from multiple views",
            "mesh_url": "/" + output_path.replace("\\", "/")
        })

    except Exception as e:
        print("[ERROR]", str(e))
        return jsonify({"error": "Failed to generate mesh"}), 500


# ═══════════════════════════════════════════════════════════════
#  SUBSCRIPTION / STRIPE / USAGE
# ═══════════════════════════════════════════════════════════════

@api.route("/admin/user-usage", methods=["GET"])
def get_all_user_usage():
    usage = UserUsage.query.all()
    return jsonify([
        {
            "user_id": u.user_id,
            "rigging_sessions": u.rigging_sessions,
            "storage_used_mb": u.storage_used_mb,
            "videos_rendered": u.videos_rendered
        } for u in usage
    ])


@api.route("/update-plan", methods=["POST"])
def update_plan():
    data = request.json
    user_id = data["user_id"]
    new_plan = data["plan"]
    user = User.query.get(user_id)
    if user:
        user.subscription_plan = new_plan
        db.session.commit()
        return jsonify({"message": "Plan updated"}), 200
    return jsonify({"error": "User not found"}), 404


@api.route("/create-checkout-session", methods=["POST"])
def create_checkout_session():
    data = request.get_json()
    plan = data.get("plan")
    user_id = data.get("user_id")

    if not plan or plan not in STRIPE_PRICE_IDS:
        return jsonify({"error": "Invalid or missing plan"}), 400

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{"price": STRIPE_PRICE_IDS[plan], "quantity": 1}],
            mode="subscription",
            success_url=f"{os.getenv('FRONTEND_URL')}/subscription-success?user_id={user_id}&plan={plan}",
            cancel_url=f"{os.getenv('FRONTEND_URL')}/pricing",
            metadata={"user_id": user_id, "selected_plan": plan}
        )
        return jsonify({"url": checkout_session.url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api.route("/usage/<int:user_id>", methods=["GET"])
def get_usage(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    usage = UserUsage.query.filter_by(user_id=user_id).first()
    limit = PLAN_LIMITS.get(user.subscription_plan, 5)

    return jsonify({
        "usage": usage.rigging_sessions if usage else 0,
        "limit": limit,
        "plan": user.subscription_plan
    })


# ═══════════════════════════════════════════════════════════════
#  COLORS / MISC
# ═══════════════════════════════════════════════════════════════

@api.route('/colors', methods=['GET'])
def get_colors():
    skin_colors = ['#f5cba7', '#8e735b', '#2d1f18']
    outfit_colors = ['#3498db', '#e74c3c', '#2ecc71']
    return jsonify({"skin_colors": skin_colors, "outfit_colors": outfit_colors})


# ═══════════════════════════════════════════════════════════════
#  AVATAR EXPORT (FBX / GLB / OBJ)
# ═══════════════════════════════════════════════════════════════

@api.route('/export-avatar', methods=['POST'])
def export_avatar():
    data = request.json
    rigging_preset = data.get('riggingPreset')
    avatar_model = data.get('avatarModel')
    file_type = data.get('fileType', 'fbx')

    bone_mappings = {
        'unity': {
            'root': 'root', 'pelvis': 'Hips', 'spine': 'Spine',
            'spine_02': 'Chest', 'neck_01': 'Neck', 'head': 'Head',
            'l_clavicle': 'LeftShoulder', 'l_upper_arm': 'LeftUpperArm',
            'l_forearm': 'LeftLowerArm', 'l_hand': 'LeftHand',
            'r_clavicle': 'RightShoulder', 'r_upper_arm': 'RightUpperArm',
            'r_forearm': 'RightLowerArm', 'r_hand': 'RightHand',
            'l_femur': 'LeftThigh', 'l_tibia': 'LeftShin', 'l_foot': 'LeftFoot',
            'r_femur': 'RightThigh', 'r_tibia': 'RightShin', 'r_foot': 'RightFoot',
            'l_toe_base': 'LeftToeBase', 'r_toe_base': 'RightToeBase',
        },
        'unreal': {
            'root': 'root', 'pelvis': 'pelvis', 'spine': 'spine_01',
            'spine_02': 'spine_02', 'spine_03': 'spine_03',
            'neck': 'neck_01', 'head': 'head',
            'l_clavicle': 'l_clavicle', 'l_upper_arm': 'l_upper_arm',
            'l_forearm': 'l_forearm', 'l_hand': 'l_hand',
            'r_clavicle': 'r_clavicle', 'r_upper_arm': 'r_upper_arm',
            'r_forearm': 'r_forearm', 'r_hand': 'r_hand',
            'l_femur': 'l_femur', 'l_tibia': 'l_tibia', 'l_foot': 'l_foot',
            'r_femur': 'r_femur', 'r_tibia': 'r_tibia', 'r_foot': 'r_foot',
        },
        'maya': {
            'root': 'root', 'pelvis': 'pelvis', 'spine': 'spine',
            'neck': 'neck', 'head': 'head',
            'l_shoulder': 'l_shoulder', 'r_shoulder': 'r_shoulder',
            'l_upper_arm': 'l_upper_arm', 'r_upper_arm': 'r_upper_arm',
            'l_forearm': 'l_forearm', 'r_forearm': 'r_forearm',
            'l_hand': 'l_hand', 'r_hand': 'r_hand',
            'l_thigh': 'l_thigh', 'r_thigh': 'r_thigh',
            'l_shin': 'l_shin', 'r_shin': 'r_shin',
            'l_foot': 'l_foot', 'r_foot': 'r_foot',
        }
    }

    bones = bone_mappings.get(rigging_preset)
    if not bones:
        return jsonify({"error": f"Unsupported rigging preset: {rigging_preset}"}), 400

    try:
        file_path = f"exports/{rigging_preset}_avatar.{file_type}"
        os.makedirs("exports", exist_ok=True)

        exporter = FBXExporter()
        exporter.export(avatar_model, bone_structure=bones, output_path=file_path)

        return send_file(file_path, as_attachment=True,
                         download_name=f"{rigging_preset}_avatar.{file_type}")
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ═══════════════════════════════════════════════════════════════
#  OUTFITS / WARDROBE
# ═══════════════════════════════════════════════════════════════

@api.route("/save-outfit", methods=["POST"])
@jwt_required()
def save_outfit():
    user_id = get_jwt_identity()
    data = request.get_json()

    name = data.get("name")
    file = data.get("file")
    style = data.get("style")

    if not name or not file:
        return jsonify({"message": "Missing outfit data"}), 400

    new_outfit = SavedOutfit(user_id=user_id, name=name, file=file, style=style)
    db.session.add(new_outfit)
    db.session.commit()

    return jsonify({"message": "Outfit saved successfully"}), 200


@api.route("/user-outfits", methods=["GET"])
@jwt_required()
def get_user_outfits():
    user_id = get_jwt_identity()
    outfits = Outfit.query.filter_by(user_id=user_id).all()
    return jsonify([o.serialize() for o in outfits]), 200


@api.route("/my-outfits", methods=["GET"])
@jwt_required()
def get_my_outfits():
    user_id = get_jwt_identity()
    outfits = SavedOutfit.query.filter_by(user_id=user_id).all()
    return jsonify({
        "outfits": [
            {"id": o.id, "name": o.name, "file": o.file, "style": o.style}
            for o in outfits
        ]
    }), 200


@api.route("/delete-outfit/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_outfit(id):
    user_id = get_jwt_identity()
    outfit = SavedOutfit.query.get(id)

    if not outfit:
        return jsonify({"message": "Outfit not found"}), 404
    if outfit.user_id != user_id:
        return jsonify({"message": "Unauthorized"}), 403

    db.session.delete(outfit)
    db.session.commit()
    return jsonify({"message": "Outfit deleted successfully"}), 200


@api.route("/favorite-outfit/<int:id>", methods=["POST"])
@jwt_required()
def favorite_outfit(id):
    user_id = get_jwt_identity()
    outfit = SavedOutfit.query.get(id)

    if not outfit:
        return jsonify({"message": "Outfit not found"}), 404
    if outfit.user_id != user_id:
        return jsonify({"message": "Unauthorized"}), 403

    outfit.is_favorite = True
    db.session.commit()
    return jsonify({"message": "Outfit favorited successfully"}), 200


@api.route("/export-combined-avatar", methods=["POST"])
@jwt_required()
def export_combined_avatar():
    data = request.get_json()
    user_id = get_jwt_identity()
    avatar_id = data.get("avatar_id")
    outfit_file = data.get("outfit_file")

    avatar = Avatar.query.get(avatar_id)
    if not avatar or avatar.user_id != user_id:
        return {"error": "Avatar not found or unauthorized."}, 404

    avatar_path = os.path.join("static", "uploads", avatar.filename)
    outfit_path = os.path.join("static", "outfits", outfit_file)

    if not os.path.exists(avatar_path) or not os.path.exists(outfit_path):
        return {"error": "Avatar or outfit file missing."}, 400

    try:
        avatar_mesh = trimesh.load(avatar_path)
        outfit_mesh = trimesh.load(outfit_path)

        combined_scene = trimesh.Scene()
        combined_scene.add_geometry(avatar_mesh, node_name="avatar")
        combined_scene.add_geometry(outfit_mesh, node_name="outfit")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".glb") as tmp_file:
            combined_scene.export(tmp_file.name)
            return send_file(tmp_file.name, as_attachment=True, download_name="combined_avatar.glb")

    except Exception as e:
        print("[Export Error]", e)
        return {"error": "Failed to export combined model."}, 500