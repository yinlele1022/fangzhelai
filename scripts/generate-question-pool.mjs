import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const contentDir = path.join(rootDir, "content", "questions");
const outputDir = path.join(rootDir, "apps", "web", "src", "data", "question-pool");

const pools = [
  ["easy", "easyQuestions.js"],
  ["medium", "mediumQuestions.js"],
  ["hard", "hardQuestions.js"],
  ["boss", "bossQuestions.js"],
];

fs.mkdirSync(outputDir, { recursive: true });

for (const [difficulty, outputName] of pools) {
  const source = JSON.parse(
    fs.readFileSync(path.join(contentDir, `${difficulty}.json`), "utf8")
  );
  const body = `/* Generated from content/questions/${difficulty}.json. */\n` +
    `(function (global) {\n` +
    `  "use strict";\n` +
    `  global.QuestionPoolParts = global.QuestionPoolParts || {};\n` +
    `  global.QuestionPoolParts.${difficulty} = ${JSON.stringify(source.questions, null, 2)};\n` +
    `})(window);\n`;
  fs.writeFileSync(path.join(outputDir, outputName), body);
}

const motion = JSON.parse(
  fs.readFileSync(path.join(contentDir, "motion.json"), "utf8")
);
const motionBody = `/* Generated from content/questions/motion.json. */\n` +
  `(function (global) {\n` +
  `  "use strict";\n` +
  `  global.MotionQuestionPool = ${JSON.stringify(motion.questions, null, 2)};\n` +
  `})(window);\n`;
fs.writeFileSync(path.join(outputDir, "motionQuestions.js"), motionBody);

console.log("Generated browser question pools from content/questions.");
