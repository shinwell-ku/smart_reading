@echo off
chcp 65001 >nul
echo ==============================
echo   AI智慧阅读 启动中...
echo ==============================

cd /d "%~dp0"

REM 1. 启动 Python 后端
echo [1/2] 启动后端服务...
start /B "" "backend\.venv\Scripts\python.exe" "backend\app.py"

REM 等后端就绪
timeout /t 3 /nobreak >nul

REM 2. 启动 Electron 前端
echo [2/2] 启动前端...
cd electron
npm start
pause
