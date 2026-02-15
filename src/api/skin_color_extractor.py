# src/api/skin_color_extractor.py
# Extract skin tone from selfie using MediaPipe face landmarks
# Samples from reliable skin regions (cheeks, forehead, chin)
# Avoids eyes, lips, eyebrows, and hair for accurate results

import numpy as np
import cv2


# MediaPipe face landmark indices for safe skin sampling regions
# These areas are reliably skin-colored on any face
SKIN_SAMPLE_REGIONS = {
    "left_cheek": [50, 101, 36, 205, 187, 123],
    "right_cheek": [280, 330, 266, 425, 411, 352],
    "forehead_center": [10, 151, 9, 8, 107, 336],
    "forehead_left": [54, 103, 67, 109, 10],
    "forehead_right": [284, 332, 297, 338, 10],
    "nose_bridge": [6, 197, 195, 5],
    "chin": [152, 377, 400, 378, 148, 176],
    "left_jaw": [132, 93, 234, 127],
    "right_jaw": [361, 323, 454, 356],
}

# Regions to AVOID (not skin-colored)
AVOID_REGIONS = {
    "left_eye": [33, 160, 158, 133, 153, 144, 163, 7, 246],
    "right_eye": [362, 385, 387, 263, 373, 380, 390, 249, 466],
    "lips": [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
             78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308],
    "left_brow": [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
    "right_brow": [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
}


def extract_skin_color(image_path, face_landmarks, image_shape):
    """
    Extract dominant skin color from a selfie.

    Args:
        image_path: Path to the image file
        face_landmarks: MediaPipe face landmarks object
        image_shape: (height, width, channels) of the image

    Returns:
        dict with:
            - hex: Skin color as hex string (#RRGGBB)
            - rgb: Skin color as [R, G, B] (0-255)
            - rgb_float: Skin color as [R, G, B] (0.0-1.0)
            - hsv: Skin color in HSV space
            - palette: List of 5 skin-related colors (lighter to darker)
            - confidence: How confident we are in the extraction (0-1)
    """
    img = cv2.imread(image_path)
    if img is None:
        return _default_skin_color()

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    h, w = image_shape[:2]

    # Collect pixel samples from skin regions
    skin_pixels = []

    for region_name, landmark_indices in SKIN_SAMPLE_REGIONS.items():
        region_pixels = _sample_region(img_rgb, face_landmarks, landmark_indices, h, w)
        skin_pixels.extend(region_pixels)

    if len(skin_pixels) < 10:
        print("[SkinColor] Warning: Too few skin pixels sampled")
        return _default_skin_color()

    skin_pixels = np.array(skin_pixels)

    # Filter outliers (remove very dark/bright pixels that might be shadows/highlights)
    brightness = skin_pixels.mean(axis=1)
    p10, p90 = np.percentile(brightness, [10, 90])
    mask = (brightness >= p10) & (brightness <= p90)
    filtered = skin_pixels[mask]

    if len(filtered) < 5:
        filtered = skin_pixels

    # Use median for robustness against shadows/specular highlights
    median_color = np.median(filtered, axis=0).astype(int)

    # Also compute via K-means for the dominant cluster
    try:
        from sklearn.cluster import KMeans
        kmeans = KMeans(n_clusters=3, n_init=5, random_state=42)
        kmeans.fit(filtered)

        # Pick the cluster with the most members
        labels, counts = np.unique(kmeans.labels_, return_counts=True)
        dominant_idx = labels[np.argmax(counts)]
        dominant_color = kmeans.cluster_centers_[dominant_idx].astype(int)

        # Blend median and dominant for stability
        final_color = (median_color * 0.4 + dominant_color * 0.6).astype(int)
    except ImportError:
        # sklearn not available, use median only
        final_color = median_color

    # Clamp
    final_color = np.clip(final_color, 0, 255)

    # Generate palette (5 shades from lighter to darker)
    palette = _generate_palette(final_color)

    # Convert to various formats
    hex_color = "#{:02x}{:02x}{:02x}".format(*final_color)
    rgb_float = (final_color / 255.0).tolist()

    # HSV for potential use
    hsv = cv2.cvtColor(np.uint8([[final_color]]), cv2.COLOR_RGB2HSV)[0][0]

    # Confidence based on sample count and variance
    variance = np.std(filtered, axis=0).mean()
    sample_score = min(len(filtered) / 100, 1.0)
    variance_score = max(0, 1.0 - variance / 60)
    confidence = (sample_score * 0.4 + variance_score * 0.6)

    return {
        "hex": hex_color,
        "rgb": final_color.tolist(),
        "rgb_float": [round(v, 4) for v in rgb_float],
        "hsv": hsv.tolist(),
        "palette": palette,
        "confidence": round(confidence, 3),
    }


def _sample_region(img_rgb, face_landmarks, landmark_indices, h, w):
    """Sample pixels from a region defined by landmark indices."""
    pixels = []

    # Get landmark pixel coordinates
    points = []
    for idx in landmark_indices:
        if idx >= len(face_landmarks.landmark):
            continue
        lm = face_landmarks.landmark[idx]
        px = int(lm.x * w)
        py = int(lm.y * h)
        points.append((px, py))

    if len(points) < 3:
        return pixels

    # Sample pixels within the convex hull of the landmarks
    points = np.array(points)
    center = points.mean(axis=0).astype(int)

    # Sample at landmark positions and between them
    for px, py in points:
        if 0 <= px < w and 0 <= py < h:
            pixels.append(img_rgb[py, px])

        # Sample midpoint to center
        mx = (px + center[0]) // 2
        my = (py + center[1]) // 2
        if 0 <= mx < w and 0 <= my < h:
            pixels.append(img_rgb[my, mx])

    # Sample center area
    radius = 3
    for dx in range(-radius, radius + 1):
        for dy in range(-radius, radius + 1):
            cx = center[0] + dx
            cy = center[1] + dy
            if 0 <= cx < w and 0 <= cy < h:
                pixels.append(img_rgb[cy, cx])

    return pixels


def _generate_palette(base_rgb):
    """Generate 5 skin-tone shades from the base color."""
    palette = []
    base = np.array(base_rgb, dtype=float)

    # Convert to HSV for better shade generation
    hsv = cv2.cvtColor(np.uint8([[base]]), cv2.COLOR_RGB2HSV)[0][0].astype(float)

    offsets = [-30, -15, 0, 15, 30]  # Lighter to darker

    for offset in offsets:
        h = hsv[0]
        s = np.clip(hsv[1] + offset * 0.3, 0, 255)
        v = np.clip(hsv[2] - offset, 0, 255)

        shade_hsv = np.uint8([[[int(h), int(s), int(v)]]])
        shade_rgb = cv2.cvtColor(shade_hsv, cv2.COLOR_HSV2RGB)[0][0]

        hex_shade = "#{:02x}{:02x}{:02x}".format(*shade_rgb)
        palette.append({
            "hex": hex_shade,
            "rgb": shade_rgb.tolist(),
        })

    return palette


def _default_skin_color():
    """Fallback skin color if extraction fails."""
    return {
        "hex": "#c8a07a",
        "rgb": [200, 160, 122],
        "rgb_float": [0.7843, 0.6275, 0.4784],
        "hsv": [22, 98, 200],
        "palette": [
            {"hex": "#e8c8a8", "rgb": [232, 200, 168]},
            {"hex": "#d8b492", "rgb": [216, 180, 146]},
            {"hex": "#c8a07a", "rgb": [200, 160, 122]},
            {"hex": "#b08c64", "rgb": [176, 140, 100]},
            {"hex": "#98784e", "rgb": [152, 120, 78]},
        ],
        "confidence": 0.0,
    }


def apply_skin_color_to_mesh(mesh, skin_rgb_float):
    """
    Apply skin color to a trimesh as vertex colors.

    Args:
        mesh: trimesh.Trimesh object
        skin_rgb_float: [R, G, B] values in 0.0-1.0 range

    Returns:
        Modified mesh with vertex colors
    """
    num_verts = len(mesh.vertices)
    r, g, b = [int(c * 255) for c in skin_rgb_float]

    # Create vertex colors array (RGBA)
    colors = np.full((num_verts, 4), [r, g, b, 255], dtype=np.uint8)

    # Slight color variation for realism
    noise = np.random.normal(0, 3, (num_verts, 3)).astype(int)
    colors[:, :3] = np.clip(colors[:, :3].astype(int) + noise, 0, 255).astype(np.uint8)

    mesh.visual.vertex_colors = colors
    return mesh