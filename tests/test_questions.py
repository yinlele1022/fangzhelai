import json
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
QUESTION_DIR = ROOT / "content" / "questions"


class QuestionDataTestCase(unittest.TestCase):
    def test_question_ids_are_unique_and_counts_match(self):
        identifiers = set()
        total = 0
        for name in ("easy", "medium", "hard", "boss", "motion"):
            data = json.loads(
                (QUESTION_DIR / f"{name}.json").read_text(encoding="utf-8")
            )
            questions = data["questions"]
            self.assertEqual(data["meta"]["count"], len(questions))
            for question in questions:
                self.assertNotIn(question["id"], identifiers)
                identifiers.add(question["id"])
            total += len(questions)
        self.assertEqual(total, 389)

    def test_fallback_metadata_matches_content(self):
        data = json.loads(
            (QUESTION_DIR / "fallback.json").read_text(encoding="utf-8")
        )
        self.assertEqual(data["meta"]["total_count"], len(data["questions"]))

    def test_late_level_stable_pools_have_enough_unique_questions(self):
        stable_types = {"action", "color", "direction", "logic_reversal"}
        expected_tags = {
            "hard": "challenge_hard",
            "boss": "challenge_boss",
        }
        stable_ids = {}

        for difficulty in ("hard", "boss"):
            data = json.loads(
                (QUESTION_DIR / f"{difficulty}.json").read_text(encoding="utf-8")
            )
            stable_ids[difficulty] = {
                question["id"]
                for question in data["questions"]
                if question.get("implementationLevel") == "P0"
                and not question.get("experimental", False)
                and question.get("type") in stable_types
                and expected_tags[difficulty] in question.get("modeTags", [])
            }

        self.assertGreaterEqual(len(stable_ids["hard"]), 10)
        self.assertGreaterEqual(len(stable_ids["boss"]), 5)
        self.assertTrue(stable_ids["hard"].isdisjoint(stable_ids["boss"]))

    @unittest.skipUnless(shutil.which("node"), "Node.js is required")
    def test_late_level_javascript_mixes_are_unique(self):
        script = textwrap.dedent(
            """
            const fs = require("fs");
            const vm = require("vm");
            const context = { window: { QuestionPoolParts: {} } };
            vm.createContext(context);
            for (const name of ["easy", "medium", "hard", "boss"]) {
              vm.runInContext(
                fs.readFileSync(`apps/web/src/data/question-pool/${name}Questions.js`, "utf8"),
                context
              );
            }
            vm.runInContext(
              fs.readFileSync("apps/web/src/data/question-bank.js", "utf8"),
              context
            );
            const bank = context.window.QuestionBank;
            const cases = [
              { mix: [{ difficulty: "hard", count: 7 }, { difficulty: "boss", count: 3 }], time: 800 },
              { mix: [{ difficulty: "hard", count: 5 }, { difficulty: "boss", count: 5 }], time: 750 }
            ];
            const result = cases.map(({ mix, time }) => {
              const questions = bank.getLevelQuestions(mix, 10, time);
              return {
                count: questions.length,
                unique: new Set(questions.map(question => question.id)).size,
                hard: questions.filter(question => question.difficulty === "hard").length,
                boss: questions.filter(question => question.difficulty === "boss").length,
                times: [...new Set(questions.map(question => question.time_limit_ms))]
              };
            });
            process.stdout.write(JSON.stringify(result));
            """
        )
        completed = subprocess.run(
            [shutil.which("node"), "-e", script],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        level_five, level_six = json.loads(completed.stdout)

        self.assertEqual(level_five, {
            "count": 10,
            "unique": 10,
            "hard": 7,
            "boss": 3,
            "times": [800],
        })
        self.assertEqual(level_six, {
            "count": 10,
            "unique": 10,
            "hard": 5,
            "boss": 5,
            "times": [750],
        })


if __name__ == "__main__":
    unittest.main()
