import json
import random
from pathlib import Path


class QuestionService:
    def __init__(self, fallback_path):
        self.fallback_path = Path(fallback_path)
        self._cache = None

    def all_fallback(self):
        if self._cache is None:
            data = json.loads(self.fallback_path.read_text(encoding="utf-8"))
            self._cache = data.get("questions", [])
        return self._cache

    def fallback(self, difficulty=1, exclude_types=None):
        exclude_types = exclude_types or []
        questions = self.all_fallback()
        pool = [
            question
            for question in questions
            if question.get("type") not in exclude_types
            and self._matches_difficulty(question, difficulty)
        ]
        if not pool:
            pool = [
                question
                for question in questions
                if question.get("type") not in exclude_types
            ]
        if not pool:
            pool = questions
        question = dict(random.choice(pool))
        question["source"] = "fallback"
        return question

    @staticmethod
    def _matches_difficulty(question, difficulty):
        try:
            requested = int(difficulty)
            actual = int(question.get("difficulty", requested))
            return abs(actual - requested) <= 1
        except (TypeError, ValueError):
            return True


def parse_difficulty(value):
    mapping = {
        "easy": 1,
        "medium": 2,
        "hard": 3,
        "extreme": 4,
        "hell": 5,
        "boss": 5,
    }
    if isinstance(value, str):
        normalized = value.lower()
        if normalized in mapping:
            return mapping[normalized]
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1


def normalize_for_online(question):
    normalized = dict(question)
    if "correct_action_index" in normalized:
        return normalized

    correct_action = normalized.get("correct_action")
    options = normalized.get("options") or []
    index = next(
        (
            position
            for position, option in enumerate(options)
            if option.get("action") == correct_action
        ),
        0,
    )
    normalized["correct_action_index"] = index
    return normalized
