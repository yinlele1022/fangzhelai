import json
import sqlite3
from pathlib import Path


class LeaderboardRepository:
    def __init__(self, database_path):
        self.database_path = Path(database_path)

    def connect(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(self.database_path)

    def initialize(self):
        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS leaderboard (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_name TEXT DEFAULT '匿名玩家',
                    score INTEGER NOT NULL,
                    max_combo INTEGER DEFAULT 0,
                    fastest_reaction_ms INTEGER DEFAULT 999999,
                    answers_json TEXT DEFAULT '[]',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_score "
                "ON leaderboard(score DESC)"
            )

    def submit(self, player_name, score, max_combo, fastest_ms, answers):
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO leaderboard (
                    player_name, score, max_combo,
                    fastest_reaction_ms, answers_json
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (
                    player_name or "匿名玩家",
                    score,
                    max_combo,
                    fastest_ms,
                    json.dumps(answers, ensure_ascii=False),
                ),
            )
            rank = connection.execute(
                "SELECT COUNT(*) + 1 FROM leaderboard WHERE score > ?",
                (score,),
            ).fetchone()[0]
            total = connection.execute(
                "SELECT COUNT(*) FROM leaderboard"
            ).fetchone()[0]
        return rank, total

    def top(self, limit=20):
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT player_name, score, max_combo,
                       fastest_reaction_ms, created_at
                FROM leaderboard
                ORDER BY score DESC, created_at ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            {
                "player_name": row[0],
                "score": row[1],
                "max_combo": row[2],
                "fastest_reaction_ms": row[3],
                "created_at": row[4],
            }
            for row in rows
        ]
