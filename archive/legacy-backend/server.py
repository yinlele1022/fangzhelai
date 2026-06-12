"""
《反着来》后端服务
Flask + Flask-SocketIO + 通义千问/DeepSeek 降级
运行: python server.py
"""

import os
import json
import time
import random
import hashlib
import sqlite3
import logging
import threading
from datetime import datetime, timedelta
from functools import wraps

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, emit

# ── 日志 ──────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("opposite-game")

# ── 应用初始化 ──────────────────────────────────
app = Flask(__name__)
CORS(app, origins=["*"])
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# ── 配置（从环境变量读）──────────────────────────
TONGYI_API_KEY = os.getenv("TONGYI_API_KEY", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
TONGYI_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
FALLBACK_JSON = os.path.join(os.path.dirname(__file__), "data", "questions-fallback.json")
CHALLENGE_DIR = os.path.join(os.path.dirname(__file__), "data", "challenges")
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "game.db")
TIMEOUT_SECONDS = 10

# 去重缓存
_recent_questions = []
RECENT_MAX = 10

def _cache_question(q):
    inst = q.get("instruction_text", "")
    if inst:
        _recent_questions.append(inst)
        if len(_recent_questions) > RECENT_MAX:
            _recent_questions[:] = _recent_questions[-RECENT_MAX:]

os.makedirs(CHALLENGE_DIR, exist_ok=True)

# ── 在线对战：匹配队列 & 房间 ────────────────────
match_queue = []   # [sid, username, joined_at]
rooms = {}          # room_id -> {"players": {sid: username}, "scores": {}, "current_q": None, "round": 0, "max_rounds": 20, "answers": {}}

ROUND_TIME_MS = 8000   # 每题限时 8 秒

def find_or_create_room():
    """从匹配队列取两人，创建房间"""
    if len(match_queue) < 2:
        return None
    p1 = match_queue.pop(0)
    p2 = match_queue.pop(0)
    room_id = f"room_{int(time.time())}_{p1['sid'][:6]}"
    rooms[room_id] = {
        "players": {p1["sid"]: p1["username"], p2["sid"]: p2["username"]},
        "scores": {p1["sid"]: 0, p2["sid"]: 0},
        "combo": {p1["sid"]: 0, p2["sid"]: 0},
        "current_q": None,
        "round": 0,
        "max_rounds": 20,
        "answers": {p1["sid"]: {}, p2["sid"]: {}},
        "round_start": 0,
    }
    return room_id, p1, p2

def broadcast_room_status(room_id):
    """向房间内所有人广播当前状态"""
    room = rooms.get(room_id)
    if not room:
        return
    scores = {room["players"][sid]: room["scores"][sid] for sid in room["players"]}
    combos = {room["players"][sid]: room["combo"][sid] for sid in room["players"]}
    emit("room_status", {
        "room_id": room_id,
        "players": list(room["players"].values()),
        "scores": scores,
        "combos": combos,
        "round": room["round"],
        "max_rounds": room["max_rounds"],
        "status": "playing" if room["current_q"] else "waiting"
    }, room=room_id)

def send_question_to_room(room_id):
    """向房间内所有人发送新题目"""
    room = rooms.get(room_id)
    if not room:
        return
    if room["round"] >= room["max_rounds"]:
        end_room_game(room_id)
        return
    # 从本地题库随机取一道（用 fallback 题库）
    all_questions = load_fallback_questions()
    if not all_questions:
        log.error("题库为空，无法发题")
        return
    q = random.choice(all_questions)
    # 对齐前端格式：correct_action_index 是正确答案的索引
    if "correct_action_index" not in q:
        q["correct_action_index"] = 0
    room["current_q"] = q
    room["round"] += 1
    room["round_start"] = time.time() * 1000

    for sid in room["players"]:
        emit("new_question", {
            "round": room["round"],
            "total": room["max_rounds"],
            "question": q,
            "time_limit_ms": q.get("time_limit_ms", ROUND_TIME_MS),
            "server_time_ms": room["round_start"]
        }, room=sid)

    # 超时自动进入下一题
    from threading import Timer
    t = threading.Timer(ROUND_TIME_MS / 1000 + 0.5, timeout_round, args=(room_id,))
    t.daemon = True
    t.start()

