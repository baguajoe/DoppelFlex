# src/api/utils/body_template.py
# Body Template System - Attach face/head mesh to pre-rigged body

import os
import numpy as np
import trimesh
from scipy.spatial import cKDTree

# ============================================
# BODY TEMPLATE CONFIGURATION
# ============================================

# Standard humanoid bone names (Mixamo-compatible)
HUMANOID_BONES = {
    "hips": ["Hips", "mixamorig:Hips", "pelvis"],
    "spine": ["Spine", "mixamorig:Spine", "spine_01"],
    "spine1": ["Spine1", "mixamorig:Spine1", "spine_02"],
    "spine2": ["Spine2", "mixamorig:Spine2", "chest"],
    "neck": ["Neck", "mixamorig:Neck", "neck_01"],
    "head": ["Head", "mixamorig:Head", "head"],
    
    # Arms
    "left_shoulder": ["LeftShoulder", "mixamorig:LeftShoulder", "l_clavicle"],
    "left_arm": ["LeftArm", "mixamorig:LeftArm", "l_upper_arm"],
    "left_forearm": ["LeftForeArm", "mixamorig:LeftForeArm", "l_forearm"],
    "left_hand": ["LeftHand", "mixamorig:LeftHand", "l_hand"],
    
    "right_shoulder": ["RightShoulder", "mixamorig:RightShoulder", "r_clavicle"],
    "right_arm": ["RightArm", "mixamorig:RightArm", "r_upper_arm"],
    "right_forearm": ["RightForeArm", "mixamorig:RightForeArm", "r_forearm"],
    "right_hand": ["RightHand", "mixamorig:RightHand", "r_hand"],
    
    # Legs
    "left_upleg": ["LeftUpLeg", "mixamorig:LeftUpLeg", "l_thigh"],
    "left_leg": ["LeftLeg", "mixamorig:LeftLeg", "l_shin"],
    "left_foot": ["LeftFoot", "mixamorig:LeftFoot", "l_foot"],
    
    "right_upleg": ["RightUpLeg", "mixamorig:RightUpLeg", "r_thigh"],
    "right_leg": ["RightLeg", "mixamorig:RightLeg", "r_shin"],
    "right_foot": ["RightFoot", "mixamorig:RightFoot", "r_foot"],
}

# ============================================
# TEMPLATE MANAGEMENT
# ============================================

class BodyTemplateManager:
    """Manages pre-rigged body templates"""
    
    def __init__(self, templates_dir="static/templates"):
        self.templates_dir = templates_dir
        self.templates = {}
        self._load_templates()
    
    def _load_templates(self):
        """Load available body templates"""
        if not os.path.exists(self.templates_dir):
            os.makedirs(self.templates_dir, exist_ok=True)
            print(f"Created templates directory: {self.templates_dir}")
            return
        
        for filename in os.listdir(self.templates_dir):
            if filename.endswith((".glb", ".gltf", ".fbx")):
                name = os.path.splitext(filename)[0]
                self.templates[name] = os.path.join(self.templates_dir, filename)
                print(f"Loaded template: {name}")
    
    def get_template(self, name="default"):
        """Get a body template by name"""
        if name in self.templates:
            return self.templates[name]
        elif self.templates:
            # Return first available
            return list(self.templates.values())[0]
        return None
    
    def list_templates(self):
        """List available templates"""
        return list(self.templates.keys())


# ============================================
# MESH ALIGNMENT
# ============================================

def align_face_to_body(face_mesh, body_mesh, head_position=None):
    """
    Align a face mesh to fit on a body template's head position
    
    Args:
        face_mesh: trimesh.Trimesh of the face/head
        body_mesh: trimesh.Trimesh of the body template
        head_position: Optional (x, y, z) for head placement
    
    Returns: Transformed face mesh
    """
    # Get face mesh bounds
    face_bounds = face_mesh.bounds
    face_center = face_mesh.centroid
    face_height = face_bounds[1][1] - face_bounds[0][1]
    
    # Estimate head position on body (usually top ~15% of body)
    if head_position is None:
        body_bounds = body_mesh.bounds
        body_height = body_bounds[1][1] - body_bounds[0][1]
        head_y = body_bounds[1][1] - (body_height * 0.08)  # Top 8%
        head_position = [
            (body_bounds[0][0] + body_bounds[1][0]) / 2,  # Center X
            head_y,
            (body_bounds[0][2] + body_bounds[1][2]) / 2   # Center Z
        ]
    
    # Calculate scale factor (face should be ~12% of body height)
    body_bounds = body_mesh.bounds
    body_height = body_bounds[1][1] - body_bounds[0][1]
    target_face_height = body_height * 0.12
    scale_factor = target_face_height / face_height if face_height > 0 else 1.0
    
    # Create transformation
    # 1. Center at origin
    translation_to_origin = trimesh.transformations.translation_matrix(-face_center)
    
    # 2. Scale
    scale_matrix = trimesh.transformations.scale_matrix(scale_factor, [0, 0, 0])
    
    # 3. Move to head position
    translation_to_head = trimesh.transformations.translation_matrix(head_position)
    
    # Combine transformations
    transform = translation_to_head @ scale_matrix @ translation_to_origin
    
    # Apply to face mesh
    aligned_face = face_mesh.copy()
    aligned_face.apply_transform(transform)
    
    return aligned_face


