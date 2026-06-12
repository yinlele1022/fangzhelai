import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, jsonify, request

from ..services.ai import AIQuestionClient
from ..services.analysis import analyze_answers
from ..services.questions import parse_difficulty


api = Blueprint("api", __name__)


def response(data, status=200):
    result = jsonify(data)
    result.status_code = status
    return result


@api.route("/health", methods=["GET", "OPTIONS"])
def health():
    from ..realtime.game import online_player_count

    return response(
        {
            "status": "ok",
            "version": "2.0.0",
            "online_players": online_player_count(),
        }
    )


@api.route("/api/generate-question", methods=["POST", "OPTIONS"])
def generate_question():
    if request.method == "OPTIONS":
        return response({})
    body = request.get_json(silent=True) or {}
    difficulty = parse_difficulty(body.get("difficulty", 1))
    exclude_types = body.get("exclude_types") or []
    question = AIQuestionClient(current_app.config).generate(
        difficulty,
        exclude_types,
        body.get("type", "any"),
    )
    if question is None:
        question = current_app.extensions["question_service"].fallback(
            difficulty, exclude_types
        )
    return response(question)


@api.route("/api/analyze-performance", methods=["POST", "OPTIONS"])
def analyze_performance():
    if request.method == "OPTIONS":
        return response({})
    answers = (request.get_json(silent=True) or {}).get("answers") or []
    return response(analyze_answers(answers))


@api.route("/api/generate-share-text", methods=["POST", "OPTIONS"])
def generate_share_text():
    if request.method == "OPTIONS":
        return response({})
    body = request.get_json(silent=True) or {}
    text = (
        f"我在《反着来》里拿到 {int(body.get('score', 0))} 分，"
        f"最高连击 {int(body.get('max_combo', 0))}！来挑战我的反应力。"
    )
    return response(
        {"text": text, "hashtags": ["反着来", "反直觉挑战", "反应力测试"]}
    )


@api.route("/api/create-challenge", methods=["POST", "OPTIONS"])
def create_challenge():
    if request.method == "OPTIONS":
        return response({})
    body = request.get_json(silent=True) or {}
    code = secrets.token_hex(3).upper()
    payload = {
        "code": code,
        "player_name": body.get("player_name") or "匿名玩家",
        "score": int(body.get("score", 0)),
        "questions": body.get("questions") or [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    challenge_dir = current_app.config["CHALLENGE_DIR"]
    challenge_dir.mkdir(parents=True, exist_ok=True)
    (challenge_dir / f"{code}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return response(
        {
            "challenge_code": code,
            "share_url": request.host_url.rstrip("/") + f"/?challenge={code}",
        }
    )


@api.route("/api/challenge/<code>", methods=["GET", "OPTIONS"])
def get_challenge(code):
    if request.method == "OPTIONS":
        return response({})
    challenge_path = current_app.config["CHALLENGE_DIR"] / (
        f"{code.upper()}.json"
    )
    if not challenge_path.exists():
        return response({"error": "挑战码不存在"}, 404)
    return response(json.loads(challenge_path.read_text(encoding="utf-8")))


@api.route("/api/leaderboard/submit", methods=["POST", "OPTIONS"])
def leaderboard_submit():
    if request.method == "OPTIONS":
        return response({})
    body = request.get_json(silent=True) or {}
    rank, total = current_app.extensions["leaderboard_repository"].submit(
        body.get("player_name", "匿名玩家"),
        int(body.get("score", 0)),
        int(body.get("max_combo", 0)),
        int(body.get("fastest_reaction_ms", 999999)),
        body.get("answers") or [],
    )
    return response(
        {"rank": rank, "total": total, "score": int(body.get("score", 0))}
    )


@api.route("/api/leaderboard/top", methods=["GET", "OPTIONS"])
def leaderboard_top():
    if request.method == "OPTIONS":
        return response({})
    repository = current_app.extensions["leaderboard_repository"]
    return response({"leaderboard": repository.top(20)})


@api.route("/api/daily-challenge", methods=["GET", "OPTIONS"])
def daily_challenge():
    if request.method == "OPTIONS":
        return response({})
    now = datetime.now()
    date_string = now.strftime("%Y-%m-%d")
    seed = int(hashlib.md5(date_string.encode()).hexdigest()[:8], 16)
    tomorrow = (now + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return response(
        {
            "seed": seed,
            "date": date_string,
            "seconds_remaining": int((tomorrow - now).total_seconds()),
            "label": f"{date_string} 每日挑战",
        }
    )