def timeout_round(room_id):
    """单题超时，两人都没答则跳过"""
    room = rooms.get(room_id)
    if not room:
        return
    # 如果两人都已答这题，不重复处理
    answered = sum(1 for v in room["answers"].values() if room["round"] - 1 in v)
    if answered >= len(room["players"]):
        return
    # 未答的人算错
    for sid in room["players"]:
        if room["round"] - 1 not in room["answers"][sid]:
            room["combo"][sid] = 0
    send_question_to_room(room_id)

def end_room_game(room_id):
    """结束房间游戏，广播结果"""
    room = rooms.get(room_id)
    if not room:
        return
    result = {}
    for sid, username in room["players"].items():
        result[username] = {
            "score": room["scores"][sid],
            "max_combo": max((v.get("combo", 0) for v in room["answers"][sid].values()), default=0),
            "is_winner": room["scores"][sid] == max(room["scores"].values()) if len(set(room["scores"].values())) > 1 else True
        }
    emit("game_over", {"result": result}, room=room_id)
    # 清理房间（延迟 30 秒）
    def cleanup():
        if room_id in rooms:
            del rooms[room_id]
    from threading import Timer
    t = threading.Timer(30, cleanup)
    t.daemon = True
    t.start()

# ── SocketIO 事件 ────────────────────────────────────
@socketio.on("connect")
def on_connect():
    sid = request.sid
    log.info(f"Socket 连接: {sid[:8]}")
    emit("connected", {"sid": sid})

@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    log.info(f"Socket 断开: {sid[:8]}")
    # 从匹配队列移除
    global match_queue
    match_queue = [p for p in match_queue if p["sid"] != sid]
    # 从房间移除
    for room_id, room in list(rooms.items()):
        if sid in room["players"]:
            username = room["players"].pop(sid, "未知玩家")
            emit("player_left", {"username": username, "sid": sid}, room=room_id)
            if len(room["players"]) == 0:
                del rooms[room_id]
            break

@socketio.on("join_queue")
def on_join_queue(data):
    """加入匹配队列"""
    sid = request.sid
    username = data.get("username", f"玩家{sid[:4]}")
    # 检查是否已在队列
    if any(p["sid"] == sid for p in match_queue):
        emit("queue_status", {"status": "already_in_queue"})
        return
    # 检查是否已在房间
    for room_id, room in rooms.items():
        if sid in room["players"]:
            emit("queue_status", {"status": "already_in_room", "room_id": room_id})
            return
    match_queue.append({"sid": sid, "username": username, "joined_at": time.time()})
    log.info(f"加入匹配队列: {username} ({sid[:8]})，当前队列: {len(match_queue)}人")
    emit("queue_status", {"status": "waiting", "position": len(match_queue)})
    # 尝试匹配
    result = find_or_create_room()
    if result:
        room_id, p1, p2 = result
        for sid in [p1["sid"], p2["sid"]]:
            emit("match_found", {
                "room_id": room_id,
                "opponent": p2["username"] if sid == p1["sid"] else p1["username"]
            }, room=sid)
        log.info(f"匹配成功: {room_id}，玩家: {p1['username']} vs {p2['username']}")
        # 延迟 2 秒后开始发题
        import threading
        t = threading.Timer(2.0, send_question_to_room, args=(room_id,))
        t.daemon = True
        t.start()

@socketio.on("leave_queue")
def on_leave_queue(data):
    global match_queue
    sid = request.sid
    match_queue = [p for p in match_queue if p["sid"] != sid]
    emit("queue_status", {"status": "left"})

