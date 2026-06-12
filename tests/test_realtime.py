import tempfile
import unittest
from pathlib import Path

from apps.server.opposite_game import create_app
from apps.server.opposite_game.extensions import socketio
from apps.server.opposite_game.realtime.game import (
    reset_realtime_state,
    rooms,
)


class RealtimeGameTestCase(unittest.TestCase):
    def setUp(self):
        reset_realtime_state()
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
                "ONLINE_MATCH_START_DELAY_MS": 10,
                "ONLINE_ROUND_TIME_MS": 100,
                "ONLINE_MAX_ROUNDS": 2,
            }
        )
        self.clients = []

    def tearDown(self):
        for client in self.clients:
            if client.is_connected():
                client.disconnect()
        reset_realtime_state()
        self.temp_dir.cleanup()

    def make_client(self):
        client = socketio.test_client(self.app)
        self.clients.append(client)
        client.get_received()
        return client

    @staticmethod
    def events(client, name):
        return [
            item["args"][0]
            for item in client.get_received()
            if item["name"] == name
        ]

    def match_clients(self, first_name="玩家A", second_name="玩家B"):
        first = self.make_client()
        second = self.make_client()
        first.emit("join_queue", {"username": first_name})
        first.get_received()
        second.emit("join_queue", {"username": second_name})
        first_received = first.get_received()
        second_received = second.get_received()
        first_match = next(
            item["args"][0]
            for item in first_received
            if item["name"] == "match_found"
        )
        second_match = next(
            item["args"][0]
            for item in second_received
            if item["name"] == "match_found"
        )
        socketio.sleep(0.03)
        return first, second, first_match, second_match

    def test_question_hides_answer_and_rejects_stale_round(self):
        first, _second, match, _ = self.match_clients()
        questions = self.events(first, "new_question")
        self.assertEqual(len(questions), 1)
        payload = questions[0]
        self.assertNotIn("correct_action", payload["question"])
        self.assertNotIn("correct_action_index", payload["question"])

        first.emit(
            "submit_answer",
            {
                "room_id": match["room_id"],
                "round": payload["round"] - 1,
                "round_token": payload["round_token"],
                "answer": 0,
            },
        )
        rejected = self.events(first, "answer_rejected")
        self.assertEqual(rejected[0]["reason"], "stale_round")
        room = rooms[match["room_id"]]
        self.assertEqual(room["scores"][match["player_id"]], 0)

    def test_timeout_never_scores_even_when_first_option_is_correct(self):
        first, _second, match, _ = self.match_clients()
        first.get_received()
        room = rooms[match["room_id"]]
        room["current_question"]["correct_action_index"] = 0
        socketio.sleep(0.12)
        self.assertEqual(room["scores"][match["player_id"]], 0)
        first_answer = room["answers"][match["player_id"]][1]
        self.assertFalse(first_answer["correct"])
        self.assertTrue(first_answer["timed_out"])

    def test_duplicate_names_remain_distinct_and_draw_is_explicit(self):
        self.app.config["ONLINE_MAX_ROUNDS"] = 1
        first, second, first_match, second_match = self.match_clients(
            "同名", "同名"
        )
        first_question = self.events(first, "new_question")[0]
        second_question = self.events(second, "new_question")[0]
        room = rooms[first_match["room_id"]]
        correct_index = room["current_question"]["correct_action_index"]

        for client, question in (
            (first, first_question),
            (second, second_question),
        ):
            client.emit(
                "submit_answer",
                {
                    "room_id": first_match["room_id"],
                    "round": question["round"],
                    "round_token": question["round_token"],
                    "answer": correct_index,
                },
            )
        socketio.sleep(0.02)
        game_over = self.events(first, "game_over")[0]
        self.assertTrue(game_over["is_draw"])
        self.assertIsNone(game_over["winner_sid"])
        self.assertEqual(len(game_over["result_by_sid"]), 2)
        self.assertEqual(
            set(game_over["result_by_sid"]),
            {first_match["player_id"], second_match["player_id"]},
        )

    def test_two_answers_advance_exactly_one_round(self):
        first, second, match, _ = self.match_clients()
        first_question = self.events(first, "new_question")[0]
        second_question = self.events(second, "new_question")[0]
        room = rooms[match["room_id"]]
        correct_index = room["current_question"]["correct_action_index"]

        for client, question in (
            (first, first_question),
            (second, second_question),
        ):
            client.emit(
                "submit_answer",
                {
                    "room_id": match["room_id"],
                    "round": question["round"],
                    "round_token": question["round_token"],
                    "answer": correct_index,
                },
            )
        socketio.sleep(0.02)
        self.assertEqual(rooms[match["room_id"]]["round"], 2)
        self.assertEqual(len(self.events(first, "new_question")), 1)
        self.assertEqual(len(self.events(second, "new_question")), 1)

    def test_leaving_match_aborts_room_before_first_question(self):
        self.app.config["ONLINE_MATCH_START_DELAY_MS"] = 100
        first = self.make_client()
        second = self.make_client()
        first.emit("join_queue", {"username": "玩家A"})
        first.get_received()
        second.emit("join_queue", {"username": "玩家B"})
        socketio.sleep(0.01)
        first_match = self.events(first, "match_found")[0]
        second.get_received()

        first.emit("leave_match", {"room_id": first_match["room_id"]})
        socketio.sleep(0.12)
        self.assertNotIn(first_match["room_id"], rooms)
        received = second.get_received()
        self.assertTrue(any(item["name"] == "player_left" for item in received))
        self.assertFalse(any(item["name"] == "new_question" for item in received))


if __name__ == "__main__":
    unittest.main()
