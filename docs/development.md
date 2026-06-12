# Development

## Start

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python apps/server/run.py
```

Open `http://localhost:8888`.

## Question workflow

Canonical question data lives under `content/questions/`.

```bash
python scripts/validate-questions.py
node scripts/generate-question-pool.mjs
```

The generator writes browser-compatible files to
`apps/web/src/data/question-pool/`. Do not edit those generated files directly.

## Verification

```bash
python -m unittest discover -s tests
python -m compileall apps/server scripts
```
