# Architecture

```text
Browser
  apps/web/index.html
       |
       +-- src/main.js                  core game state and rendering
       +-- src/modes/online-pk.js       Socket.IO client mode
       +-- src/screens/leaderboard.js   leaderboard screen
       +-- src/services/*               audio and HTTP clients
       +-- generated question pools
                 ^
                 |
       content/questions/*.json
                 |
       scripts/generate-question-pool.mjs

Flask
  apps/server/run.py
       |
       +-- HTTP blueprints
       +-- Socket.IO realtime handlers
       +-- question and AI services
       +-- SQLite repository
                 |
                 +-- var/game.db
                 +-- var/challenges/
```

## Ownership boundaries

- `content/` is the canonical game-content layer.
- `apps/web/` contains only browser runtime code and generated browser assets.
- `apps/server/` contains application code and no mutable data.
- `var/` contains mutable runtime state.
- `archive/` and `examples/` are not imported by the application.

The original architecture document is retained at
`docs/history/architecture-v1-v3.md`.
