# Runtime Data

This directory is reserved for local runtime state:

- `game.db`: SQLite leaderboard database
- `challenges/*.json`: generated challenge records
- `daemon.log`: daemon output
- `public-url.txt`: current tunnel URL

Runtime files are intentionally ignored by Git. Source-controlled fixtures belong
under `tests/fixtures/`.
