#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VENV_DIR="$ROOT_DIR/.venv"
PORT="${PORT:-8888}"
LOCAL_URL="http://localhost:$PORT"
SERVER_PID=""

cd "$ROOT_DIR"

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "========================================"
echo "  《反着来》一键启动"
echo "========================================"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[错误] 未找到 Python 3。请先安装 Python 3.9 或更高版本。"
  exit 1
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "[1/4] 创建独立 Python 环境..."
  python3 -m venv "$VENV_DIR"
else
  echo "[1/4] Python 环境已存在"
fi

echo "[2/4] 检查并安装依赖..."
"$VENV_DIR/bin/python" -m pip install -q -r requirements.txt

is_healthy() {
  "$VENV_DIR/bin/python" -c \
    "import urllib.request; urllib.request.urlopen('$LOCAL_URL/health', timeout=1)" \
    >/dev/null 2>&1
}

open_site() {
  if [ "${OPEN_BROWSER:-1}" = "1" ]; then
    if command -v open >/dev/null 2>&1; then
      open "$LOCAL_URL"
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$LOCAL_URL" >/dev/null 2>&1 || true
    fi
  fi
}

LAN_IP=""
if command -v ipconfig >/dev/null 2>&1; then
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
elif command -v hostname >/dev/null 2>&1; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

if is_healthy; then
  echo "[3/4] 检测到网站已在运行"
  echo "[4/4] 无需重复启动"
  echo
  echo "  你自己访问：$LOCAL_URL"
  if [ -n "$LAN_IP" ]; then
    echo "  同一 Wi-Fi 的队友访问：http://$LAN_IP:$PORT"
  fi
  echo "========================================"
  open_site
  exit 0
fi

echo "[3/4] 启动服务..."
"$VENV_DIR/bin/python" apps/server/run.py &
SERVER_PID=$!

READY=0
ATTEMPT=0
while [ "$ATTEMPT" -lt 30 ]; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[错误] 服务启动失败，请查看上方日志。"
    exit 1
  fi
  if is_healthy; then
    READY=1
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 0.3
done

if [ "$READY" -ne 1 ]; then
  echo "[错误] 服务启动超时。"
  exit 1
fi

echo "[4/4] 启动完成"
echo
echo "  你自己访问：$LOCAL_URL"
if [ -n "$LAN_IP" ]; then
  echo "  同一 Wi-Fi 的队友访问：http://$LAN_IP:$PORT"
fi
echo
echo "  保持这个窗口打开；按 Ctrl+C 停止网站。"
echo "========================================"

open_site

wait "$SERVER_PID"
