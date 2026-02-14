from flask_sqlalchemy import SQLAlchemy

from datetime import datetime

db = SQLAlchemy()

# 1. User Model
class User(db.Model):
    __tablename__ = 'user'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    subscription_plan = db.Column(db.String(50), default="Basic")  # Basic, Pro, Premium

    # DO NOT define `usage = db.relationship(...)` here — it's created via backref from UserUsage
    avatars = db.relationship('Avatar', backref='user', lazy=True)


class UserUsage(db.Model):
    __tablename__ = 'user_usage'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)

    storage_used_gb = db.Column(db.Float, default=0.0)
    rigging_sessions = db.Column(db.Integer, default=0)
    mocap_sessions = db.Column(db.Integer, default=0)
    videos_rendered = db.Column(db.Integer, default=0)
    render_minutes = db.Column(db.Float, default=0.0)
    last_reset = db.Column(db.DateTime, default=datetime.utcnow)

    # This sets up `user.usage` on the User model automatically
    user = db.relationship("User", backref=db.backref("usage", uselist=False))



# 2. Avatar Model
class Avatar(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    avatar_url = db.Column(db.String(255), nullable=False)
    filename = db.Column(db.String(100))
    status = db.Column(db.String(50), default="generated")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    customization = db.relationship('Customization', backref='avatar', uselist=False)

# 3. Customization Model
class Customization(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    avatar_id = db.Column(db.Integer, db.ForeignKey('avatar.id'), nullable=False)
    skin_color = db.Column(db.String(50))
    outfit_color = db.Column(db.String(50))
    accessories = db.Column(db.Text)  # JSON string or comma-separated values
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SubscriptionPlan(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)  # e.g., Basic, Pro, Premium
    description = db.Column(db.Text)
    price_monthly = db.Column(db.Float, nullable=False)
    price_yearly = db.Column(db.Float, nullable=True)
    features = db.Column(db.Text)  # Could be a comma-separated string or JSON blob
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class MotionCaptureSession(db.Model):
    __tablename__ = 'motion_capture_sessions'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    avatar_id = db.Column(db.Integer, db.ForeignKey('avatar.id'))
    source_type = db.Column(db.String(20))  # 'live' or 'video'
    video_filename = db.Column(db.String(255))
    pose_data_url = db.Column(db.String(512))

    # 🔗 NEW FIELDS
    audio_filename = db.Column(db.String(255))   # uploaded audio used in session
    beat_timestamps = db.Column(db.JSON)         # list of beat times
    rigged_avatar_id = db.Column(db.Integer, db.ForeignKey('rigged_avatar.id'))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    user = db.relationship('User', backref='motion_sessions')
    avatar = db.relationship('Avatar', backref='motion_sessions')
    rigged_avatar = db.relationship('RiggedAvatar', backref='linked_motion_sessions')




class MotionFromVideo(db.Model):
    __tablename__ = 'motion_from_video'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    video_filename = db.Column(db.String(255), nullable=False)
    extracted_frames = db.Column(db.Integer)
    pose_data_url = db.Column(db.String(512))
    rigged_avatar_id = db.Column(db.Integer, db.ForeignKey('rigged_avatar.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='video_motions')
    rigged_avatar = db.relationship('RiggedAvatar', backref='video_sources')


class RiggedAvatar(db.Model):
    __tablename__ = 'rigged_avatar'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    avatar_id = db.Column(db.Integer, db.ForeignKey('avatar.id'), nullable=False)
    rig_type = db.Column(db.String(50))  # mixamo, deepmotion, etc.
    rig_file_url = db.Column(db.String(512))
    bone_map_json = db.Column(db.JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='rigged_avatars')
    avatar = db.relationship('Avatar', backref='rigs')


class DanceSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    song_name = db.Column(db.String(100))
    tempo = db.Column(db.Float)
    beat_times = db.Column(db.JSON)
    style = db.Column(db.String(50))
    video_url = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Bone(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('bone.id'), nullable=True)
    skeleton_id = db.Column(db.Integer, db.ForeignKey('skeleton.id'), nullable=False)
    offset_x = db.Column(db.Float, default=0.0)
    offset_y = db.Column(db.Float, default=0.0)
    offset_z = db.Column(db.Float, default=0.0)

    children = db.relationship('Bone', backref=db.backref('parent', remote_side=[id]))

class Skeleton(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    rigged_avatar_id = db.Column(db.Integer, db.ForeignKey('rigged_avatar.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)  # ✅ Link to User

    bones = db.relationship('Bone', backref='skeleton', lazy=True)
    rigged_avatar = db.relationship('RiggedAvatar', backref='skeleton')
    user = db.relationship('User', backref='skeletons')  # ✅ Reverse link from User to Skeletons

    created_at = db.Column(db.DateTime, default=datetime.utcnow)



class MotionAudioSync(db.Model):
    __tablename__ = 'motion_audio_sync'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    avatar_id = db.Column(db.Integer, db.ForeignKey('avatar.id'), nullable=True)
    song_name = db.Column(db.String(100), nullable=False)
    audio_filename = db.Column(db.String(255), nullable=False)
    beat_timestamps = db.Column(db.JSON, nullable=False)  # [0.5, 1.0, 1.5, ...]
    custom_notes = db.Column(db.Text)  # Optional: JSON or text for custom cues
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref='motion_audio_syncs')
    avatar = db.relationship('Avatar', backref='audio_syncs')

class MotionSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100))
    frames = db.Column(db.JSON)  # pose frames
    fx_timeline = db.Column(db.JSON)  # optional: for beat-triggered FX
    export_date = db.Column(db.DateTime, default=datetime.utcnow)
    audio_filename = db.Column(db.String)
    thumbnail = db.Column(db.String)  # Optional

class ExportedFBX(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(120), nullable=False)
    export_date = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User', backref='exports')

    def __repr__(self):
        return f'<ExportedFBX {self.filename}>'
    
class FBXExporter:
    def __init__(self):
        pass

    def export(self, model, bones, output_path, user_id):
        # Export the FBX file (simplified)
        try:
            # Call the logic to export the FBX file using pyassimp or your tool
            file_path = f"exports/{output_path}"
            # Save the export record to the database
            exported_fbx = ExportedFBX(filename=file_path, user_id=user_id)
            db.session.add(exported_fbx)
            db.session.commit()

            print(f"Successfully exported to {file_path}")
            return file_path
        except Exception as e:
            print(f"Error exporting FBX: {str(e)}")
            raise

# models.py

class SavedOutfit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    file = db.Column(db.String(255), nullable=False)
    style = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, server_default=db.func.now())
    is_favorite = db.Column(db.Boolean, default=False)

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "file": self.file,
            "style": self.style,
            "created_at": self.created_at,
        }

class Outfit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    file = db.Column(db.String(255), nullable=False)
    style = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def serialize(self):
        return {
            "id": self.id,
            "name": self.name,
            "file": self.file,
            "style": self.style,
            "created_at": self.created_at.isoformat()
        }
    
class AvatarPreset(db.Model):
    __tablename__ = 'avatar_presets'  # Name of the table in the database
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=False)  # Foreign key to User model (if applicable)
    height = db.Column(db.Integer)  # Avatar height (cm)
    weight = db.Column(db.Integer)  # Avatar weight (kg)
    skin_color = db.Column(db.String(7))  # Skin color in hex format
    outfit_color = db.Column(db.String(7))  # Outfit color in hex format
    accessories = db.Column(db.String(50))  # Accessories (e.g., glasses, hat)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)  # Timestamp for when the preset was created
    
    def __repr__(self):
        return f"<AvatarPreset {self.id} - User {self.user_id}>"
    

