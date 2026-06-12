import json
import tempfile
import unittest
from pathlib import Path


from apps.server.opposite_game import create_app


class AppTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.app = create_app(
            {
                "TESTING": True,
                "DB_PATH": root / "game.db",
                "CHALLENGE_DIR": root / "challenges",
                "TONGYI_API_KEY": "",
                "DEEPSEEK_API_KEY": "",
                "SOCKETIO_ASYNC_MODE": "threading",
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_health_and_frontend(self):
        health = self.client.get("/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.get_json()["status"], "ok")

        frontend = self.client.get("/")
        self.assertEqual(frontend.status_code, 200)
        self.assertIn(b"gameCanvas", frontend.data)
        self.assertIn(b"musicCredits", frontend.data)
        frontend.close()

        music = self.client.get(
            "/assets/audio/music/retro-synth-main.mp3"
        )
        self.assertEqual(music.status_code, 200)
        self.assertEqual(music.content_type, "audio/mpeg")
        music.close()

    def test_question_falls_back_without_api_keys(self):
        response = self.client.post(
            "/api/generate-question",
            json={"difficulty": 1, "exclude_types": []},
        )
        self.assertEqual(response.status_code, 200)
        question = response.get_json()
        self.assertEqual(question["source"], "fallback")
        self.assertIn("instruction_text", question)

    def test_analysis_and_share_text(self):
        analysis = self.client.post(
            "/api/analyze-performance",
            json={
                "answers": [
                    {
                        "correct": True,
                        "reaction_time_ms": 420,
                        "question_type": "color",
                    }
                ]
            },
        )
        self.assertEqual(analysis.status_code, 200)
        self.assertIn("radar", analysis.get_json())

        share = self.client.post(
            "/api/generate-share-text",
            json={"score": 20, "max_combo": 4},
        )
        self.assertEqual(share.status_code, 200)
        self.assertIn("20", share.get_json()["text"])

    def test_challenge_round_trip(self):
        created = self.client.post(
            "/api/create-challenge",
            json={
                "player_name": "测试玩家",
                "score": 9,
                "questions": [{"id": "sample"}],
            },
        )
        self.assertEqual(created.status_code, 200)
        code = created.get_json()["challenge_code"]

        loaded = self.client.get(f"/api/challenge/{code}")
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.get_json()["score"], 9)

    def test_leaderboard_round_trip(self):
        submitted = self.client.post(
            "/api/leaderboard/submit",
            json={
                "player_name": "测试玩家",
                "score": 12,
                "max_combo": 3,
                "fastest_reaction_ms": 500,
                "answers": [],
            },
        )
        self.assertEqual(submitted.status_code, 200)
        self.assertEqual(submitted.get_json()["rank"], 1)

        top = self.client.get("/api/leaderboard/top")
        self.assertEqual(top.status_code, 200)
        self.assertEqual(top.get_json()["leaderboard"][0]["score"], 12)


if __name__ == "__main__":
    unittest.main()
