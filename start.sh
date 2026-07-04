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
if [ ! -d "$DIR/frontend/node_modules" ]; then
  echo "❌ 未安装 Node.js 依赖，请先执行:"
  echo "   cd frontend && npm install"
  exit 1
fi

# 构建 Vue 前端
echo "[构建] 编译前端..."
cd "$DIR/frontend"
[ -f "dist/index.html" ] || npx vite build --logLevel error 2>/dev/null || true

echo "=============================="
echo "   AI智慧阅读 启动中..."
echo "=============================="

# 清理残留的后端进程
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
sleep 1

# 启动 Python 后端
cd "$DIR/backend"
.venv/bin/python app.py &
BACKEND_PID=$!

sleep 3

# 启动 Electron 前端
cd "$DIR/frontend"
npm start

# 退出时关闭后端
kill $BACKEND_PID 2>/dev/null
