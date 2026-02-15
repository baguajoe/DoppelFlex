# src/api/auto_rig_routes.py
# 3D Auto-Rigging endpoint
# Takes an unrigged mesh (GLB/OBJ), estimates skeleton placement from geometry,
# applies a standard Mixamo-compatible humanoid skeleton with proximity-based skinning weights

import os
import json
import tempfile
import numpy as np
from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import jwt_required, get_jwt_identity

auto_rig_api = Blueprint("auto_rig_api", __name__)

# Standard humanoid skeleton definition (Mixamo-compatible bone names)
HUMANOID_SKELETON = {
    "Hips": {"parent": None, "pos_ratio": [0.5, 0.45, 0.5]},
    "Spine": {"parent": "Hips", "pos_ratio": [0.5, 0.52, 0.5]},
    "Spine1": {"parent": "Spine", "pos_ratio": [0.5, 0.58, 0.5]},
    "Spine2": {"parent": "Spine1", "pos_ratio": [0.5, 0.64, 0.5]},
    "Neck": {"parent": "Spine2", "pos_ratio": [0.5, 0.78, 0.5]},
    "Head": {"parent": "Neck", "pos_ratio": [0.5, 0.85, 0.5]},
    "HeadTop_End": {"parent": "Head", "pos_ratio": [0.5, 0.98, 0.5]},
    # Left arm
    "LeftShoulder": {"parent": "Spine2", "pos_ratio": [0.58, 0.72, 0.5]},
    "LeftArm": {"parent": "LeftShoulder", "pos_ratio": [0.72, 0.70, 0.5]},
    "LeftForeArm": {"parent": "LeftArm", "pos_ratio": [0.82, 0.55, 0.5]},
    "LeftHand": {"parent": "LeftForeArm", "pos_ratio": [0.90, 0.42, 0.5]},
    # Right arm
    "RightShoulder": {"parent": "Spine2", "pos_ratio": [0.42, 0.72, 0.5]},
    "RightArm": {"parent": "RightShoulder", "pos_ratio": [0.28, 0.70, 0.5]},
    "RightForeArm": {"parent": "RightArm", "pos_ratio": [0.18, 0.55, 0.5]},
    "RightHand": {"parent": "RightForeArm", "pos_ratio": [0.10, 0.42, 0.5]},
    # Left leg
    "LeftUpLeg": {"parent": "Hips", "pos_ratio": [0.58, 0.42, 0.5]},
    "LeftLeg": {"parent": "LeftUpLeg", "pos_ratio": [0.58, 0.24, 0.5]},
    "LeftFoot": {"parent": "LeftLeg", "pos_ratio": [0.58, 0.04, 0.55]},
    "LeftToeBase": {"parent": "LeftFoot", "pos_ratio": [0.58, 0.01, 0.7]},
    # Right leg
    "RightUpLeg": {"parent": "Hips", "pos_ratio": [0.42, 0.42, 0.5]},
    "RightLeg": {"parent": "RightUpLeg", "pos_ratio": [0.42, 0.24, 0.5]},
    "RightFoot": {"parent": "RightLeg", "pos_ratio": [0.42, 0.04, 0.55]},
    "RightToeBase": {"parent": "RightFoot", "pos_ratio": [0.42, 0.01, 0.7]},
}


def estimate_skeleton_from_mesh(vertices):
    """
    Estimate bone positions from mesh bounding box.
    Places bones proportionally within the mesh extents.
    """
    verts = np.array(vertices)
    bbox_min = verts.min(axis=0)
    bbox_max = verts.max(axis=0)
    bbox_size = bbox_max - bbox_min

    bones = {}
    for bone_name, bone_def in HUMANOID_SKELETON.items():
        ratio = bone_def["pos_ratio"]
        pos = bbox_min + bbox_size * np.array(ratio)
        bones[bone_name] = {
            "position": pos.tolist(),
            "parent": bone_def["parent"],
        }

    return bones


def compute_skinning_weights(vertices, bones, max_influences=4):
    """
    Compute per-vertex skinning weights based on proximity to bones.
    Each vertex gets weights for its closest N bones.
    """
    verts = np.array(vertices)
    bone_names = list(bones.keys())
    bone_positions = np.array([bones[name]["position"] for name in bone_names])
    num_verts = len(verts)
    num_bones = len(bone_names)

    # Compute distances from each vertex to each bone
    # Shape: (num_verts, num_bones)
    distances = np.zeros((num_verts, num_bones))
    for i, bone_pos in enumerate(bone_positions):
        diff = verts - bone_pos
        distances[:, i] = np.sqrt(np.sum(diff ** 2, axis=1))

    # For each vertex, find closest N bones and compute weights
    weights = np.zeros((num_verts, num_bones))

    for v in range(num_verts):
        # Get indices of closest bones
        closest = np.argsort(distances[v])[:max_influences]

        # Inverse distance weighting
        dists = distances[v, closest]
        dists = np.maximum(dists, 1e-6)  # Avoid division by zero
        inv_dists = 1.0 / dists

        # Normalize
        total = inv_dists.sum()
        if total > 0:
            weights[v, closest] = inv_dists / total

    return weights, bone_names


