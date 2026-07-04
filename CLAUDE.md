# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI智慧阅读 — 纯本地离线 AI 智能阅读软件。四层架构：Electron 前端 → Python Flask 后端 → 本地量化 AI 模型 → SQLite + 文件存储。

后端采用 **MVC 三层**：Controller (routes/) → Service (services/) → Model (models/ + schemas/)

前端采用 **React 18 + Ant Design 5 + react-pdf**

Tech: **Electron 28** / **react-pdf** / **ECharts 5** / **Ant Design 5** / **Flask 3.0** / **SQLAlchemy 2.0** / **Pydantic 2** / **PyMuPDF** / **PyTorch 2.2** (CPU) / **Transformers 4** / **PaddleOCR** / **SQLite** (WAL)

## Key Commands

### Backend (Python / uv)
```bash
cd backend
uv sync                          # 安装全部依赖
uv run python app.py             # 启动后端 → http://127.0.0.1:5001
uv run python -c "..."           # 在 venv 中运行任意 Python
uv add <pkg>                     # 添加依赖
uv lock                          # 锁定版本
uv run python ../scripts/download_models.py --list            # 查看 AI 模型状态
uv run python ../scripts/download_models.py nllb200_4bit --mirror  # 下载翻译模型
```

### Frontend (React + Vite)
```bash
cd frontend
npm install                      # 安装依赖
npm start                        # 编译 + 启动 Electron
npm run build:vue                # 仅编译前端
npm run build:win                # 打包 Windows
npm run build:mac                # 打包 macOS
```

### Start Everything
```bash
./start.sh                       # 一键启动后端 + 前端
```

## Architecture

### Process Model
```
Electron Main Process (main.js)
  ├── 管理 Python 后端子进程（启动/停止/健康检查）
  ├── IPC handler: dialog:openFile, file:read, file:copyToBooks
  └── 窗口管理（contextIsolation: true, nodeIntegration: false）

Electron Renderer → preload.js (contextBridge) → fetch → Python Flask API (127.0.0.1:5001)
```

### Backend MVC Structure
```
backend/
├── app.py           # 入口
├── core/            # 基础设施（config + database）
├── models/          # SQLAlchemy ORM（8 张表）
├── schemas/         # Pydantic 校验
├── routes/          # 控制器（8 个模块）
└── services/        # 业务逻辑
```

### Frontend Structure
```
frontend/
├── main.js              # Electron 主进程
├── preload.js           # 安全桥接
├── src/                 # React 源码
│   ├── main.jsx         # React 入口
│   ├── App.jsx          # 根组件（布局 + 导航）
│   ├── App.css          # 全局样式
│   ├── api.js           # HTTP API 客户端
│   ├── pages/           # 页面组件
│   │   ├── Library.jsx  # 书库
│   │   ├── Reader.jsx   # PDF 阅读器（react-pdf）
│   │   ├── Settings.jsx # 设置
│   │   └── About.jsx    # 关于
│   └── components/
│       └── SidePanel.jsx # 翻译/笔记/书签/图谱侧面板
├── dist_vue/            # Vite 构建产物
└── vite.config.js       # Vite 配置
```

### Backend Service Modules
- `document_parser.py` — PDF (PyMuPDF) / DOCX (python-docx) 解析，章节识别
- `translator.py` — 离线翻译，优先加载 `data/models/nllb200_4bit`，无模型时静默回退
- `knowledge_extractor.py` — 规则+NLP混合知识抽取
- `ocr_service.py` — PaddleOCR，扫描版PDF识别

### Database (SQLite WAL mode)
8 tables: `books`, `reading_progress`, `notes`, `bookmarks`, `translation_records`, `vocabulary`, `knowledge_nodes`, `knowledge_edges`

### Data Directory Layout
```
data/
├── db/          # SQLite 数据库
├── books/       # 原始 PDF/DOCX
├── exports/     # 备份包、大纲导出
├── cache/       # 分页文本、翻译结果、图谱 JSON
└── models/      # AI 模型权重
```

## AI Models

| Model | What it does | Fallback without it |
|-------|-------------|---------------------|
| **NLLB-200** | 200-language translation | Rule-based translation (basic EN/CN only) |
| **BERT** | Chinese knowledge extraction | Regex-based extraction (lower accuracy) |

Both are **optional** — the app degrades gracefully without them.

## Key Patterns

- **零网络策略**: 所有 `transformers` / `AutoModel` 加载必须用 `local_files_only=True`
- **后台任务**: 全文翻译 / 知识抽取用 `threading.Thread(daemon=True)` 异步执行
- **IPC 权限**: 渲染进程通过 `preload.js` 的 `contextBridge` 暴露有限 API
- **后端进程管理**: `startPythonBackend()` 自动检测 `python3` 命令
- **后端自动重启**: 进程意外退出后 3 秒自动拉起
- **PDF 文字选中**: react-pdf text layer + `window.getSelection()` → 自动填充翻译

## Critical Constraints

- **Python 3.10** — paddlepaddle/paddleocr 需要此版本
- **`torch` 锁定 2.2.x** — Python 3.10 + macOS x86_64 最高版本
- **`transformers < 5.0`** — 与 torch 2.2 兼容
- **`numpy < 2.0`** — torch 2.2 要求 numpy 1.x

## Quality Notes

- 翻译模型未下载时自动回退规则翻译
- 知识抽取模型未下载时使用纯正则规则
- PaddleOCR 首次加载耗时约 30-60s
