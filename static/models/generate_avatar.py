import numpy as np
import json
import struct
import os

bones = {
    "Hips": {"pos": [0, 1.0, 0], "parent": None},
    "Spine": {"pos": [0, 1.15, 0], "parent": "Hips"},
    "Spine1": {"pos": [0, 1.3, 0], "parent": "Spine"},
    "Neck": {"pos": [0, 1.45, 0], "parent": "Spine1"},
    "Head": {"pos": [0, 1.55, 0], "parent": "Neck"},
    "LeftUpperArm": {"pos": [-0.22, 1.4, 0], "parent": "Spine1"},
    "LeftLowerArm": {"pos": [-0.42, 1.4, 0], "parent": "LeftUpperArm"},
    "LeftHand": {"pos": [-0.6, 1.4, 0], "parent": "LeftLowerArm"},
    "RightUpperArm": {"pos": [0.22, 1.4, 0], "parent": "Spine1"},
    "RightLowerArm": {"pos": [0.42, 1.4, 0], "parent": "RightUpperArm"},
    "RightHand": {"pos": [0.6, 1.4, 0], "parent": "RightLowerArm"},
    "LeftUpperLeg": {"pos": [-0.1, 0.9, 0], "parent": "Hips"},
    "LeftLowerLeg": {"pos": [-0.1, 0.5, 0], "parent": "LeftUpperLeg"},
    "LeftFoot": {"pos": [-0.1, 0.1, 0], "parent": "LeftLowerLeg"},
    "RightUpperLeg": {"pos": [0.1, 0.9, 0], "parent": "Hips"},
    "RightLowerLeg": {"pos": [0.1, 0.5, 0], "parent": "RightUpperLeg"},
    "RightFoot": {"pos": [0.1, 0.1, 0], "parent": "RightLowerLeg"},
}
bone_names = list(bones.keys())
vertices, indices, joints, weights = [], [], [], []

def add_box(cx, cy, cz, sx, sy, sz, bone_idx):
    base = len(vertices)
    corners = [
        [cx-sx/2, cy-sy/2, cz-sz/2], [cx+sx/2, cy-sy/2, cz-sz/2],
        [cx+sx/2, cy+sy/2, cz-sz/2], [cx-sx/2, cy+sy/2, cz-sz/2],
        [cx-sx/2, cy-sy/2, cz+sz/2], [cx+sx/2, cy-sy/2, cz+sz/2],
        [cx+sx/2, cy+sy/2, cz+sz/2], [cx-sx/2, cy+sy/2, cz+sz/2],
    ]
    for c in corners:
        vertices.append(c)
        joints.append([bone_idx, 0, 0, 0])
        weights.append([1.0, 0, 0, 0])
    for idx in [0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 2,6,7,2,7,3, 0,3,7,0,7,4, 1,5,6,1,6,2]:
        indices.append(base + idx)

# Head
add_box(0, 1.6, 0, 0.16, 0.2, 0.18, bone_names.index("Head"))
# Neck  
add_box(0, 1.48, 0, 0.08, 0.08, 0.08, bone_names.index("Neck"))
# Torso (Spine1)
add_box(0, 1.25, 0, 0.32, 0.3, 0.16, bone_names.index("Spine1"))
# Hips
add_box(0, 0.95, 0, 0.28, 0.15, 0.14, bone_names.index("Hips"))

# Left Arm
add_box(-0.32, 1.4, 0, 0.18, 0.08, 0.08, bone_names.index("LeftUpperArm"))
add_box(-0.52, 1.4, 0, 0.18, 0.07, 0.07, bone_names.index("LeftLowerArm"))
add_box(-0.68, 1.4, 0, 0.12, 0.05, 0.03, bone_names.index("LeftHand"))

# Right Arm
add_box(0.32, 1.4, 0, 0.18, 0.08, 0.08, bone_names.index("RightUpperArm"))
add_box(0.52, 1.4, 0, 0.18, 0.07, 0.07, bone_names.index("RightLowerArm"))
add_box(0.68, 1.4, 0, 0.12, 0.05, 0.03, bone_names.index("RightHand"))

# Left Leg
add_box(-0.1, 0.72, 0, 0.1, 0.35, 0.1, bone_names.index("LeftUpperLeg"))
add_box(-0.1, 0.32, 0, 0.09, 0.35, 0.09, bone_names.index("LeftLowerLeg"))
add_box(-0.1, 0.05, 0.04, 0.1, 0.1, 0.18, bone_names.index("LeftFoot"))

