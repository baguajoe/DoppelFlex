# src/api/body_type_routes.py
# Save and load body type proportions for user profiles

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from api.models import db, User
import json

body_type_api = Blueprint("body_type_api", __name__)


@body_type_api.route("/api/save-body-type", methods=["POST"])
@jwt_required()
def save_body_type():
    """Save body type preset and proportions to user profile."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    if not data or "proportions" not in data:
        return jsonify({"error": "Missing proportions data"}), 400

    # Store as JSON string in user profile
    user.body_type_preset = data.get("preset")
    user.body_type_proportions = json.dumps(data["proportions"])

    db.session.commit()

    return jsonify({
        "message": "Body type saved",
        "preset": user.body_type_preset,
    }), 200


@body_type_api.route("/api/body-type", methods=["GET"])
@jwt_required()
def get_body_type():
    """Load saved body type for current user."""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    proportions = None
    if user.body_type_proportions:
        try:
            proportions = json.loads(user.body_type_proportions)
        except json.JSONDecodeError:
            proportions = None

    return jsonify({
        "preset": user.body_type_preset,
        "proportions": proportions,
    }), 200