#!/bin/bash
# ============================================================
# AI智慧阅读 - 生产包构建脚本
# 将后端 Python 环境 + AI 模型 + 数据打包进 Electron 安装包
# ============================================================
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES_DIR="$DIR/frontend/build-resources"
BACKEND_SRC="$DIR/backend"
DATA_SRC="$DIR/data"

echo "=============================="
echo "  构建 AI智慧阅读 安装包"
echo "=============================="

# 清理
rm -rf "$RES_DIR"
mkdir -p "$RES_DIR/backend" "$RES_DIR/data"

echo "[1/5] 复制后端代码..."
rsync -a --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' \
  --exclude='.python-version' --exclude='*.db*' \
  "$BACKEND_SRC/" "$RES_DIR/backend/"

echo "[2/5] 复制 Python 虚拟环境（包含符号链接）..."
cp -rL "$BACKEND_SRC/.venv" "$RES_DIR/backend/.venv" 2>/dev/null || rsync -a --copy-links \
  --exclude='__pycache__' --exclude='*.pyc' \
  "$BACKEND_SRC/.venv/" "$RES_DIR/backend/.venv/"
find "$RES_DIR/backend/.venv" -type d -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
find "$RES_DIR/backend/.venv" -name '*.pyc' -delete
rm -rf "$RES_DIR/backend/.venv/share" 2>/dev/null || true
# 修正 venv 中的路径引用
VENV_PYTHON="$RES_DIR/backend/.venv/bin/python3"
[ ! -f "$VENV_PYTHON" ] && [ -f "$RES_DIR/backend/.venv/bin/python" ] && \
  ln -sf python "$VENV_PYTHON"

# 复制 Python 标准库，使 venv 脱离本机环境也能运行
PYTHON_REAL=$(python3 -c "import os; print(os.path.realpath('$BACKEND_SRC/.venv/bin/python'))" 2>/dev/null)
PYTHON_HOME=$(dirname "$(dirname "$PYTHON_REAL")")
if [ -d "$PYTHON_HOME/lib/python3.10" ]; then
  echo "  复制 Python 标准库 (33MB)..."
  rsync -a --exclude='site-packages' --exclude='test' --exclude='tests' --exclude='__pycache__' --exclude='*.pyc' \
    "$PYTHON_HOME/lib/python3.10/" "$RES_DIR/backend/.venv/lib/python3.10/"
  # 复制 libpython3.10.dylib（Python 运行时链接库，15MB）
  if [ -f "$PYTHON_HOME/lib/libpython3.10.dylib" ]; then
    cp "$PYTHON_HOME/lib/libpython3.10.dylib" "$RES_DIR/backend/.venv/lib/"
    echo "  复制 libpython3.10.dylib (15MB)"
  fi
  # 更新 pyvenv.cfg，home 指向 venv 内的 bin 目录
  VENV_BIN="$(cd "$RES_DIR/backend/.venv/bin" && pwd)"
  sed -i '' "s|^home = .*|home = $VENV_BIN|" "$RES_DIR/backend/.venv/pyvenv.cfg"
  echo "  pyvenv.cfg 已更新"
else
  echo "  ⚠️  未找到 Python 标准库路径: $PYTHON_HOME/lib/python3.10"
fi

echo "[3/5] 复制 AI 模型..."
if [ -d "$DATA_SRC/models" ] && [ "$(ls -A "$DATA_SRC/models" 2>/dev/null)" ]; then
  rsync -a "$DATA_SRC/models/" "$RES_DIR/data/models/"
  echo "  模型已打包"
else
  mkdir -p "$RES_DIR/data/models"
  echo "  无模型，跳过"
fi

echo "[4/6] 创建数据目录..."
for d in db books cache exports; do mkdir -p "$RES_DIR/data/$d"; done

echo "[5/6] 编译前端..."
cd "$DIR/frontend"
npx vite build --logLevel error 2>/dev/null || echo "⚠️  前端编译失败"
# 移除 crossorigin 属性以支持 Electron file:// 协议
sed -i '' 's/ crossorigin//g' dist/index.html 2>/dev/null || true

echo "[6/6] 构建 Electron 安装包..."
cd "$DIR/frontend"

case "$1" in
  win) npx electron-builder --win --config build/electron-builder.json ;;
  mac) npx electron-builder --mac --config build/electron-builder.json ;;
  all) npx electron-builder --win --mac --config build/electron-builder.json ;;
  "")  npx electron-builder --win --mac --config build/electron-builder.json ;;
  *) echo "用法: $0 [win|mac|all]"; exit 1 ;;
esac

# 构建完成后清理 build-resources
rm -rf "$RES_DIR"

echo ""
echo "✅ 构建完成！安装包位于: frontend/dist/"
echo "=============================="