@socketio.on("submit_answer")
def on_submit_answer(data):
    """提交答案"""
    sid = request.sid
    room_id = data.get("room_id")
    answer_idx = data.get("answer")
    reaction_time_ms = data.get("reaction_time_ms", 9999)
    room = rooms.get(room_id)
    if not room:
        emit("error", {"msg": "房间不存在"})
        return
    if sid not in room["players"]:
        emit("error", {"msg": "你不在该房间"})
        return
    q = room["current_q"]
    if not q:
        return
    round_num = room["round"] - 1
    if round_num in room["answers"][sid]:
        return  # 已答过
    correct_idx = q.get("correct_action_index", 0)
    is_correct = (answer_idx == correct_idx)
    room["answers"][sid][round_num] = {
        "correct": is_correct,
        "answer": answer_idx,
        "reaction_time_ms": reaction_time_ms,
        "combo": room["combo"][sid]
    }
    if is_correct:
        room["scores"][sid] += 1
        room["combo"][sid] += 1
    else:
        room["combo"][sid] = 0
    # 广播分数更新
    scores = {room["players"][s]: room["scores"][s] for s in room["players"]}
    combos = {room["players"][s]: room["combo"][s] for s in room["players"]}
    emit("score_update", {
        "scores": scores,
        "combos": combos,
        "last_correct_sid": sid if is_correct else None
    }, room=room_id)
    # 两人都答完则进入下一题
    if all(round_num in a for a in room["answers"].values()):
        send_question_to_room(room_id)

@socketio.on("cancel_match")
def on_cancel_match(data):
    """取消匹配"""
    global match_queue
    sid = request.sid
    match_queue = [p for p in match_queue if p["sid"] != sid]
    emit("queue_status", {"status": "cancelled"})

# ── 题目生成 & 数据库（复用原有逻辑）────────────────
def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''CREATE TABLE IF NOT EXISTS leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT DEFAULT '匿名玩家',
        score INTEGER NOT NULL,
        max_combo INTEGER DEFAULT 0,
        fastest_reaction_ms INTEGER DEFAULT 999999,
        answers_json TEXT DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_score ON leaderboard(score DESC)')
    conn.commit()
    conn.close()

def submit_score(player_name, score, max_combo, fastest_ms, answers_json):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT INTO leaderboard (player_name, score, max_combo, fastest_reaction_ms, answers_json) VALUES (?,?,?,?,?)',
        (player_name or '匿名玩家', score, max_combo, fastest_ms, answers_json)
    )
    conn.commit()
    rank = conn.execute('SELECT COUNT(*) + 1 FROM leaderboard WHERE score > ?', (score,)).fetchone()[0]
    total = conn.execute('SELECT COUNT(*) FROM leaderboard').fetchone()[0]
    conn.close()
    return rank, total

def get_top_scores(limit=20):
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        'SELECT player_name, score, max_combo, fastest_reaction_ms, created_at FROM leaderboard ORDER BY score DESC, created_at ASC LIMIT ?',
        (limit,)
    ).fetchall()
    conn.close()
    return [{"player_name": r[0], "score": r[1], "max_combo": r[2], "fastest_reaction_ms": r[3], "created_at": r[4]} for r in rows]

init_db()

# ── 工具函数 ──────────────────────────────────────
def json_resp(data, status=200):
    resp = jsonify(data)
    resp.status_code = status
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

