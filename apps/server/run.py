from opposite_game import create_app
from opposite_game.extensions import socketio


app = create_app()


if __name__ == "__main__":
    port = app.config["PORT"]
    app.logger.info("《反着来》服务启动，端口 %s", port)
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        allow_unsafe_werkzeug=True,
    )
