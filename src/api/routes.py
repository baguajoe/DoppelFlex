# pyright: reportMissingImports=false

# api/routes.py

from flask import request, jsonify, Blueprint, Response, Flask, url_for
from flask_jwt_extended import jwt_required, get_jwt_identity
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

# import moviepy

# from moviepy.editor import AudioFileClip, VideoFileClip, ImageSequenceClip
from moviepy.editor import AudioFileClip, VideoFileClip, ImageSequenceClip
from moviepy.video.io.ffmpeg_tools import ffmpeg_extract_subclip





from flask import send_file
from uuid import uuid4
import os
from api.utils.video import generate_frame_images




# from api import api
from api.models import db, Avatar, Customization, RiggedAvatar, User, UserUsage, MotionCaptureSession, MotionAudioSync, MotionSession, FBXExporter, SavedOutfit, Outfit, AvatarPreset
from api.utils.process_pose_video import process_and_save_pose
from api.utils.rigging import external_rigging_tool
from api.utils.skeleton_builder import create_default_skeleton
from api.utils.selfie_to_depth import selfie_to_avatar
from api.utils.avatar_merge import merge_head_and_body
from api.utils.multi_view_to_mesh import generate_mesh_from_views



from datetime import datetime






import tempfile
import librosa
import cv2
import mediapipe as mp
import numpy as np
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env file
from .utils.process_pose_video import process_and_save_pose




api = Blueprint('api', __name__)
app = Flask(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Define Stripe prices (replace with your real Stripe Price IDs)
STRIPE_PRICE_IDS = {
    "Basic": "price_123_basic",
    "Pro": "price_456_pro",
    "Premium": "price_789_premium"
}



# MediaPipe setup
mp_pose = mp.solutions.pose
pose = mp_pose.Pose()


UPLOAD_FOLDER = os.path.join("static", "uploads")
OUTPUT_FOLDER = "static/exports"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Your Deep3D API Key (make sure to set this in your environment or replace it here)
DEEP3D_API_URL = "https://api.deep3d.com/generate-avatar"  # Replace with the actual URL
DEEP3D_API_KEY = os.getenv("DEEP3D_API_KEY")  # Ensure to have the API key securely stored


# Enable CORS
CORS(api)

# 🔐 Plan-based rigging limits
PLAN_LIMITS = {
    "Basic": 5,
    "Pro": 20,
    "Premium": float("inf")  # unlimited rigging
}

@api.route("/signup", methods=["POST"])
def signup():
    data = request.get_json()

    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if not username or not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    # Check if user already exists
    if User.query.filter((User.username == username) | (User.email == email)).first():
        return jsonify({"error": "User already exists"}), 409

    hashed_password = generate_password_hash(password)

    new_user = User(
        username=username,
        email=email,
        password_hash=hashed_password
    )

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

    # Mock token (for now). Later, generate a JWT or session token.
    token = str(uuid.uuid4())

    return jsonify({
        "message": "Login successful",
        "user_id": user.id,
        "username": user.username,
        "token": token
    }), 200

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
        # ── Step 1: Face Detection (quick validation) ──
        img = cv2.imread(filepath)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = face_detection.process(img_rgb)

        if not results.detections:
            os.remove(filepath)
            return jsonify({"error": "No face detected in the image. Please upload a clear front-facing photo."}), 400

        print(f"[create-avatar] Face detected in {filename}")

        # ── Step 2: Generate 3D mesh from selfie ──
        # This calls your selfie_to_avatar pipeline:
        #   - Removes background (rembg)
        #   - Estimates depth (MiDaS)
        #   - Generates point cloud → Poisson mesh
        #   - Exports as .ply
        ply_path = selfie_to_avatar(filepath, output_path=EXPORT_FOLDER)
        print(f"[create-avatar] PLY mesh generated: {ply_path}")

        if not ply_path or not os.path.exists(ply_path):
            return jsonify({"error": "3D mesh generation failed."}), 500

        # ── Step 3: Convert .ply to .glb using trimesh ──
        mesh = trimesh.load(ply_path)
        glb_filename = os.path.splitext(os.path.basename(ply_path))[0] + ".glb"
        glb_path = os.path.join(EXPORT_FOLDER, glb_filename)
        mesh.export(glb_path, file_type="glb")
        print(f"[create-avatar] GLB exported: {glb_path}")

        if not os.path.exists(glb_path):
            return jsonify({"error": "GLB conversion failed."}), 500

        # ── Step 4: Save to database ──
        avatar_url = f"/static/exports/{glb_filename}"
        avatar = Avatar(
            user_id=user_id,
            avatar_url=avatar_url,
            filename=glb_filename
        )
        db.session.add(avatar)
        db.session.commit()

        print(f"[create-avatar] Avatar saved to DB: id={avatar.id}, url={avatar_url}")

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
        # Assuming you're getting data from a frontend request
        data = request.get_json()

        user_id = data["user_id"]
        height = data["height"]
        weight = data["weight"]
        skin_color = data["skin_color"]
        outfit_color = data["outfit_color"]
        accessories = data["accessories"]

        # Create a new AvatarPreset instance
        new_preset = AvatarPreset(
            user_id=user_id,
            height=height,
            weight=weight,
            skin_color=skin_color,
            outfit_color=outfit_color,
            accessories=accessories
        )

        # Save to the database
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

        # Mock result: simulate timing of words/phonemes
        mock_visemes = [
            {"time": 0.0, "viseme": "A"},
            {"time": 0.3, "viseme": "E"},
            {"time": 0.5, "viseme": "O"},
            {"time": 0.8, "viseme": "M"}
        ]

        return jsonify({
            "duration": duration,
            "visemes": mock_visemes
        }), 200

# Define the route to convert to MP4
@api.route("/convert-to-mp4", methods=["POST"])
def convert_to_mp4():
    data = request.get_json()
    video_file = data.get("filename")

    if not video_file:
        return jsonify({"error": "Missing filename"}), 400

    # Define paths
    input_path = os.path.join("static", "uploads", video_file)
    output_filename = video_file.replace(".webm", ".mp4")
    output_path = os.path.join("static", "exports", output_filename)

    # Ensure export folder exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # FFmpeg command
    command = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        output_path
    ]

    try:
        subprocess.run(command, check=True)
        return jsonify({
            "message": "Conversion successful",
            "mp4_url": f"/static/exports/{output_filename}"
        }), 200
    except subprocess.CalledProcessError as e:
        return jsonify({ "error": str(e) }), 500



