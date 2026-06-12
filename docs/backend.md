# Backend

后端入口是 `apps/server/run.py`，应用包位于
`apps/server/opposite_game/`。

## 模块

```text
config.py                  路径、环境变量和服务配置
extensions.py              Socket.IO 扩展
routes/api.py              HTTP API
routes/web.py              前端静态文件托管
realtime/game.py           在线匹配、房间和对战
services/ai.py             通义千问与 DeepSeek 调用
services/questions.py      本地降级题库和题目规范化
services/analysis.py       本地表现分析
repositories/leaderboard.py SQLite 排行榜访问
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---:|---|
| `PORT` | `8888` | 服务端口 |
| `LOG_LEVEL` | `INFO` | 日志等级 |
| `SOCKETIO_ASYNC_MODE` | 自动 | 可设为 `threading` |
| `TONGYI_API_KEY` | 空 | 通义千问 Key |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek Key |
| `AI_TIMEOUT_SECONDS` | `10` | AI 请求超时 |
| `ONLINE_ROUND_TIME_MS` | `8000` | 在线对战每题时限 |
| `ONLINE_MATCH_START_DELAY_MS` | `2000` | 匹配成功后的开局等待 |
| `ONLINE_MAX_ROUNDS` | `20` | 单局在线题数 |
| `DATABASE_PATH` | `var/game.db` | SQLite 路径 |
| `CHALLENGE_DIR` | `var/challenges` | 挑战记录目录 |

没有 AI Key 时，服务读取 `content/questions/fallback.json`。

## 运行数据

运行数据统一写入 `var/`，不进入 Git。原仓库中的排行榜数据库和六条
挑战记录已迁移到该目录，数据没有删除。
