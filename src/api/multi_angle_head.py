# src/api/multi_angle_head.py
# Multi-angle head generation
# Front photo: face landmarks + skin color + depth
# Side photos: profile silhouette + ear position + jaw depth
# Merges all data into one accurate head deformation

import numpy as np
import cv2
import mediapipe as mp


def extract_profile_landmarks(image_path):
    """
    Extract profile information from a side-view photo.
    Uses MediaPipe face mesh on profile (works at angles up to ~70°).
    Also extracts silhouette contour for skull shape.

    Returns:
        dict with profile data or None if face not detected
    """
    img = cv2.imread(image_path)
    if img is None:
        return None

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = img.shape[:2]

    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.3,  # Lower threshold for profiles
    )

    results = face_mesh.process(img_rgb)

    if not results.multi_face_landmarks:
        # Try with face detection as fallback for extreme profiles
        print("[MultiAngle] No landmarks from profile, using silhouette only")
        return _extract_silhouette_only(img, img_rgb)

    landmarks = results.multi_face_landmarks[0]

    # Extract key profile measurements
    profile_data = {
        "has_landmarks": True,
        "landmarks": landmarks,
        "image_shape": img.shape,
    }

    # Nose projection depth (how far nose sticks out)
    nose_tip = landmarks.landmark[1]
    nose_bridge = landmarks.landmark[6]
    profile_data["nose_depth"] = abs(nose_tip.z - nose_bridge.z)

    # Chin projection
    chin = landmarks.landmark[152]
    neck_point = landmarks.landmark[10]
    profile_data["chin_depth"] = abs(chin.z)

    # Forehead slope
    forehead_top = landmarks.landmark[10]
    brow = landmarks.landmark[107]
    profile_data["forehead_slope"] = forehead_top.z - brow.z

    # Ear position (if visible — landmarks 234, 454)
    left_ear = landmarks.landmark[234]
    right_ear = landmarks.landmark[454]
    profile_data["ear_depth"] = min(left_ear.z, right_ear.z)

    # Jaw angle
    jaw_left = landmarks.landmark[172]
    jaw_right = landmarks.landmark[397]
    profile_data["jaw_width"] = abs(jaw_left.x - jaw_right.x)

    # Extract profile silhouette
    profile_data["silhouette"] = _extract_face_silhouette(img, landmarks, h, w)

    return profile_data