def load_fallback_questions():
    try:
        with open(FALLBACK_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("questions", [])
    except Exception as e:
        log.error(f"加载降级题库失败: {e}")
        return []

FALLBACK_CACHE = []
def get_fallback_question(difficulty, exclude_types):
    global FALLBACK_CACHE
    if not FALLBACK_CACHE:
        FALLBACK_CACHE = load_fallback_questions()
    pool = [q for q in FALLBACK_CACHE if q.get("type") not in (exclude_types or [])]
    if not pool:
        pool = FALLBACK_CACHE
    q = random.choice(pool)
    q["source"] = "fallback"
    return q

def call_tongyi(prompt):
    if not TONGYI_API_KEY:
        return None
    headers = {"Authorization": f"Bearer {TONGYI_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": "qwen-max", "messages": [{"role": "user", "content": prompt}], "temperature": 0.9, "max_tokens": 500}
    try:
        resp = requests.post(TONGYI_URL, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        log.warning(f"通义千问调用失败: {e}")
    return None

def call_deepseek(prompt):
    if not DEEPSEEK_API_KEY:
        return None
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": "deepseek-chat", "messages": [{"role": "user", "content": prompt}], "temperature": 1.2, "max_tokens": 500}
    try:
        resp = requests.post(DEEPSEEK_URL, headers=headers, json=payload, timeout=TIMEOUT_SECONDS)
        if resp.status_code == 200:
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        log.warning(f"DeepSeek 调用失败: {e}")
    return None

# ── 路由（复用原有 API）───────────────────────────
@app.route("/health", methods=["GET", "OPTIONS"])
def health():
    return json_resp({"status": "ok", "version": "1.1.0", "online_players": sum(len(r["players"]) for r in rooms.values())})

@app.route("/api/generate-question", methods=["POST", "OPTIONS"])
def generate_question():
    if request.method == "OPTIONS":
        return json_resp({})
    try:
        body = request.get_json(silent=True) or {}
        difficulty_raw = body.get("difficulty", 1)
        DIFFICULTY_MAP = {"easy": 1, "medium": 2, "hard": 3, "extreme": 4, "hell": 5}
        difficulty = DIFFICULTY_MAP.get(str(difficulty_raw).lower(), int(difficulty_raw)) if isinstance(difficulty_raw, str) else int(difficulty_raw)
        force_type = body.get("type", "any")
        exclude_types = body.get("exclude_types", [])
        prompt = generate_question_prompt(difficulty, exclude_types, force_type)
        raw = call_tongyi(prompt)
        if raw is None:
            raw = call_deepseek(prompt)
        if raw is None:
            q = get_fallback_question(difficulty, exclude_types)
            return json_resp(q)
        question = parse_ai_question(raw)
        if question:
            return json_resp(question)
        q = get_fallback_question(difficulty, exclude_types)
        return json_resp(q)
    except Exception as e:
        log.error(f"生成题目异常: {e}")
        return json_resp(get_fallback_question(1, []))

@app.route("/api/leaderboard/submit", methods=["POST", "OPTIONS"])
def leaderboard_submit():
    if request.method == "OPTIONS":
        return json_resp({})
    try:
        body = request.get_json(silent=True) or {}
        rank, total = submit_score(
            body.get("player_name", "匿名玩家"),
            int(body.get("score", 0)),
            int(body.get("max_combo", 0)),
            int(body.get("fastest_reaction_ms", 999999)),
            json.dumps(body.get("answers", []), ensure_ascii=False)
        )
        return json_resp({"rank": rank, "total": total, "score": body.get("score", 0)})
    except Exception as e:
        return json_resp({"error": str(e)}, 500)

@app.route("/api/leaderboard/top", methods=["GET", "OPTIONS"])
def leaderboard_top():
    if request.method == "OPTIONS":
        return json_resp({})
    return json_resp({"leaderboard": get_top_scores(20)})

@app.route("/api/daily-challenge", methods=["GET", "OPTIONS"])
def daily_challenge():
    if request.method == "OPTIONS":
        return json_resp({})
    date_str = datetime.now().strftime("%Y-%m-%d")
    seed = int(hashlib.md5(date_str.encode()).hexdigest()[:8], 16)
    tomorrow = (datetime.now() + timedelta(days=1)).replace(hour=0, minute=0, second=0)
    seconds_remaining = int((tomorrow - datetime.now()).total_seconds())
    return json_resp({"seed": seed, "date": date_str, "seconds_remaining": seconds_remaining, "label": f"{date_str} 每日挑战"})

# ── 前端托管（SPA 模式）──────────────────────────
@app.route("/", defaults={"path": ""}, methods=["GET"])
@app.route("/<path:path>", methods=["GET"])
def serve_frontend(path):
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
    if not path:
        return send_from_directory(static_dir, "index.html")
    abs_path = os.path.abspath(os.path.join(static_dir, path))
    abs_dir = os.path.abspath(static_dir)
    if not abs_path.startswith(abs_dir):
        return json_resp({"error": "Forbidden"}, 403)
    if os.path.exists(abs_path) and os.path.isfile(abs_path):
        return send_from_directory(static_dir, path)
    return send_from_directory(static_dir, "index.html")

# ── 题目生成 prompt（保持不变）──────────────────────
def generate_question_prompt(difficulty, exclude_types, force_type="any"):
    type_hints = {
        "direction": "方向类：指令说「向左滑/向右滑」，正确答案操作方向相反",
        "color": "颜色类：指令说「点红色的/点蓝色的」，正确答案点另一个颜色",
        "action": "动作类：指令说「别动/立刻点」，正确答案是反着来",
        "double_neg": "双重否定类：指令说「不要不点/别不点」，双重否定=肯定，要立刻点",
        "combo": "组合类：指令说「不要点红色的/别向左滑」，先理解否定含义再反着来"
    }
    if force_type and force_type != "any" and force_type in type_hints:
        chosen_type = force_type
    else:
        available = [t for t in type_hints if t not in (exclude_types or [])]
        if not available:
            available = list(type_hints.keys())
        chosen_type = random.choice(available)
    hint = type_hints[chosen_type]
    return f"""你是一个反直觉反应力游戏的题目生成器，每次都要生成全新的、有创意的题目。

游戏名称：《反着来》
规则：屏幕上出现一条指令，玩家必须做「相反」的操作才算正确。
例如：指令说「向左滑」，玩家必须向右滑。

当前难度等级：{difficulty}/5
请生成一道「{chosen_type}」类型的题目。

{hint}

请严格按以下 JSON 格式返回：
{{
  "type": "{chosen_type}",
  "instruction_text": "显示在屏幕上的指令文字",
  "correct_action_index": 0,
  "options": [
    {{"label": "选项1文字", "action": "对应动作"}},
    {{"label": "选项2文字", "action": "对应动作"}}
  ],
  "time_limit_ms": 800
}}"""

def parse_ai_question(raw_text):
    try:
        obj = json.loads(raw_text)
        if all(k in obj for k in ("type", "instruction_text", "correct_action_index", "options")):
            obj.setdefault("time_limit_ms", 1000)
            obj.setdefault("source", "ai")
            return obj
    except json.JSONDecodeError:
        pass
    import re
    m = re.search(r"```json\s*([\s\S]*?)\s*```", raw_text)
    if m:
        try:
            obj = json.loads(m.group(1))
            if all(k in obj for k in ("type", "instruction_text", "correct_action_index", "options")):
                obj.setdefault("time_limit_ms", 1000)
                obj.setdefault("source", "ai")
                return obj
        except Exception:
            pass
    return None

# ── 启动 ──────────────────────────────────────
if __name__ == "__main__":
    PORT = 8888
    log.info(f"《反着来》后端启动，端口 {PORT}")
    log.info(f"在线对战：已启用 WebSocket（SocketIO）")
    log.info(f"通义千问 API Key: {'已配置' if TONGYI_API_KEY else '未配置'}")
    log.info(f"DeepSeek API Key: {'已配置' if DEEPSEEK_API_KEY else '未配置'}")
    socketio.run(app, host="0.0.0.0", port=PORT, debug=False)
