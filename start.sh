#!/bin/bash
# ============================================================
# AI智慧阅读 - 启动脚本（开发环境用）
# ============================================================
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查后端依赖是否安装
if [ ! -f "$DIR/backend/.venv/bin/python3" ] && [ ! -d "$DIR/backend/.venv" ]; then
  echo "❌ 未安装 Python 依赖，请先执行:"
  echo "   cd backend && uv sync"
  exit 1
fi

# 检查前端依赖是否安装
if [ ! -d "$DIR/electron/node_modules" ]; then
  echo "❌ 未安装 Node.js 依赖，请先执行:"
  echo "   cd electron && npm install"
  exit 1
fi

echo "=============================="
echo "   AI智慧阅读 启动中..."
echo "=============================="

# 启动 Python 后端
cd "$DIR/backend"
.venv/bin/python app.py &
BACKEND_PID=$!

sleep 3

# 启动 Electron 前端
cd "$DIR/electron"
npm start

# 退出时关闭后端
kill $BACKEND_PID 2>/dev/null