def build_rigged_gltf(vertices, faces, bones, weights, bone_names, normals=None):
    """
    Build a glTF 2.0 JSON structure with skeleton and skinning.
    Returns a dict that can be serialized to .gltf
    """
    import struct
    import base64

    num_verts = len(vertices)
    verts = np.array(vertices, dtype=np.float32)
    norms = np.array(normals, dtype=np.float32) if normals is not None else np.zeros_like(verts)
    indices = np.array(faces, dtype=np.uint32).flatten()
    num_bones = len(bone_names)

    # Compute joint indices and weights per vertex (max 4 influences)
    joint_indices = np.zeros((num_verts, 4), dtype=np.uint16)
    joint_weights = np.zeros((num_verts, 4), dtype=np.float32)

    for v in range(num_verts):
        nonzero = np.nonzero(weights[v])[0]
        sorted_bones = nonzero[np.argsort(-weights[v, nonzero])][:4]

        for j, bone_idx in enumerate(sorted_bones):
            joint_indices[v, j] = bone_idx
            joint_weights[v, j] = weights[v, bone_idx]

        # Normalize
        total = joint_weights[v].sum()
        if total > 0:
            joint_weights[v] /= total

    # Build binary buffer
    buffer_data = b""

    # Positions
    pos_offset = len(buffer_data)
    buffer_data += verts.tobytes()
    pos_length = len(buffer_data) - pos_offset

    # Normals
    norm_offset = len(buffer_data)
    buffer_data += norms.tobytes()
    norm_length = len(buffer_data) - norm_offset

    # Indices
    idx_offset = len(buffer_data)
    buffer_data += indices.astype(np.uint32).tobytes()
    idx_length = len(buffer_data) - idx_offset

    # Joint indices (UNSIGNED_SHORT)
    joints_offset = len(buffer_data)
    buffer_data += joint_indices.tobytes()
    joints_length = len(buffer_data) - joints_offset

    # Joint weights (FLOAT)
    weights_offset = len(buffer_data)
    buffer_data += joint_weights.tobytes()
    weights_length = len(buffer_data) - weights_offset

    # Inverse bind matrices (identity-based for now)
    ibm_data = np.zeros((num_bones, 16), dtype=np.float32)
    for i, bone_name in enumerate(bone_names):
        pos = bones[bone_name]["position"]
        # Translation part of inverse matrix
        ibm = np.eye(4, dtype=np.float32)
        ibm[0, 3] = -pos[0]
        ibm[1, 3] = -pos[1]
        ibm[2, 3] = -pos[2]
        ibm_data[i] = ibm.flatten()

    ibm_offset = len(buffer_data)
    buffer_data += ibm_data.tobytes()
    ibm_length = len(buffer_data) - ibm_offset

    # Encode as data URI
    b64_data = base64.b64encode(buffer_data).decode("ascii")

    # Build skeleton node hierarchy
    nodes = []
    bone_node_offset = 2  # mesh node=0, skin root node=1

    # Node 0: mesh
    # Node 1: skeleton root (Hips)
    # Node 2+: bones

    bone_to_node = {}
    joint_node_indices = []

    for i, bone_name in enumerate(bone_names):
        node_idx = bone_node_offset + i
        bone_to_node[bone_name] = node_idx
        joint_node_indices.append(node_idx)

    # Build bone nodes
    bone_nodes = []
    for i, bone_name in enumerate(bone_names):
        pos = bones[bone_name]["position"]
        parent = bones[bone_name]["parent"]

        # Position relative to parent
        if parent and parent in bones:
            parent_pos = bones[parent]["position"]
            rel_pos = [pos[0] - parent_pos[0], pos[1] - parent_pos[1], pos[2] - parent_pos[2]]
        else:
            rel_pos = pos

        # Find children
        children = []
        for other_name in bone_names:
            if bones[other_name]["parent"] == bone_name:
                children.append(bone_to_node[other_name])

        node = {"name": bone_name, "translation": rel_pos}
        if children:
            node["children"] = children

        bone_nodes.append(node)

    # Mesh node
    mesh_node = {"name": "AvatarMesh", "mesh": 0, "skin": 0}

    # Root skeleton node (Hips)
    root_bone_idx = bone_to_node.get("Hips", bone_node_offset)

    # All nodes
    all_nodes = [mesh_node] + bone_nodes

    # Bounding box
    pos_min = verts.min(axis=0).tolist()
    pos_max = verts.max(axis=0).tolist()

    gltf = {
        "asset": {"version": "2.0", "generator": "DoppelFlex Auto-Rigger"},
        "scene": 0,
        "scenes": [{"nodes": [0, root_bone_idx]}],
        "nodes": all_nodes,
        "meshes": [{
            "name": "AvatarMesh",
            "primitives": [{
                "attributes": {
                    "POSITION": 0,
                    "NORMAL": 1,
                    "JOINTS_0": 3,
                    "WEIGHTS_0": 4,
                },
                "indices": 2,
                "material": 0,
            }]
        }],
        "materials": [{
            "name": "AvatarMaterial",
            "pbrMetallicRoughness": {
                "baseColorFactor": [0.8, 0.7, 0.6, 1.0],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.8,
            }
        }],
        "skins": [{
            "name": "AvatarSkin",
            "inverseBindMatrices": 5,
            "skeleton": root_bone_idx,
            "joints": joint_node_indices,
        }],
        "accessors": [
            # 0: positions
            {
                "bufferView": 0, "componentType": 5126, "count": num_verts,
                "type": "VEC3", "min": pos_min, "max": pos_max,
            },
            # 1: normals
            {
                "bufferView": 1, "componentType": 5126, "count": num_verts,
                "type": "VEC3",
            },
            # 2: indices
            {
                "bufferView": 2, "componentType": 5125, "count": len(indices),
                "type": "SCALAR",
            },
            # 3: joint indices
            {
                "bufferView": 3, "componentType": 5123, "count": num_verts,
                "type": "VEC4",
            },
            # 4: joint weights
            {
                "bufferView": 4, "componentType": 5126, "count": num_verts,
                "type": "VEC4",
            },
            # 5: inverse bind matrices
            {
                "bufferView": 5, "componentType": 5126, "count": num_bones,
                "type": "MAT4",
            },
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": pos_offset, "byteLength": pos_length, "target": 34962},
            {"buffer": 0, "byteOffset": norm_offset, "byteLength": norm_length, "target": 34962},
            {"buffer": 0, "byteOffset": idx_offset, "byteLength": idx_length, "target": 34963},
            {"buffer": 0, "byteOffset": joints_offset, "byteLength": joints_length, "target": 34962},
            {"buffer": 0, "byteOffset": weights_offset, "byteLength": weights_length, "target": 34962},
            {"buffer": 0, "byteOffset": ibm_offset, "byteLength": ibm_length},
        ],
        "buffers": [{
            "uri": f"data:application/octet-stream;base64,{b64_data}",
            "byteLength": len(buffer_data),
        }],
    }

    return gltf


