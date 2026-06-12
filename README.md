# 反着来（Opposite Game）

一款要求玩家执行相反指令的 Canvas 反应力游戏，支持单人闯关、本地
PK、在线 Socket.IO 匹配、每日挑战和排行榜。

## 技术栈

- 原生 HTML、Canvas、JavaScript
- Python、Flask、Flask-SocketIO
- SQLite
- 通义千问 / DeepSeek，可自动降级到本地题库

## 一键运行

### macOS

直接双击仓库根目录的 `start.command`。

第一次运行会自动创建 `.venv`、安装依赖、启动服务并打开浏览器。以后
再次双击即可。若 macOS 首次阻止运行，右键文件并选择“打开”。

### Windows

双击 `scripts/start-dev.bat`，脚本会完成相同的初始化和启动流程。

启动窗口会显示两个地址：

- `http://localhost:8888`：仅当前电脑访问
- `http://局域网IP:8888`：同一 Wi-Fi 下的队友访问

运行期间不要关闭启动窗口，按 `Ctrl+C` 可停止服务。队友通过局域网
地址访问时，主机需要保持开机并允许系统防火墙放行 Python。

## 手动运行

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python apps/server/run.py
```

访问：

- 游戏：`http://localhost:8888`
- 健康检查：`http://localhost:8888/health`

AI Key 不是必需项。需要 AI 出题时，将 `.env.example` 复制为 `.env`
并填写对应 Key。

## 仓库结构

```text
apps/
  web/                  前端应用、静态资源和生成后的浏览器题库
  server/               Flask 应用包与启动入口
content/questions/      人工维护的唯一题库数据源
var/                    数据库、挑战记录、日志等本地运行数据
scripts/                启动、题库生成、校验和守护脚本
tests/                  自动化验证
docs/                   当前文档与历史材料
examples/               保留的旧版集成示例
archive/                重构前关键源码快照
tools/                  独立工具
```

详细说明见 [docs/repository-structure.md](docs/repository-structure.md)。

## 修改题库

不要直接编辑 `apps/web/src/data/question-pool/`，该目录是生成产物。

1. 修改 `content/questions/*.json`。
2. 校验数据：

   ```bash
   python scripts/validate-questions.py
   ```

3. 生成浏览器题库：

   ```bash
   node scripts/generate-question-pool.mjs
   ```

当前保留 385 条常规题、4 条体感题和 20 条后端降级题。

## 文档

- [开发说明](docs/development.md)
- [后端说明](docs/backend.md)
- [部署说明](docs/deployment.md)
- [当前 API](docs/api/reference.md)
- [当前架构](docs/architecture.md)

旧版黑客松契约、架构和任务清单保存在 `docs/history/` 与
`docs/api/legacy-*`，不再作为当前实现依据。

## License

[MIT](LICENSE)