def merge_face_and_body(face_mesh, body_mesh, blend_region=True):
    """
    Merge face mesh with body mesh
    
    Args:
        face_mesh: Aligned face trimesh
        body_mesh: Body template trimesh
        blend_region: Whether to blend the neck region
    
    Returns: Combined trimesh
    """
    # For now, simple concatenation
    # In production, you'd want proper mesh blending at the neck
    
    combined = trimesh.util.concatenate([body_mesh, face_mesh])
    
    if blend_region:
        # TODO: Implement proper neck blending
        # This would involve:
        # 1. Finding neck vertices on both meshes
        # 2. Stitching them together
        # 3. Smoothing the transition
        pass
    
    return combined


# ============================================
# RIGGING TRANSFER
# ============================================

def find_bone_in_scene(scene, bone_aliases):
    """Find a bone node using multiple possible names"""
    if hasattr(scene, 'graph'):
        for node_name in scene.graph.nodes:
            for alias in bone_aliases:
                if alias.lower() in node_name.lower():
                    return node_name
    return None


def transfer_rig_to_mesh(source_rig_path, target_mesh, output_path):
    """
    Transfer rigging from a template to a new mesh
    
    This is a simplified version - full rigging transfer requires
    weight painting which is complex to do programmatically.
    
    For production, consider using:
    - Mixamo auto-rigger (web service)
    - Blender's auto-rigging with Python API
    - AccuRig or similar
    """
    try:
        # Load the rigged template
        template_scene = trimesh.load(source_rig_path)
        
        # For GLB/GLTF, the rig is in the scene graph
        if hasattr(template_scene, 'graph'):
            # Get bone structure
            bones = {}
            for standard_name, aliases in HUMANOID_BONES.items():
                bone_node = find_bone_in_scene(template_scene, aliases)
                if bone_node:
                    bones[standard_name] = bone_node
            
            print(f"Found {len(bones)} bones in template")
        
        # Export combined mesh with rig
        # Note: This preserves the original rig - the mesh just needs
        # to be properly weighted to these bones
        
        if isinstance(target_mesh, trimesh.Trimesh):
            target_mesh.export(output_path)
        else:
            target_mesh.export(output_path)
        
        return output_path, bones
        
    except Exception as e:
        print(f"Rigging transfer error: {e}")
        # Fallback: just export the mesh without rig
        target_mesh.export(output_path)
        return output_path, {}


# ============================================
# AUTO-RIGGING SERVICE
# ============================================

def auto_rig_mesh(mesh_path, output_path, method="simple"):
    """
    Auto-rig a mesh
    
    Methods:
    - "simple": Basic bone structure (no weights)
    - "mixamo": Use Mixamo service (requires account)
    - "rigify": Use Blender Rigify (requires Blender)
    """
    
    if method == "simple":
        return simple_auto_rig(mesh_path, output_path)
    elif method == "mixamo":
        return mixamo_auto_rig(mesh_path, output_path)
    else:
        # Fallback to simple
        return simple_auto_rig(mesh_path, output_path)


def simple_auto_rig(mesh_path, output_path):
    """
    Create a basic skeleton for a humanoid mesh
    
    This creates bone positions but doesn't do weight painting.
    The mesh will need manual weight painting in Blender/Maya for
    proper deformation.
    """
    mesh = trimesh.load(mesh_path)
    
    if isinstance(mesh, trimesh.Scene):
        # Get the main geometry
        geometries = list(mesh.geometry.values())
        if geometries:
            mesh = geometries[0]
        else:
            raise ValueError("No geometry found in scene")
    
    bounds = mesh.bounds
    height = bounds[1][1] - bounds[0][1]
    center_x = (bounds[0][0] + bounds[1][0]) / 2
    center_z = (bounds[0][2] + bounds[1][2]) / 2
    base_y = bounds[0][1]
    
    # Create bone positions (normalized to mesh)
    bone_positions = {
        "Hips": [center_x, base_y + height * 0.5, center_z],
        "Spine": [center_x, base_y + height * 0.55, center_z],
        "Spine1": [center_x, base_y + height * 0.62, center_z],
        "Spine2": [center_x, base_y + height * 0.70, center_z],
        "Neck": [center_x, base_y + height * 0.82, center_z],
        "Head": [center_x, base_y + height * 0.90, center_z],
        
        # Arms (spread out from center)
        "LeftShoulder": [center_x - height * 0.08, base_y + height * 0.78, center_z],
        "LeftArm": [center_x - height * 0.15, base_y + height * 0.75, center_z],
        "LeftForeArm": [center_x - height * 0.25, base_y + height * 0.65, center_z],
        "LeftHand": [center_x - height * 0.32, base_y + height * 0.55, center_z],
        
        "RightShoulder": [center_x + height * 0.08, base_y + height * 0.78, center_z],
        "RightArm": [center_x + height * 0.15, base_y + height * 0.75, center_z],
        "RightForeArm": [center_x + height * 0.25, base_y + height * 0.65, center_z],
        "RightHand": [center_x + height * 0.32, base_y + height * 0.55, center_z],
        
        # Legs
        "LeftUpLeg": [center_x - height * 0.06, base_y + height * 0.48, center_z],
        "LeftLeg": [center_x - height * 0.06, base_y + height * 0.28, center_z],
        "LeftFoot": [center_x - height * 0.06, base_y + height * 0.05, center_z],
        
        "RightUpLeg": [center_x + height * 0.06, base_y + height * 0.48, center_z],
        "RightLeg": [center_x + height * 0.06, base_y + height * 0.28, center_z],
        "RightFoot": [center_x + height * 0.06, base_y + height * 0.05, center_z],
    }
    
    # For GLB export with skeleton, we need to use pygltflib or similar
    # For now, export mesh and bone data separately
    
    mesh.export(output_path)
    
    # Save bone data as JSON alongside
    import json
    bone_data_path = output_path.replace(".glb", "_bones.json")
    with open(bone_data_path, "w") as f:
        json.dump(bone_positions, f, indent=2)
    
    return output_path, bone_positions