@auto_rig_api.route("/api/auto-rig", methods=["POST"])
@jwt_required()
def auto_rig_mesh():
    """
    Auto-rig an uploaded mesh file.
    Accepts: GLB, GLTF, OBJ via multipart form upload
    Returns: Rigged GLTF JSON with embedded skeleton and skinning weights
    """
    user_id = get_jwt_identity()

    if "mesh" not in request.files:
        return jsonify({"error": "No mesh file provided"}), 400

    file = request.files["mesh"]
    filename = file.filename.lower()

    try:
        import trimesh

        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1], delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        # Load mesh
        mesh = trimesh.load(tmp_path, force="mesh")
        os.unlink(tmp_path)

        if mesh is None or len(mesh.vertices) == 0:
            return jsonify({"error": "Could not parse mesh or mesh is empty"}), 400

        vertices = mesh.vertices.tolist()
        faces = mesh.faces.tolist()
        normals = mesh.vertex_normals.tolist() if hasattr(mesh, "vertex_normals") else None

        # Estimate skeleton positions from mesh geometry
        bones = estimate_skeleton_from_mesh(vertices)

        # Compute skinning weights
        weights, bone_names = compute_skinning_weights(vertices, bones)

        # Build rigged glTF
        gltf = build_rigged_gltf(vertices, faces, bones, weights, bone_names, normals)

        return jsonify({
            "success": True,
            "gltf": gltf,
            "bone_count": len(bone_names),
            "vertex_count": len(vertices),
            "face_count": len(faces),
            "bones": bone_names,
        })

    except ImportError:
        return jsonify({
            "error": "trimesh not installed. Run: pip install trimesh",
        }), 500
    except Exception as e:
        return jsonify({"error": f"Auto-rig failed: {str(e)}"}), 500


@auto_rig_api.route("/api/auto-rig/preview", methods=["POST"])
@jwt_required()
def auto_rig_preview():
    """
    Preview skeleton estimation without full rigging.
    Returns bone positions so frontend can overlay skeleton on mesh.
    """
    user_id = get_jwt_identity()

    if "mesh" not in request.files:
        return jsonify({"error": "No mesh file provided"}), 400

    file = request.files["mesh"]

    try:
        import trimesh

        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(file.filename)[1], delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        mesh = trimesh.load(tmp_path, force="mesh")
        os.unlink(tmp_path)

        bones = estimate_skeleton_from_mesh(mesh.vertices.tolist())

        # Return skeleton for preview
        skeleton_data = {}
        for name, data in bones.items():
            skeleton_data[name] = {
                "position": data["position"],
                "parent": data["parent"],
            }

        return jsonify({
            "success": True,
            "skeleton": skeleton_data,
            "bbox": {
                "min": mesh.vertices.min(axis=0).tolist(),
                "max": mesh.vertices.max(axis=0).tolist(),
            },
        })

    except Exception as e:
        return jsonify({"error": f"Preview failed: {str(e)}"}), 500