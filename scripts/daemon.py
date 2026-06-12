#!/usr/bin/env python3
"""
反着来 服务守护程序
- 自动启动 Flask+SocketIO 服务
- 支持 Sakura Frp / serveo.net 隧道自动重连
- 指数退避重连
- 实时保存公网 URL 到 public_url.txt
"""

import subprocess
import time
import re
import os
import sys
import signal
from pathlib import Path
from typing import Optional

# ========== 配置 ==========
SERVER_PORT = 8888
ROOT_DIR = Path(__file__).resolve().parents[1]
SERVER_SCRIPT = ROOT_DIR / "apps" / "server" / "run.py"
VAR_DIR = ROOT_DIR / "var"
URL_FILE = VAR_DIR / "public-url.txt"
LOG_FILE = VAR_DIR / "daemon.log"

MAX_RETRIES = 9999
INITIAL_BACKOFF = 5
MAX_BACKOFF = 300
# =============================


def log(msg: str):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)
    try:
        VAR_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def save_url(url: str):
    try:
        VAR_DIR.mkdir(parents=True, exist_ok=True)
        with open(URL_FILE, "w", encoding="utf-8") as f:
            f.write(url + "\n")
    except Exception as e:
        log(f"保存 URL 失败: {e}")


def start_flask_server(python_exe: str) -> Optional[subprocess.Popen]:
    log(f"正在启动 Flask 服务 (端口 {SERVER_PORT})...")
    try:
        proc = subprocess.Popen(
            [python_exe, SERVER_SCRIPT],
            cwd=ROOT_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        # 等待服务启动
        for _ in range(10):
            time.sleep(1)
            if proc.poll() is not None:
                log(f"Flask 进程异常退出，返回码: {proc.returncode}")
                return None
            # 尝试健康检查
            try:
                import urllib.request
                req = urllib.request.urlopen(f"http://127.0.0.1:{SERVER_PORT}/health", timeout=2)
                if req.status == 200:
                    log(f"Flask 服务启动成功 (PID: {proc.pid})")
                    return proc
            except Exception:
                pass
        log(f"Flask 服务启动超时 (PID: {proc.pid})")
        return proc  # 仍然返回，可能只是健康检查慢
    except Exception as e:
        log(f"Flask 启动异常: {e}")
        return None


def stop_process(proc: Optional[subprocess.Popen], name: str):
    if proc is None:
        return
    if proc.poll() is None:
        log(f"正在停止 {name} (PID: {proc.pid})...")
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
                proc.wait(timeout=3)
            except Exception:
                pass


def main():
    log("=" * 50)
    log("反着来 守护程序启动")
    log(f"Flask 脚本: {SERVER_SCRIPT}")
    log(f"监听端口: {SERVER_PORT}")
    log(f"URL 文件: {URL_FILE}")
    log("=" * 50)

    # 找到 Python 可执行文件
    python_exe = sys.executable
    log(f"Python: {python_exe}")

    running = True

    def sig_handler(sig, frame):
        nonlocal running
        log(f"收到信号 {sig}，正在退出...")
        running = False

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    flask_proc = None
    tunnel_proc = None
    current_url = None
    tunnel_failures = 0
    backoff = INITIAL_BACKOFF

    try:
        # 1. 启动 Flask
        flask_proc = start_flask_server(python_exe)
        if flask_proc is None:
            log("Flask 启动失败，退出")
            return 1

        # 2. 主循环
        while running:
            # 检查 Flask 是否还活着
            if flask_proc.poll() is not None:
                log(f"Flask 服务异常退出 (返回码: {flask_proc.returncode})，重新启动...")
                flask_proc = start_flask_server(python_exe)
                if flask_proc is None:
                    log("Flask 反复启动失败，等待 {backoff}s 后重试...")
                    time.sleep(backoff)
                    backoff = min(backoff * 2, MAX_BACKOFF)
                    continue
                else:
                    backoff = INITIAL_BACKOFF

            # 检查隧道是否需要重建
            need_tunnel = False
            if tunnel_proc is None:
                need_tunnel = True
            elif tunnel_proc.poll() is not None:
                log(f"隧道进程已退出 (返回码: {tunnel_proc.returncode})")
                need_tunnel = True
                tunnel_proc = None

            if need_tunnel:
                log("正在建立 serveo 隧道...")
                try:
                    tunnel_proc = subprocess.Popen(
                        [
                            "ssh",
                            "-o", "StrictHostKeyChecking=no",
                            "-o", "ServerAliveInterval=30",
                            "-o", "ServerAliveCountMax=3",
                            "-o", "TCPKeepAlive=yes",
                            "-o", "ExitOnForwardFailure=yes",
                            "-R", f"80:localhost:{SERVER_PORT}",
                            "serveo.net",
                        ],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1,
                    )

                    # 等待 URL
                    url = None
                    deadline = time.time() + 20
                    while time.time() < deadline:
                        if tunnel_proc.poll() is not None:
                            remaining = b""
                            try:
                                remaining = tunnel_proc.stdout.read()
                            except Exception:
                                pass
                            log(f"隧道启动失败: {remaining[:200]}")
                            break
                        line = tunnel_proc.stdout.readline()
                        if not line:
                            time.sleep(0.2)
                            continue
                        m = re.search(
                            r"https://([a-z0-9]+(?:-[a-z0-9]+)*)\.serveousercontent\.com",
                            line
                        )
                        if m:
                            url = f"https://{m.group(1)}.serveousercontent.com"
                            log(f"隧道已建立: {url}")
                            save_url(url)
                            break

                    if url is None:
                        log("未能获取 serveo URL（超时）")
                        try:
                            tunnel_proc.kill()
                            tunnel_proc.wait(timeout=3)
                        except Exception:
                            pass
                        tunnel_proc = None
                        tunnel_failures += 1
                        wait = min(INITIAL_BACKOFF * (2 ** min(tunnel_failures, 6)), MAX_BACKOFF)
                        log(f"隧道重连等待 {wait}s（第 {tunnel_failures} 次失败）...")
                        time.sleep(wait)
                        continue
                    else:
                        tunnel_failures = 0
                        backoff = INITIAL_BACKOFF

                except Exception as e:
                    log(f"隧道启动异常: {e}")
                    tunnel_failures += 1
                    time.sleep(min(INITIAL_BACKOFF * (2 ** min(tunnel_failures, 6)), MAX_BACKOFF))
                    continue

            # 每 15 秒检查一次
            for _ in range(15):
                if not running:
                    break
                time.sleep(1)

    except KeyboardInterrupt:
        log("用户中断")
    finally:
        stop_process(tunnel_proc, "隧道")
        stop_process(flask_proc, "Flask")

    log("守护程序已退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())