def mixamo_auto_rig(mesh_path, output_path):
    """
    Use Mixamo's auto-rigger (requires web API or manual upload)
    
    Note: Mixamo doesn't have a public API, so this would need to be
    done through browser automation or manual upload.
    
    Returns instructions for the user.
    """
    return {
        "status": "manual_required",
        "instructions": [
            "1. Go to https://www.mixamo.com/",
            "2. Sign in with Adobe account",
            "3. Click 'Upload Character'",
            f"4. Upload the file: {mesh_path}",
            "5. Follow the auto-rigging wizard",
            "6. Download the rigged character",
            "7. Place it in static/uploads/"
        ],
        "mesh_path": mesh_path
    }


# ============================================
# FULL BODY AVATAR GENERATION
# ============================================

def generate_full_body_avatar(face_mesh_path, body_template_path=None, output_path=None):
    """
    Generate a full body avatar by combining face mesh with body template
    
    Args:
        face_mesh_path: Path to generated face/head mesh
        body_template_path: Path to rigged body template (optional)
        output_path: Where to save the result
    
    Returns: Path to combined avatar
    """
    # Load face mesh
    face_mesh = trimesh.load(face_mesh_path)
    if isinstance(face_mesh, trimesh.Scene):
        geometries = list(face_mesh.geometry.values())
        face_mesh = geometries[0] if geometries else None
    
    if face_mesh is None:
        raise ValueError("Could not load face mesh")
    
    # Load or create body template
    if body_template_path and os.path.exists(body_template_path):
        body_mesh = trimesh.load(body_template_path)
        if isinstance(body_mesh, trimesh.Scene):
            geometries = list(body_mesh.geometry.values())
            body_mesh = geometries[0] if geometries else None
    else:
        # Create a simple body placeholder
        body_mesh = create_simple_body()
    
    # Align face to body
    aligned_face = align_face_to_body(face_mesh, body_mesh)
    
    # Merge meshes
    combined = merge_face_and_body(aligned_face, body_mesh)
    
    # Export
    if output_path is None:
        output_path = face_mesh_path.replace(".glb", "_fullbody.glb")
    
    combined.export(output_path)
    
    return output_path


def create_simple_body():
    """Create a simple humanoid body placeholder"""
    # Create basic body parts using primitives
    
    # Torso (box)
    torso = trimesh.creation.box(extents=[0.4, 0.6, 0.2])
    torso.apply_translation([0, 0.8, 0])
    
    # Head placeholder (sphere) - will be replaced by face mesh
    head = trimesh.creation.icosphere(radius=0.12)
    head.apply_translation([0, 1.4, 0])
    
    # Arms (cylinders)
    left_arm = trimesh.creation.cylinder(radius=0.05, height=0.5)
    left_arm.apply_translation([-0.35, 0.9, 0])
    
    right_arm = trimesh.creation.cylinder(radius=0.05, height=0.5)
    right_arm.apply_translation([0.35, 0.9, 0])
    
    # Legs (cylinders)
    left_leg = trimesh.creation.cylinder(radius=0.07, height=0.8)
    left_leg.apply_translation([-0.12, 0.2, 0])
    
    right_leg = trimesh.creation.cylinder(radius=0.07, height=0.8)
    right_leg.apply_translation([0.12, 0.2, 0])
    
    # Combine all parts
    body = trimesh.util.concatenate([torso, left_arm, right_arm, left_leg, right_leg])
    
    return body


# ============================================
# USAGE EXAMPLE
# ============================================

if __name__ == "__main__":
    # Example usage
    manager = BodyTemplateManager()
    print(f"Available templates: {manager.list_templates()}")
    
    # Test simple body creation
    body = create_simple_body()
    body.export("test_body.glb")
    print("Created test_body.glb")