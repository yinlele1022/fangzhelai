import os

from flask import Blueprint, current_app, jsonify, send_from_directory


web = Blueprint("web", __name__)


@web.route("/", defaults={"path": ""}, methods=["GET"])
@web.route("/<path:path>", methods=["GET"])
def serve_frontend(path):
    web_dir = current_app.config["WEB_DIR"].resolve()
    if not path:
        return send_from_directory(web_dir, "index.html")

    requested = (web_dir / path).resolve()
    if os.path.commonpath((web_dir, requested)) != str(web_dir):
        return jsonify({"error": "Forbidden"}), 403
    if requested.is_file():
        return send_from_directory(web_dir, path)
    return send_from_directory(web_dir, "index.html")
