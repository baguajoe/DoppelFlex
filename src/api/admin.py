import os
from flask_admin import Admin
from flask_admin.contrib.sqla import ModelView

from api.models import db, User, Avatar, Customization, SubscriptionPlan, MotionCaptureSession, MotionFromVideo, RiggedAvatar, MocapSession2D, PuppetCharacter, IllustrationConversion  # ✅ Import all relevant models

def setup_admin(app):
    app.secret_key = os.environ.get('FLASK_APP_KEY', 'sample key')
    app.config['FLASK_ADMIN_SWATCH'] = 'cerulean'

    admin = Admin(app, name='Avatar Creator Admin')

    # Add models to admin panel
    admin.add_view(ModelView(User, db.session))          # ✅ User model
    admin.add_view(ModelView(Avatar, db.session))        # ✅ Avatar model
    admin.add_view(ModelView(Customization, db.session)) # ✅ Customization model
    admin.add_view(ModelView(SubscriptionPlan, db.session, name='Subscription Plans'))
    admin.add_view(ModelView(MotionCaptureSession, db.session))
    admin.add_view(ModelView(MotionFromVideo, db.session))
    admin.add_view(ModelView(RiggedAvatar, db.session))
    admin.add_view(ModelView(MocapSession2D, db.session))
    admin.add_view(ModelView(PuppetCharacter, db.session))
    admin.add_view(ModelView(IllustrationConversion, db.session))
