# Deployment

## 本地或局域网

macOS 可双击仓库根目录的 `start.command`，Windows 可双击
`scripts/start-dev.bat`。脚本会自动初始化环境、安装依赖、打开浏览器，
并显示局域网共享地址。

```bash
./scripts/start-dev.sh
```

服务默认监听 `0.0.0.0:8888`。同一局域网中的设备可以通过主机 IP
访问。主机必须保持运行，且系统防火墙需允许 Python 接受传入连接。

局域网地址只适合同一 Wi-Fi。若要让异地队友长期通过一个固定链接
访问，应部署到支持 WebSocket 的云平台；临时演示可使用下一节的公网
隧道。

## 临时公网隧道

项目保留了 `scripts/daemon.py` 和 `scripts/start-daemon.bat`。守护脚本
会启动服务并尝试维护 SSH 隧道：

- 当前 URL：`var/public-url.txt`
- 守护日志：`var/daemon.log`

这两个文件都是运行时状态，不进入 Git。

也可以手动运行：

```bash
ssh -R 80:localhost:8888 localhost.run
```

## 云平台

部署时执行：

```bash
pip install -r requirements.txt
python apps/server/run.py
```

至少配置：

```text
PORT=<平台提供的端口>
SOCKETIO_ASYNC_MODE=threading
```

如需 AI 出题，再配置 `TONGYI_API_KEY` 或 `DEEPSEEK_API_KEY`。平台需支持
WebSocket，才能使用在线 PK。