# Define the route to convert to AVI
@api.route("/convert-to-avi", methods=["POST"])
def convert_to_avi():
    video_file = request.json.get("filename")
    if not video_file:
        return jsonify({"error": "Missing filename"}), 400

    video_path = os.path.join(UPLOAD_FOLDER, video_file)
    avi_filename = video_file.replace(".webm", ".avi")
    avi_path = os.path.join(UPLOAD_FOLDER, avi_filename)

    command = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",  # adjust for quality
        avi_path
    ]

    try:
        subprocess.run(command, check=True)
        return jsonify({"avi_url": f"/static/uploads/{avi_filename}"}), 200
    except subprocess.CalledProcessError as e:
        return jsonify({"error": str(e)}), 500


# Define the route to convert to MOV
@api.route("/convert-to-mov", methods=["POST"])
def convert_to_mov():
    video_file = request.json.get("filename")
    if not video_file:
        return jsonify({"error": "Missing filename"}), 400

    video_path = os.path.join(UPLOAD_FOLDER, video_file)
    mov_filename = video_file.replace(".webm", ".mov")
    mov_path = os.path.join(UPLOAD_FOLDER, mov_filename)

    command = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-c:v", "prores_ks",  # Apple ProRes codec for .mov format
        mov_path
    ]

    try:
        subprocess.run(command, check=True)
        return jsonify({"mov_url": f"/static/uploads/{mov_filename}"}), 200
    except subprocess.CalledProcessError as e:
        return jsonify({"error": str(e)}), 500


# Define the route using Blueprint
# Helper function to send selfie to Deep3D API
def send_to_deep3d(filepath):
    """
    Send the uploaded selfie to Deep3D API to generate the 3D avatar.
    """
    try:
        with open(filepath, 'rb') as image_file:
            files = {'image': image_file}
            headers = {"Authorization": f"Bearer {DEEP3D_API_KEY}"}
            response = requests.post(DEEP3D_API_URL, files=files, headers=headers)

        response.raise_for_status()  # Raise an error for bad responses

        # Parse the response and return the avatar URL
        data = response.json()
        avatar_url = data.get("avatar_url")  # Adjust based on actual API response
        return avatar_url

    except Exception as e:
        print(f"[Deep3D Error] {e}")
        return None

# Route to handle the selfie upload and 3D avatar creation
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