def _extract_silhouette_only(img, img_rgb):
    """Fallback: extract head silhouette from image when landmarks fail."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Edge detection for head outline
    edges = cv2.Canny(blurred, 30, 100)

    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # Largest contour is likely the head
    largest = max(contours, key=cv2.contourArea)
    h, w = img.shape[:2]

    # Normalize contour points
    silhouette = largest.reshape(-1, 2).astype(float)
    silhouette[:, 0] /= w
    silhouette[:, 1] /= h

    return {
        "has_landmarks": False,
        "silhouette": silhouette.tolist(),
    }


def _extract_face_silhouette(img, landmarks, h, w):
    """Extract the face outline contour from landmarks."""
    # Face oval landmark indices
    oval_indices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361,
                    288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
                    150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54,
                    103, 67, 109]

    points = []
    for idx in oval_indices:
        lm = landmarks.landmark[idx]
        points.append([lm.x, lm.y, lm.z])

    return points


def merge_multi_angle_data(front_landmarks, front_shape,
                           left_profile=None, right_profile=None):
    """
    Merge data from multiple angles into unified deformation parameters.

    Args:
        front_landmarks: MediaPipe landmarks from front photo
        front_shape: Image shape of front photo
        left_profile: Profile data dict from left side photo (or None)
        right_profile: Profile data dict from right side photo (or None)

    Returns:
        dict of deformation parameters for head_mesh_generator
    """
    params = {
        "nose_depth_scale": 1.0,
        "chin_depth_scale": 1.0,
        "forehead_slope_scale": 1.0,
        "jaw_width_scale": 1.0,
        "ear_offset": 0.0,
        "skull_width_scale": 1.0,
        "has_side_data": False,
    }

    profiles = []
    if left_profile and left_profile.get("has_landmarks"):
        profiles.append(left_profile)
    if right_profile and right_profile.get("has_landmarks"):
        profiles.append(right_profile)

    if not profiles:
        return params

    params["has_side_data"] = True

    # Average profile measurements
    nose_depths = [p["nose_depth"] for p in profiles if "nose_depth" in p]
    chin_depths = [p["chin_depth"] for p in profiles if "chin_depth" in p]
    forehead_slopes = [p["forehead_slope"] for p in profiles if "forehead_slope" in p]
    jaw_widths = [p["jaw_width"] for p in profiles if "jaw_width" in p]
    ear_depths = [p["ear_depth"] for p in profiles if "ear_depth" in p]

    # Convert to scale factors (relative to defaults)
    if nose_depths:
        avg_nose = np.mean(nose_depths)
        params["nose_depth_scale"] = 1.0 + (avg_nose - 0.05) * 5  # Scale around baseline

    if chin_depths:
        avg_chin = np.mean(chin_depths)
        params["chin_depth_scale"] = 1.0 + (avg_chin - 0.03) * 4

    if forehead_slopes:
        avg_slope = np.mean(forehead_slopes)
        params["forehead_slope_scale"] = 1.0 + avg_slope * 3

    if jaw_widths:
        avg_jaw = np.mean(jaw_widths)
        params["jaw_width_scale"] = avg_jaw / 0.3  # Normalize to expected width

    if ear_depths:
        avg_ear = np.mean(ear_depths)
        params["ear_offset"] = avg_ear * 0.05

    # Skull width from profile silhouettes
    for p in profiles:
        if "silhouette" in p and p["silhouette"]:
            sil = np.array(p["silhouette"])
            if len(sil) > 0 and len(sil[0]) >= 3:
                z_range = max(s[2] for s in sil) - min(s[2] for s in sil)
                params["skull_width_scale"] = 1.0 + (z_range - 0.15) * 2

    return params


def apply_profile_deformation(vertices, profile_params):
    """
    Apply profile-derived deformations to the head mesh.
    This runs after the front landmark deformation to refine depth.

    Args:
        vertices: Nx3 array of head mesh vertices
        profile_params: dict from merge_multi_angle_data

    Returns:
        Modified vertices array
    """
    if not profile_params.get("has_side_data"):
        return vertices

    deformed = vertices.copy()
    head_center_y = 0.85  # Approximate head center Y

    for vi in range(len(vertices)):
        v = vertices[vi]

        # Only modify the head area (not neck)
        if v[1] < head_center_y - 0.15:
            continue

        # Height relative to head center (for region-based scaling)
        rel_y = (v[1] - head_center_y) / 0.15

        # Nose region (front, middle height)
        is_nose = v[2] > 0.08 and abs(rel_y - 0.1) < 0.3 and abs(v[0]) < 0.04
        if is_nose:
            deformed[vi, 2] *= profile_params["nose_depth_scale"]

        # Chin region (front-bottom)
        is_chin = v[2] > 0.02 and rel_y < -0.5
        if is_chin:
            deformed[vi, 2] *= profile_params["chin_depth_scale"]

        # Forehead (front-top)
        is_forehead = v[2] > 0.04 and rel_y > 0.4
        if is_forehead:
            deformed[vi, 2] *= profile_params["forehead_slope_scale"]

        # Jaw width
        is_jaw = abs(rel_y + 0.3) < 0.3 and abs(v[0]) > 0.06
        if is_jaw:
            deformed[vi, 0] *= profile_params["jaw_width_scale"]

        # Ear area (sides)
        is_ear = abs(v[0]) > 0.09 and abs(rel_y) < 0.2
        if is_ear:
            deformed[vi, 2] += profile_params["ear_offset"]

        # Overall skull width from back
        if v[2] < -0.02:
            deformed[vi, 2] *= profile_params["skull_width_scale"]

    return deformed