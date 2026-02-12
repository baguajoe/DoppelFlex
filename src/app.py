
import os
from flask import Flask, request, jsonify, url_for, send_from_directory
from flask_migrate import Migrate
from flask_swagger import swagger
from api.utils import APIException, generate_sitemap
from api.models import db
from api.routes import api
from api.admin import setup_admin
from api.commands import setup_commands
from flask_cors import CORS
from flask_socketio import SocketIO
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"




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
MIGRATE = Migrate(app, db, compare_type=True)
db.init_app(app)

# Admin and CLI setup
setup_admin(app)
setup_commands(app)

# Register API blueprint
app.register_blueprint(api, url_prefix='/api')



# Handle errors
@app.errorhandler(APIException)
def handle_invalid_usage(error):
    return jsonify(error.to_dict()), error.status_code



# Root route shows sitemap or JSON message
@app.route('/')
def sitemap():
    links = []
    for rule in app.url_map.iter_rules():
        # Only include API routes, skip admin/static/internal Flask routes
        if (
            "GET" in rule.methods and 
            rule.rule.startswith("/api/") and 
            not rule.rule.startswith("/api/static")
        ):
            links.append(f'<li><a href="{rule.rule}">{rule.rule}</a></li>')

    html = f"""
    <html>
        <head><title>Welcome to StreampireX API</title></head>
        <body>
            <h1>Welcome to Avatar Forge</h1>
            <p>This is the API gateway for StreampireX. Explore available endpoints below:</p>
            <ul>
                {''.join(links)}
            </ul>
        </body>
    </html>
    """
    return html





# (Optional) SPA React Fallback - enable when needed for production

@app.route('/<path:path>', methods=['GET'])
def serve_react_fallback(path):
    file_path = os.path.join(static_file_dir, path)
    if os.path.exists(file_path):
        return send_from_directory(static_file_dir, path)
    return send_from_directory(static_file_dir, 'index.html')

@app.route('/static/uploads/<filename>')
def serve_uploaded_file(filename):
    return send_from_directory('../static/uploads', filename)

if __name__ == '__main__':
    PORT = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=PORT, debug=True)
