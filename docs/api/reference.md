# HTTP API

The development server listens on `http://localhost:8888` by default.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health and online-player status |
| POST | `/api/generate-question` | AI question with local fallback |
| POST | `/api/analyze-performance` | Local performance analysis |
| POST | `/api/generate-share-text` | Share copy generation |
| POST | `/api/create-challenge` | Persist a challenge |
| GET | `/api/challenge/{code}` | Read a challenge |
| POST | `/api/leaderboard/submit` | Submit a leaderboard score |
| GET | `/api/leaderboard/top` | Read the top 20 |
| GET | `/api/daily-challenge` | Read the daily seed |

Socket.IO events are implemented in
`apps/server/opposite_game/realtime/game.py`.

## Socket.IO contract

Clients join with `join_queue` and may cancel with `leave_queue`. A matched
client receives `match_found`, followed by `new_question`. Every answer must
include the current `room_id`, `round`, and unguessable `round_token`.

The server is authoritative for timing and correctness. `new_question` never
contains `correct_action` or `correct_action_index`; the submitting client gets
an `answer_result` instead. Score and result payloads are keyed by Socket.IO
player ID so duplicate display names remain distinct.

Leaving an active game uses `leave_match`. Stale-round submissions are rejected,
and a disconnect aborts the room rather than allowing old timers to continue.

The previous hackathon API documents remain as `legacy-*` files for historical
reference. They are not the current contract.
