#!/usr/bin/env python3
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = ROOT / "content" / "questions"
POOL_NAMES = ("easy", "medium", "hard", "boss", "motion")


def load_questions(name):
    path = CONTENT_DIR / f"{name}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    questions = data.get("questions")
    if not isinstance(questions, list):
        raise ValueError(f"{path}: questions must be a list")
    if data.get("meta", {}).get("count") != len(questions):
        raise ValueError(f"{path}: meta.count does not match questions length")
    return questions


def validate_question(question, source, index):
    required = ("type", "prompt", "correctAction")
    missing = [field for field in required if not question.get(field)]
    if missing:
        raise ValueError(f"{source}[{index}]: missing {', '.join(missing)}")


def main():
    ids = set()
    total = 0
    for pool_name in POOL_NAMES:
        questions = load_questions(pool_name)
        for index, question in enumerate(questions):
            validate_question(question, pool_name, index)
            question_id = question.get("id")
            if not question_id:
                raise ValueError(f"{pool_name}[{index}]: missing id")
            if question_id in ids:
                raise ValueError(f"duplicate question id: {question_id}")
            ids.add(question_id)
        total += len(questions)

    fallback = json.loads(
        (CONTENT_DIR / "fallback.json").read_text(encoding="utf-8")
    )
    fallback_questions = fallback.get("questions", [])
    if not fallback_questions:
        raise ValueError("fallback.json contains no questions")

    print(
        f"Question data OK: {total} browser questions, "
        f"{len(fallback_questions)} fallback questions, {len(ids)} unique IDs."
    )


if __name__ == "__main__":
    main()
