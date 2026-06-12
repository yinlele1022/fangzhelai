@echo off
chcp 65001 >nul
title 反着来 - 守护程序
echo ==========
echo   《反着来》服务守护程序
echo ==========
echo.
echo 功能：
echo   - 自动启动 Flask 后端（端口 8888）
echo   - 自动建立公网隧道
echo   - 断线自动重连
echo   - 公网地址保存在 public_url.txt
echo.
echo 按 Ctrl+C 停止所有服务
echo.
echo 正在启动...

cd /d "%~dp0.."
python -u scripts\daemon.py

echo.
echo 守护程序已退出
pause
