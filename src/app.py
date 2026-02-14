import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from flask import Flask, request, jsonify, url_for, send_from_directory
from flask_migrate import Migrate
from flask_swagger import swagger
from flask_jwt_extended import JWTManager
from api.utils import APIException, generate_sitemap
from api.models import db
from api.routes import api
from api.admin import setup_admin
from api.commands import setup_commands
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from api.avatar_routes import avatar_api, register_avatar_routes
from api.illustration_routes import illustration_api
from datetime import timedelta


ENV = "development" if os.getenv("FLASK_DEBUG") == "1" else "production"
static_file_dir = os.path.join(os.path.dirname(os.path.realpath(__file__)), '../public/')
app = Flask(__name__)
app.url_map.strict_slashes = False

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Database configuration
db_url = os.getenv("DATABASE_URL")
if db_url is not None:
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url.replace("postgres://", "postgresql://")
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = "sqlite:////tmp/test.db"

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ─── JWT Configuration ───────────────────────────────────────────
# IMPORTANT: Set JWT_SECRET_KEY in your .env file for production!
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'doppelflex-dev-secret-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)
jwt = JWTManager(app)
# ─────────────────────────────────────────────────────────────────

MIGRATE = Migrate(app, db, compare_type=True)
db.init_app(app)

# Admin and CLI setup
setup_admin(app)
setup_commands(app)

# Register API blueprint
app.register_blueprint(api, url_prefix='/api')
app.register_blueprint(illustration_api)
register_avatar_routes(app)


# ═══════════════════════════════════════════════════════════════
#  WEBSOCKET HANDLERS (SocketIO)
#  Used by MotionCaptureWithRecording for real-time pose streaming
# ═══════════════════════════════════════════════════════════════

@socketio.on('connect')
def handle_connect():
    print('[WS] Client connected')
    emit('status', {'message': 'Connected to DoppelFlex WebSocket'})


@socketio.on('disconnect')
def handle_disconnect():
    print('[WS] Client disconnected')


@socketio.on('pose_frame')
def handle_pose_frame(data):
    """Receive real-time pose landmarks from frontend.
    Data format: { time: float, landmarks: [...] }
    Broadcasts to all other connected clients (e.g. for multi-viewer)."""
    emit('pose_update', data, broadcast=True, include_self=False)


@socketio.on('join_session')
def handle_join_session(data):
    """Join a named session room for targeted streaming."""
    session_id = data.get('session_id', 'default')
    from flask_socketio import join_room
    join_room(session_id)
    emit('status', {'message': f'Joined session: {session_id}'})


@socketio.on('leave_session')
def handle_leave_session(data):
    session_id = data.get('session_id', 'default')
    from flask_socketio import leave_room
    leave_room(session_id)
    emit('status', {'message': f'Left session: {session_id}'})


# ═══════════════════════════════════════════════════════════════
#  ERROR HANDLING
# ═══════════════════════════════════════════════════════════════

@app.errorhandler(APIException)
def handle_invalid_usage(error):
    return jsonify(error.to_dict()), error.status_code


# ═══════════════════════════════════════════════════════════════
#  ROOT / SITEMAP
# ═══════════════════════════════════════════════════════════════

@app.route('/')
def sitemap():
    links = []
    for rule in app.url_map.iter_rules():
        if (
            "GET" in rule.methods and
            rule.rule.startswith("/api/") and
            not rule.rule.startswith("/api/static")
        ):
            links.append(f'<li><a href="{rule.rule}">{rule.rule}</a></li>')

    html = f"""
    <html>
        <head><title>DoppelFlex API</title></head>
        <body>
            <h1>Welcome to DoppelFlex</h1>
            <p>API gateway — explore available endpoints below:</p>
            <ul>
                {''.join(links)}
            </ul>
        </body>
    </html>
    """
    return html


# ═══════════════════════════════════════════════════════════════
#  SPA FALLBACK + STATIC FILES
# ═══════════════════════════════════════════════════════════════

@app.route('/<path:path>', methods=['GET'])
def serve_react_fallback(path):
    file_path = os.path.join(static_file_dir, path)
    if os.path.exists(file_path):
        return send_from_directory(static_file_dir, path)
    return send_from_directory(static_file_dir, 'index.html')


@app.route('/static/uploads/<path:filename>')
def serve_uploaded_file(filename):
    return send_from_directory('../static/uploads', filename)


@app.route('/static/exports/<path:filename>')
def serve_exported_file(filename):
    return send_from_directory('../static/exports', filename)


@app.route('/static/models/<path:filename>')
def serve_model_file(filename):
    return send_from_directory('../static/models', filename)


@app.route('/static/templates/<path:filename>')
def serve_template_file(filename):
    return send_from_directory('../static/templates', filename)


# ═══════════════════════════════════════════════════════════════
#  START SERVER
#  Uses socketio.run() instead of app.run() so WebSockets work
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    PORT = int(os.environ.get('PORT', 3001))
    socketio.run(app, host='0.0.0.0', port=PORT, debug=True)