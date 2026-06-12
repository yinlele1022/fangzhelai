@echo off
setlocal
title 《反着来》一键启动
chcp 65001 >nul

cd /d "%~dp0.."
set "PORT=8888"
set "VENV_PYTHON=.venv\Scripts\python.exe"

echo ========================================
echo   《反着来》一键启动
echo ========================================

where python >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python 3。请先安装 Python 3.9 或更高版本。
    pause
    exit /b 1
)

if not exist "%VENV_PYTHON%" (
    echo [1/4] 创建独立 Python 环境...
    python -m venv .venv
    if errorlevel 1 (
        echo [错误] 创建 Python 环境失败。
        pause
        exit /b 1
    )
) else (
    echo [1/4] Python 环境已存在
)

echo [2/4] 检查并安装依赖...
"%VENV_PYTHON%" -m pip install -q -r requirements.txt
if errorlevel 1 (
    echo [错误] 依赖安装失败。
    pause
    exit /b 1
)

for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown'} | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LAN_IP=%%i"

echo [3/4] 启动服务...
start "" "http://localhost:%PORT%"
echo [4/4] 启动完成
echo.
echo   你自己访问：http://localhost:%PORT%
if defined LAN_IP echo   同一 Wi-Fi 的队友访问：http://%LAN_IP%:%PORT%
echo.
echo   保持这个窗口打开；按 Ctrl+C 停止网站。
echo ========================================

"%VENV_PYTHON%" apps\server\run.py

echo.
echo 服务已停止。
pause
