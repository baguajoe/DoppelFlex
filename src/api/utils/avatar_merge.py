# /api/utils/avatar_merge.py

import trimesh

def merge_head_and_body(head_path, body_path, output_path="static/exports/full_avatar.glb"):
    head = trimesh.load(head_path)
    body = trimesh.load(body_path)

    # Auto-align head to neck using bounding boxes
    head_bbox = head.bounds
    body_bbox = body.bounds

    # Get top of body and bottom of head
    body_top_z = body_bbox[1][2]
    head_bottom_z = head_bbox[0][2]

    # Compute vertical offset
    offset_z = body_top_z - head_bottom_z

    # Translate head upward
    head.apply_translation([0, 0, offset_z])

    # Combine into one scene
    scene = trimesh.Scene()
    scene.add_geometry(body)
    scene.add_geometry(head)

    # Export merged mesh
    scene.export(output_path)
    return output_path