# Function to check allowed file extensions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@api.route('/upload-selfie', methods=['POST'])
def upload_selfie():
    image = request.files.get('image')  # Get the image from the request
    
    # Check if no image is uploaded
    if not image:
        return jsonify({"error": "No image uploaded"}), 400
    
    # Check if the file type is allowed
    if not allowed_file(image.filename):
        return jsonify({"error": "Invalid file type. Only image files are allowed."}), 400

    # Save the image file to the server
    filename = secure_filename(image.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    image.save(filepath)

    # Send the image to Deep3D and retrieve the avatar URL
    avatar_url = send_to_deep3d(filepath)

    if avatar_url:
        return jsonify({"avatar_url": avatar_url}), 200
    else:
        return jsonify({"error": "Avatar generation failed"}), 500

# Route to process pose data from frontend
@api.route('/process-pose', methods=['POST'])
def process_pose():
    # Assuming you have video frames or pose data from frontend
    pose_data = request.json.get('pose_data')

    # For now, let's just return the pose data back to simulate processing
    return jsonify({"pose_landmarks": pose_data}), 200

@api.route("/process-pose", methods=["POST"])
def process_pose_route():
    # Get the image from the POST request
    image = request.files.get("image")
    
    if not image:
        return jsonify({"error": "No image uploaded"}), 400
    
    # Process the pose in the image using the utility function
    landmarks = process_pose(image)
    
    if landmarks:
        return jsonify({"pose_landmarks": landmarks}), 200
    else:
        return jsonify({"error": "No landmarks detected"}), 404
    
@app.route('/upload-video', methods=['POST'])
def upload_video():
    video = request.files.get("video")
    if not video:
        return jsonify({"error": "No video file provided"}), 400

    filename = video.filename
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    video.save(filepath)

    pose_data = process_pose(filepath)
    
    if pose_data:
        return jsonify({"pose_data_file": pose_data}), 200
    else:
        return jsonify({"error": "Pose processing failed"}), 500

def process_pose(video_path):
    # Open the video file
    cap = cv2.VideoCapture(video_path)
    pose_data = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Convert to RGB before processing with MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = pose.process(rgb_frame)

        if results.pose_landmarks:
            # Collect pose landmarks
            pose_landmarks = [(landmark.x, landmark.y, landmark.z) for landmark in results.pose_landmarks.landmark]
            pose_data.append(pose_landmarks)

    cap.release()

    if pose_data:
        # Save pose data to a file or return directly
        pose_data_file = "pose_data.json"
        with open(os.path.join(UPLOAD_FOLDER, pose_data_file), 'w') as f:
            json.dump(pose_data, f)
        return pose_data_file

    return None
@api.route("/rig-avatar", methods=["POST"])
def rig_avatar():
    avatar_id = request.json.get("avatar_id")
    user_id = request.json.get("user_id")

    if not avatar_id or not user_id:
        return jsonify({"error": "Missing avatar_id or user_id"}), 400

    # Load user and check existence
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Get current usage or create new tracker
    user_usage = UserUsage.query.filter_by(user_id=user_id).first()
    if not user_usage:
        user_usage = UserUsage(user_id=user_id, rigging_sessions=0)

    # Enforce plan limits
    plan = user.subscription_plan  # assume this is a string like 'Basic', 'Pro'
    PLAN_LIMITS = {
        "Basic": 5,
        "Pro": 20,
        "Premium": 50
    }
    limit = PLAN_LIMITS.get(plan, 5)

    if user_usage.rigging_sessions >= limit:
        return jsonify({
            "error": "Rigging limit reached for your plan",
            "plan": plan,
            "limit": limit
        }), 403

    # Load avatar
    avatar = Avatar.query.get(avatar_id)
    if not avatar:
        return jsonify({"error": "Avatar not found"}), 404

    glb_path = os.path.join("static/uploads", avatar.filename)

    # Rig the avatar (returns .glb/.fbx path + bone map)
    rigged_file_path, bone_map = external_rigging_tool(glb_path)
    if not rigged_file_path:
        return jsonify({"error": "Rigging failed"}), 500

    # Save rigged avatar
    rig = RiggedAvatar(
        user_id=user_id,
        avatar_id=avatar_id,
        rig_type="auto",
        rig_file_url=rigged_file_path,
        bone_map_json=bone_map
    )
    db.session.add(rig)
    db.session.flush()

    # Create skeleton hierarchy
    skeleton_id = create_default_skeleton(rig.id)

    # Increment usage
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

# // backend route for Stripe (Flask)

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
            line_items=[
                {
                    "price": STRIPE_PRICE_IDS[plan],
                    "quantity": 1,
                }
            ],
            mode="subscription",
            success_url=f"{os.getenv('FRONTEND_URL')}/subscription-success?user_id={user_id}&plan={plan}",
            cancel_url=f"{os.getenv('FRONTEND_URL')}/pricing",
            metadata={"user_id": user_id, "selected_plan": plan}
        )
        return jsonify({"url": checkout_session.url}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# backend route to get usage info
@api.route("/api/usage/<int:user_id>", methods=["GET"])
def get_usage(user_id):
    user = User.query.get(user_id)
    usage = UserUsage.query.filter_by(user_id=user_id).first()
    PLAN_LIMITS = {"Basic": 5, "Pro": 20, "Premium": float("inf")}
    limit = PLAN_LIMITS.get(user.subscription_plan, 5)
    return jsonify({
        "usage": usage.rigging_sessions,
        "limit": limit,
        "plan": user.subscription_plan
    })

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

# api/routes.py


@api.route("/save-beat-map", methods=["POST"])
def save_beat_map():
    if request.content_type.startswith("application/json"):
        # Handle JSON payload
        data = request.get_json()
        user_id = data.get("user_id")
        avatar_id = data.get("avatar_id")
        audio_filename = data.get("audio_filename")
        beat_timestamps = data.get("beat_timestamps")

        if not all([user_id, audio_filename, beat_timestamps]):
            return jsonify({"error": "Missing required fields"}), 400

    elif request.content_type.startswith("multipart/form-data"):
        # Handle form-data (file upload)
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
        avatar_id = None  # Optional
        try:
            beat_timestamps = json.loads(beat_timestamps)
        except Exception:
            return jsonify({"error": "Invalid beat_times format"}), 400

    else:
        return jsonify({"error": "Unsupported Content-Type"}), 415

    # Save to DB
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

@api.route("/export-video", methods=["POST"])
def export_video():
    data = request.json
    pose_data = data.get("frames")
    audio_path = data.get("audio_path")

    # Render a video from pose data (using placeholder for now)
    output_path = "static/exports/animation.mp4"

    # Simulate generation for now
    # clip = VideoFileClip("static/placeholder.mp4")
    # audioclip = AudioFileClip(audio_path)
    # final = clip.set_audio(audioclip)
    # final.write_videofile(output_path, codec="libx264")

    return send_file(output_path, as_attachment=True)

# Save motion session
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

# Get motion sessions by user
@api.route("/motion-sessions/<int:user_id>", methods=["GET"])
def get_motion_sessions(user_id):
    # Fetch MotionSession data
    motion_sessions = MotionSession.query.filter_by(user_id=user_id).all()

    # Fetch MotionCaptureSession data
    motion_capture_sessions = MotionCaptureSession.query.filter_by(user_id=user_id).all()

    # Combine both session types into a single response
    all_sessions = []

    # Add MotionSession data to the response
    all_sessions.extend([{
        "id": s.id,
        "name": s.session_name,
        "created_at": s.created_at.isoformat()
    } for s in motion_sessions])

    # Add MotionCaptureSession data to the response
    all_sessions.extend([{
        "id": s.id,
        "avatar_id": s.avatar_id,
        "pose_data_url": s.pose_data_url,
        "source_type": s.source_type,
        "created_at": s.created_at.isoformat()
    } for s in motion_capture_sessions])

    return jsonify(all_sessions)


# Export video (future)

@api.route("/export-mp4", methods=["POST"])
def export_mp4():
    data = request.get_json()
    frames = data.get("frames")
    audio_path = data.get("audio_path")

    # Generate placeholder images (rendered frames can come from your app)
    image_paths = generate_frame_images(frames)  # Custom function to render images

    audio_clip = AudioFileClip(audio_path)
    video = ImageSequenceClip(image_paths, fps=30).set_audio(audio_clip)
    video_path = f"static/exports/session_{uuid4()}.mp4"
    video.write_videofile(video_path, codec="libx264", audio_codec="aac")

    return send_file(video_path, as_attachment=True)

@api.route("/save-fx-timeline", methods=["POST"])
def save_fx_timeline():
    data = request.get_json()
    session_id = data.get("session_id")
    fx_timeline = data.get("fx_timeline")  # e.g., [{time: 2.5, type: "spark"}, ...]

    session = MotionSession.query.get(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    session.fx_timeline = fx_timeline
    db.session.commit()
    return jsonify({"message": "FX timeline saved successfully"}), 200

@api.route('/get-saved-sessions/<int:user_id>')
def get_sessions(user_id):
    sessions = MotionSession.query.filter_by(user_id=user_id).all()
    return jsonify([
        {
            'id': s.id,
            'name': s.name,
            'created_at': s.created_at,
            'audio_url': url_for('static', filename=f'uploads/{s.audio_filename}', _external=True),
            'thumbnail_url': url_for('static', filename=f'thumbnails/{s.thumbnail}', _external=True) if s.thumbnail else None
        } for s in sessions
    ])

@api.route('/delete-session/<int:session_id>', methods=['DELETE'])
def delete_session(session_id):
    session = MotionSession.query.get(session_id)
    if session:
        db.session.delete(session)
        db.session.commit()
        return jsonify({'message': 'Deleted'}), 200
    return jsonify({'error': 'Not found'}), 404

# Example route to fetch available colors from the database
@api.route('/colors', methods=['GET'])
def get_colors():
    skin_colors = [
        '#f5cba7',  # Light
        '#8e735b',  # Medium
        '#2d1f18',  # Dark
    ]
    outfit_colors = [
        '#3498db',  # Blue
        '#e74c3c',  # Red
        '#2ecc71',  # Green
    ]
    return jsonify({"skin_colors": skin_colors, "outfit_colors": outfit_colors})

# Placeholder function to implement the export logic
def export_avatar_model(avatar_model, rigging_preset, file_type):
    # Define export directory
    export_dir = "exports"
    os.makedirs(export_dir, exist_ok=True)  # Ensure the export folder exists

    if file_type == "fbx":
        # Logic to export as FBX
        file_path = os.path.join(export_dir, f"{rigging_preset}_avatar.fbx")
        # Implement actual export logic for FBX (e.g., using pyassimp or other libraries)
        return file_path

    elif file_type == "glb":
        # Logic to export as GLTF (glb)
        file_path = os.path.join(export_dir, f"{rigging_preset}_avatar.glb")
        # Implement actual export logic for GLTF (e.g., using pygltf or glTF libraries)
        return file_path

    elif file_type == "obj":
        # Logic to export as OBJ
        file_path = os.path.join(export_dir, f"{rigging_preset}_avatar.obj")
        # Implement actual export logic for OBJ (e.g., using a custom conversion or library)
        return file_path

    else:
        # Raise an error if the file type is unsupported
        raise ValueError(f"Unsupported file type: {file_type}")


# Route to export the avatar model
@api.route('/export-avatar', methods=['POST'])
def export_avatar():
    data = request.json
    rigging_preset = data.get('riggingPreset')
    avatar_model = data.get('avatarModel')
    file_type = data.get('fileType', 'fbx')  # Default to FBX if no type is provided

    # Define the export avatar model logic
    def export_avatar_model(avatar_model, rigging_preset, file_type):
        # Define bone mappings for Unity Humanoid, Unreal Skeleton, and Maya
        bone_mappings = {
            'unity': {
                'root': 'root',  # Root bone (if applicable)
                'pelvis': 'Hips',  # Pelvis (Unity Humanoid)
                'spine': 'Spine',  # Main spine
                'spine_01': 'Spine',  # Spine part 1
                'spine_02': 'Chest',  # Chest area
                'spine_03': 'Chest',  # Chest area (or you can add it as a more specific bone for detailed rigs)
                'neck_01': 'Neck',  # Neck part 1 (Unity Humanoid)
                'head': 'Head',  # Head
                'l_clavicle': 'LeftShoulder',  # Left clavicle
                'l_upper_arm': 'LeftUpperArm',  # Left upper arm
                'l_forearm': 'LeftLowerArm',  # Left forearm
                'l_hand': 'LeftHand',  # Left hand
                'r_clavicle': 'RightShoulder',  # Right clavicle
                'r_upper_arm': 'RightUpperArm',  # Right upper arm
                'r_forearm': 'RightLowerArm',  # Right forearm
                'r_hand': 'RightHand',  # Right hand
                'l_femur': 'LeftThigh',  # Left thigh
                'l_tibia': 'LeftShin',  # Left shin
                'l_foot': 'LeftFoot',  # Left foot
                'r_femur': 'RightThigh',  # Right thigh
                'r_tibia': 'RightShin',  # Right shin
                'r_foot': 'RightFoot',  # Right foot
                'l_toe_base': 'LeftToeBase',  # Left toe (if applicable)
                'r_toe_base': 'RightToeBase',  # Right toe (if applicable)
                # Optional bones (if more detail is required for fingers and toes)
                'l_thumb_01': 'LeftThumbProximal',  # Left thumb base
                'l_thumb_02': 'LeftThumbIntermediate',  # Left thumb middle
                'l_thumb_03': 'LeftThumbDistal',  # Left thumb tip
                'l_index_01': 'LeftIndexProximal',  # Left index base
                'l_index_02': 'LeftIndexIntermediate',  # Left index middle
                'l_index_03': 'LeftIndexDistal',  # Left index tip
                'l_middle_01': 'LeftMiddleProximal',  # Left middle base
                'l_middle_02': 'LeftMiddleIntermediate',  # Left middle middle
                'l_middle_03': 'LeftMiddleDistal',  # Left middle tip
                'l_ring_01': 'LeftRingProximal',  # Left ring base
                'l_ring_02': 'LeftRingIntermediate',  # Left ring middle
                'l_ring_03': 'LeftRingDistal',  # Left ring tip
                'l_pinky_01': 'LeftLittleProximal',  # Left pinky base
                'l_pinky_02': 'LeftLittleIntermediate',  # Left pinky middle
                'l_pinky_03': 'LeftLittleDistal',  # Left pinky tip
                'r_thumb_01': 'RightThumbProximal',  # Right thumb base
                'r_thumb_02': 'RightThumbIntermediate',  # Right thumb middle
                'r_thumb_03': 'RightThumbDistal',  # Right thumb tip
                'r_index_01': 'RightIndexProximal',  # Right index base
                'r_index_02': 'RightIndexIntermediate',  # Right index middle
                'r_index_03': 'RightIndexDistal',  # Right index tip
                'r_middle_01': 'RightMiddleProximal',  # Right middle base
                'r_middle_02': 'RightMiddleIntermediate',  # Right middle middle
                'r_middle_03': 'RightMiddleDistal',  # Right middle tip
                'r_ring_01': 'RightRingProximal',  # Right ring base
                'r_ring_02': 'RightRingIntermediate',  # Right ring middle
                'r_ring_03': 'RightRingDistal',  # Right ring tip
                'r_pinky_01': 'RightLittleProximal',  # Right pinky base
                'r_pinky_02': 'RightLittleIntermediate',  # Right pinky middle
                'r_pinky_03': 'RightLittleDistal',  # Right pinky tip
              
                        # Lips for Unity
                'l_upper_lip': 'LeftUpperLip',  # Left upper lip
                'l_lower_lip': 'LeftLowerLip',  # Left lower lip
                'r_upper_lip': 'RightUpperLip',  # Right upper lip
                'r_lower_lip': 'RightLowerLip',  # Right lower lip
                'mouth': 'Mouth',  # General mouth bone (optional, used for mouth movements)

                        # Optional bones for detailed rigging (fingers, toes, etc.)
                'l_thumb_01': 'LeftThumbProximal',
                'r_thumb_01': 'RightThumbProximal',

            },

            'unreal': {
                'root': 'root',
                'pelvis': 'pelvis',
                'spine': 'spine_01',
                'spine_01': 'spine_01',
                'spine_02': 'spine_02',
                'spine_03': 'spine_03',
                'neck': 'neck_01',
                'head': 'head',
                'l_clavicle': 'l_clavicle',
                'l_upper_arm': 'l_upper_arm',
                'l_forearm': 'l_forearm',
                'l_hand': 'l_hand',
                'r_clavicle': 'r_clavicle',
                'r_upper_arm': 'r_upper_arm',
                'r_forearm': 'r_forearm',
                'r_hand': 'r_hand',
                'l_femur': 'l_femur',
                'l_tibia': 'l_tibia',
                'l_foot': 'l_foot',
                'r_femur': 'r_femur',
                'r_tibia': 'r_tibia',
                'r_foot': 'r_foot',
                'l_toe_base': 'l_toe_base',
                'r_toe_base': 'r_toe_base',
                
                # Optional bones for more detailed rigs
                'l_thumb_01': 'l_thumb_01',
                'l_thumb_02': 'l_thumb_02',
                'l_thumb_03': 'l_thumb_03',
                'l_index_01': 'l_index_01',
                'l_index_02': 'l_index_02',
                'l_index_03': 'l_index_03',
                'l_middle_01': 'l_middle_01',
                'l_middle_02': 'l_middle_02',
                'l_middle_03': 'l_middle_03',
                'l_ring_01': 'l_ring_01',
                'l_ring_02': 'l_ring_02',
                'l_ring_03': 'l_ring_03',
                'l_pinky_01': 'l_pinky_01',
                'l_pinky_02': 'l_pinky_02',
                'l_pinky_03': 'l_pinky_03',
                
                'r_thumb_01': 'r_thumb_01',
                'r_thumb_02': 'r_thumb_02',
                'r_thumb_03': 'r_thumb_03',
                'r_index_01': 'r_index_01',
                'r_index_02': 'r_index_02',
                'r_index_03': 'r_index_03',
                'r_middle_01': 'r_middle_01',
                'r_middle_02': 'r_middle_02',
                'r_middle_03': 'r_middle_03',
                'r_ring_01': 'r_ring_01',
                'r_ring_02': 'r_ring_02',
                'r_ring_03': 'r_ring_03',
                'r_pinky_01': 'r_pinky_01',
                'r_pinky_02': 'r_pinky_02',
                'r_pinky_03': 'r_pinky_03',

                            # Lips for Unreal
                'l_upper_lip': 'L_UpperLip',  # Left upper lip
                'l_lower_lip': 'L_LowerLip',  # Left lower lip
                'r_upper_lip': 'R_UpperLip',  # Right upper lip
                'r_lower_lip': 'R_LowerLip',  # Right lower lip
                'mouth': 'Mouth',  # General mouth bone (optional)

                # Optional bones for detailed rigging (fingers, toes, etc.)
                'l_thumb_01': 'L_Thumb_01',
                'r_thumb_01': 'R_Thumb_01',
                # Additional finger and toe bones as needed
            },

            'maya': {
                'root': 'root',  # Root bone for Maya (if applicable)
                'pelvis': 'pelvis',  # Pelvis (Maya style)
                'spine': 'spine',  # Spine
                'neck': 'neck',  # Neck
                'head': 'head',  # Head
                'l_shoulder': 'l_shoulder',  # Left shoulder
                'r_shoulder': 'r_shoulder',  # Right shoulder
                'l_upper_arm': 'l_upper_arm',  # Left upper arm
                'r_upper_arm': 'r_upper_arm',  # Right upper arm
                'l_forearm': 'l_forearm',  # Left forearm
                'r_forearm': 'r_forearm',  # Right forearm
                'l_hand': 'l_hand',  # Left hand
                'r_hand': 'r_hand',  # Right hand
                # Add more Maya-specific bone names here (if necessary)
                 # Legs and Feet
                'l_thigh': 'l_thigh',  # Left thigh
                'r_thigh': 'r_thigh',  # Right thigh
                'l_shin': 'l_shin',  # Left shin
                'r_shin': 'r_shin',  # Right shin
                'l_foot': 'l_foot',  # Left foot
                'r_foot': 'r_foot',  # Right foot
                'l_toe': 'l_toe',  # Left toe
                'r_toe': 'r_toe',  # Right toe

                # Optional Bones for More Detail
                'l_thumb_01': 'l_thumb_01',  # Left thumb base
                'l_thumb_02': 'l_thumb_02',  # Left thumb middle
                'l_thumb_03': 'l_thumb_03',  # Left thumb tip
                'l_index_01': 'l_index_01',  # Left index base
                'l_index_02': 'l_index_02',  # Left index middle
                'l_index_03': 'l_index_03',  # Left index tip
                'l_middle_01': 'l_middle_01',  # Left middle base
                'l_middle_02': 'l_middle_02',  # Left middle middle
                'l_middle_03': 'l_middle_03',  # Left middle tip
                'l_ring_01': 'l_ring_01',  # Left ring base
                'l_ring_02': 'l_ring_02',  # Left ring middle
                'l_ring_03': 'l_ring_03',  # Left ring tip
                'l_pinky_01': 'l_pinky_01',  # Left pinky base
                'l_pinky_02': 'l_pinky_02',  # Left pinky middle
                'l_pinky_03': 'l_pinky_03',  # Left pinky tip

                'r_thumb_01': 'r_thumb_01',  # Right thumb base
                'r_thumb_02': 'r_thumb_02',  # Right thumb middle
                'r_thumb_03': 'r_thumb_03',  # Right thumb tip
                'r_index_01': 'r_index_01',  # Right index base
                'r_index_02': 'r_index_02',  # Right index middle
                'r_index_03': 'r_index_03',  # Right index tip
                'r_middle_01': 'r_middle_01',  # Right middle base
                'r_middle_02': 'r_middle_02',  # Right middle middle
                'r_middle_03': 'r_middle_03',  # Right middle tip
                'r_ring_01': 'r_ring_01',  # Right ring base
                'r_ring_02': 'r_ring_02',  # Right ring middle
                'r_ring_03': 'r_ring_03',  # Right ring tip
                'r_pinky_01': 'r_pinky_01',  # Right pinky base
                'r_pinky_02': 'r_pinky_02',  # Right pinky middle
                'r_pinky_03': 'r_pinky_03',  # Right pinky tip

                        # Lips for Maya
                'l_upper_lip': 'l_upper_lip',  # Left upper lip
                'l_lower_lip': 'l_lower_lip',  # Left lower lip
                'r_upper_lip': 'r_upper_lip',  # Right upper lip
                'r_lower_lip': 'r_lower_lip',  # Right lower lip
                'mouth': 'mouth',  # General mouth bone (optional)

                # Optional bones for more detailed rigging (fingers, toes, etc.)
                'l_thumb_01': 'l_thumb_01',
                'r_thumb_01': 'r_thumb_01',
            }
        }

        # Depending on rigging preset, use the appropriate bone structure
        bones = bone_mappings.get(rigging_preset)

        if bones:
            # Prepare for FBX Export
            file_path = f"exports/{rigging_preset}_avatar.fbx"
            
            # FBX Export Process (using pyfbx)
            exporter = FBXExporter()
            
            # Exporting the avatar model using the bone mapping for Maya (FBX)
            try:
                # Example: Export using pyfbx with bone mappings
                exporter.export(avatar_model, bone_structure=bones, output_path=file_path)

                return file_path
            except Exception as e:
                raise ValueError(f"Error exporting FBX for Maya: {str(e)}")

        else:
            raise ValueError(f"Unsupported rigging preset: {rigging_preset}")

    try:
        # Call the export logic
        file_path = export_avatar_model(avatar_model, rigging_preset, file_type)

        # Return the file based on the requested format
        return send_file(file_path, as_attachment=True, download_name=f"{rigging_preset}_avatar.{file_type}")
    
    except Exception as e:
        # Handle errors in export process
        return {"error": str(e)}, 400  
    
# api.py



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

    new_outfit = SavedOutfit(
        user_id=user_id,
        name=name,
        file=file,
        style=style
    )
    db.session.add(new_outfit)
    db.session.commit()

    return jsonify({"message": "Outfit saved successfully"}), 200

@api.route("/user-outfits", methods=["GET"])
@jwt_required()
def get_user_outfits():
    user_id = get_jwt_identity()
    outfits = Outfit.query.filter_by(user_id=user_id).all()
    return jsonify([o.serialize() for o in outfits]), 200

@api.route("/api/my-outfits", methods=["GET"])
@jwt_required()
def get_my_outfits():
    user_id = get_jwt_identity()

    outfits = SavedOutfit.query.filter_by(user_id=user_id).all()

    outfit_list = [
        {
            "id": outfit.id,
            "name": outfit.name,
            "file": outfit.file,
            "style": outfit.style
        }
        for outfit in outfits
    ]

    return jsonify({"outfits": outfit_list}), 200

@api.route("/api/delete-outfit/<int:id>", methods=["DELETE"])
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

@api.route("/api/favorite-outfit/<int:id>", methods=["POST"])
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

    # 1. Validate user avatar
    avatar = Avatar.query.get(avatar_id)
    if not avatar or avatar.user_id != user_id:
        return {"error": "Avatar not found or unauthorized."}, 404

    # 2. Define paths
    avatar_path = os.path.join("static", "uploads", avatar.filename)
    outfit_path = os.path.join("static", "outfits", outfit_file)

    if not os.path.exists(avatar_path) or not os.path.exists(outfit_path):
        return {"error": "Avatar or outfit file missing."}, 400

    try:
        # 3. Load both models (assume GLB format for simplicity)
        avatar_mesh = trimesh.load(avatar_path)
        outfit_mesh = trimesh.load(outfit_path)

        # 4. Merge them into a single scene
        combined_scene = trimesh.Scene()
        combined_scene.add_geometry(avatar_mesh, node_name="avatar")
        combined_scene.add_geometry(outfit_mesh, node_name="outfit")

        # 5. Export to GLB
        with tempfile.NamedTemporaryFile(delete=False, suffix=".glb") as tmp_file:
            combined_scene.export(tmp_file.name)
            return send_file(tmp_file.name, as_attachment=True, download_name="combined_avatar.glb")

    except Exception as e:
        print("[Export Error]", e)
        return {"error": "Failed to export combined model."}, 500


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
    head_filename = data.get("head_filename")         # safer than full path
    body_template = data.get("body_template")         # e.g., "slim.glb"
    user_id = data.get("user_id")

    if not head_filename or not body_template or not user_id:
        return jsonify({"error": "Missing required fields"}), 400

    head_path = os.path.join("static", "uploads", head_filename)
    body_path = os.path.join("static", "bodies", body_template)

    if not os.path.exists(head_path):
        return jsonify({"error": "Head file not found"}), 404
    if not os.path.exists(body_path):
        return jsonify({"error": "Body template not found"}), 404

    # Ensure exports folder exists
    export_folder = os.path.join("static", "exports")
    os.makedirs(export_folder, exist_ok=True)

    output_filename = f"merged_{uuid.uuid4().hex}.glb"
    output_path = os.path.join(export_folder, output_filename)

    try:
        merged_path = merge_head_and_body(head_path, body_path, output_path)

        # Save to DB
        avatar = Avatar(
            user_id=user_id,
            avatar_url="/" + merged_path.replace("\\", "/"),  # normalize Windows paths
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

        # Save each view file
        filenames = {}
        for view in required_views:
            file = files[view]
            filename = f"{view}_{uuid.uuid4().hex}_{secure_filename(file.filename)}"
            save_path = os.path.join(UPLOAD_FOLDER, filename)
            file.save(save_path)
            filenames[view] = save_path

        # Generate mesh
        output_path = generate_mesh_from_views(
            front_path=filenames['front'],
            left_path=filenames['left'],
            right_path=filenames['right'],
            output_dir=OUTPUT_FOLDER
        )

        return jsonify({
            "message": "✅ 3D mesh generated from multiple views",
            "mesh_url": "/" + output_path.replace("\\", "/")
        })

    except Exception as e:
        print("[❌ ERROR]", str(e))
        return jsonify({"error": "Failed to generate mesh"}), 500
    
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
        selfie_url=data.get('selfie_url')  # optional
    )
    db.session.add(new_avatar)
    db.session.commit()

    return jsonify({"message": "Avatar customization saved", "avatar_id": new_avatar.id}), 200


if __name__ == "__main__":
    app.run(debug=True)