# Right Leg
add_box(0.1, 0.72, 0, 0.1, 0.35, 0.1, bone_names.index("RightUpperLeg"))
add_box(0.1, 0.32, 0, 0.09, 0.35, 0.09, bone_names.index("RightLowerLeg"))
add_box(0.1, 0.05, 0.04, 0.1, 0.1, 0.18, bone_names.index("RightFoot"))

vertices = np.array(vertices, dtype=np.float32)
indices = np.array(indices, dtype=np.uint16)
joints = np.array(joints, dtype=np.uint8)
weights = np.array(weights, dtype=np.float32)

# Simple normals
normals = np.zeros_like(vertices)
for i in range(len(vertices)):
    n = vertices[i] - [0, 1.0, 0]
    l = np.linalg.norm(n)
    normals[i] = n / l if l > 0 else [0, 1, 0]
normals = normals.astype(np.float32)

# Inverse bind matrices
ibm = []
for bn in bone_names:
    pos = bones[bn]["pos"]
    mat = np.eye(4, dtype=np.float32)
    mat[0,3], mat[1,3], mat[2,3] = -pos[0], -pos[1], -pos[2]
    ibm.append(mat)
ibm = np.array(ibm, dtype=np.float32)

# Build GLTF
gltf = {
    "asset": {"version": "2.0", "generator": "DoppelFlex"},
    "scene": 0,
    "scenes": [{"nodes": [0]}],
    "nodes": [],
    "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "JOINTS_0": 2, "WEIGHTS_0": 3}, "indices": 4}]}],
    "skins": [{"inverseBindMatrices": 5, "joints": list(range(len(bone_names))), "skeleton": 0}],
    "accessors": [],
    "bufferViews": [],
    "buffers": []
}

for i, bn in enumerate(bone_names):
    b = bones[bn]
    node = {"name": bn}
    if b["parent"] is None:
        node["translation"] = b["pos"]
    else:
        pp = bones[b["parent"]]["pos"]
        node["translation"] = [b["pos"][j] - pp[j] for j in range(3)]
    children = [j for j, n in enumerate(bone_names) if bones[n]["parent"] == bn]
    if children:
        node["children"] = children
    gltf["nodes"].append(node)

gltf["nodes"][0]["mesh"] = 0
gltf["nodes"][0]["skin"] = 0

buf = b''
def add_acc(data, ct, at, tgt=None):
    global buf
    db = data.tobytes()
    pad = (4 - len(buf) % 4) % 4
    buf += b'\x00' * pad
    bo = len(buf)
    buf += db
    bv = {"buffer": 0, "byteOffset": bo, "byteLength": len(db)}
    if tgt:
        bv["target"] = tgt
    gltf["bufferViews"].append(bv)
    acc = {"bufferView": len(gltf["bufferViews"]) - 1, "componentType": ct, "count": len(data), "type": at}
    if at == "VEC3":
        acc["min"], acc["max"] = data.min(axis=0).tolist(), data.max(axis=0).tolist()
    elif at == "SCALAR":
        acc["min"], acc["max"] = [int(data.min())], [int(data.max())]
    gltf["accessors"].append(acc)

add_acc(vertices, 5126, "VEC3", 34962)
add_acc(normals, 5126, "VEC3", 34962)
add_acc(joints, 5121, "VEC4", 34962)
add_acc(weights, 5126, "VEC4", 34962)
add_acc(indices, 5123, "SCALAR", 34963)
add_acc(ibm.reshape(-1, 16), 5126, "MAT4")
gltf["buffers"].append({"byteLength": len(buf)})

gj = json.dumps(gltf, separators=(',', ':')).encode()
gj += b' ' * ((4 - len(gj) % 4) % 4)
buf += b'\x00' * ((4 - len(buf) % 4) % 4)

with open("static/models/rigged_avatar.glb", "wb") as f:
    f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(gj) + 8 + len(buf)))
    f.write(struct.pack('<II', len(gj), 0x4E4F534A))
    f.write(gj)
    f.write(struct.pack('<II', len(buf), 0x004E4942))
    f.write(buf)

print("✅ Created complete avatar with", len(bone_names), "bones")
print("   Body parts: Head, Neck, Torso, Hips, Arms (x2), Legs (x2), Hands, Feet")
