# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI智慧阅读 — 纯本地离线 AI 智能阅读软件。四层架构：Electron 前端 → Python Flask 后端 → 本地量化 AI 模型 → SQLite + 文件存储。

后端采用 **MVC 三层**：Controller (routes/) → Service (services/) → Model (models/ + schemas/)

Tech: **Electron 28** / **PDF.js** / **ECharts 5** / **Flask 3.0** / **SQLAlchemy 2.0** / **Pydantic 2** / **PyMuPDF** / **PyTorch 2.2** (CPU) / **Transformers 4** / **PaddleOCR** / **SQLite** (WAL)

## Key Commands

### Backend (Python / uv)
```bash
cd backend
uv sync                          # 安装全部依赖（含 OCR）
uv sync --extra dev              # 含开发工具
uv run python app.py             # 启动后端 → http://127.0.0.1:5001
uv run python -c "..."           # 在 venv 中运行任意 Python
uv add <pkg>                     # 添加依赖
uv add --dev <pkg>               # 添加开发依赖
uv lock                          # 锁定版本
uv run python scripts/download_models.py --list                 # 查看 AI 模型状态
uv run python scripts/download_models.py nllb200_4bit --mirror  # 下载翻译模型
uv run python scripts/download_models.py --all --mirror         # 下载全部模型
```

### Frontend (Electron / npm)
```bash
cd electron
npm install                      # 安装依赖
npm start                        # 启动应用（自动拉起 Python 后端）
npm run dev                      # 开发模式（带 DevTools）
npm run build:win                # 打包 Windows 安装包
npm run build:mac                # 打包 macOS DMG
npm run build:all                # 同时构建两种平台
```

### ECharts 离线库安装（首次）
```bash
cd electron
npm install echarts --save-dev
cp node_modules/echarts/dist/echarts.min.js src/lib/
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

### Backend Service Modules (`backend/services/`)
- `document_parser.py` — PDF (PyMuPDF) / DOCX (python-docx) 解析，章节识别，分页
- `translator.py` — 离线翻译，优先加载 `data/models/nllb200_4bit`，无模型时静默回退
- `knowledge_extractor.py` — 规则+NLP混合知识抽取，加载 `data/models/bert4cls_small`（可选）
- `ocr_service.py` — PaddleOCR，扫描版PDF识别

### Frontend Modules (`electron/src/js/`)
- `app.js` — 主控制器：导航切换、后端心跳检查、设置面板
- `api.js` — 纯 HTTP 客户端（fetch → http://127.0.0.1:5001/api/...）
- `library.js` — 书库：书籍列表、导入、搜索、删除
- `reader.js` — 阅读器：PDF分页渲染、翻页、笔记、书签、阅读设置
- `translation.js` — 翻译界面：划词/全文翻译、语言切换、历史
- `knowledge.js` — ECharts 力导向图谱渲染、节点交互、大纲导出

### Database (SQLite WAL mode)
8 tables: `books`, `reading_progress`, `notes`, `bookmarks`, `translation_records`, `vocabulary`, `knowledge_nodes`, `knowledge_edges`

### Data Directory Layout
```
data/
├── db/          # SQLite 数据库 (database.db)
├── books/       # 原始 PDF/DOCX
├── exports/     # 备份包、大纲导出
├── cache/       # 分页文本、翻译结果、图谱 JSON（按 book_id 命名）
└── models/      # AI 模型权重（nllb200_4bit/, bert4cls_small/）
```

## AI Models

| Model | What it does | Fallback without it |
|-------|-------------|---------------------|
| **NLLB-200** (`data/models/nllb200_4bit/`) | 200-language translation via `translator.py` | Rule-based translation (basic EN/CN only) |
| **BERT** (`data/models/bert4cls_small/`) | Chinese knowledge extraction via `knowledge_extractor.py` | Regex-based extraction (lower accuracy) |

Both are **optional** — the app degrades gracefully without them.

## Key Patterns

- **零网络策略**: 所有 `transformers` / `AutoModel` 加载必须用 `local_files_only=True`，禁用 HuggingFace 自动下载。translator.py 和 knowledge_extractor.py 在无本地模型时静默回退。
- **后台任务**: 全文翻译 / 知识抽取用 `threading.Thread(daemon=True)` 异步执行，前端轮询状态。
- **IPC 权限**: 渲染进程通过 `preload.js` 的 `contextBridge` 暴露有限 API，不持有 `nodeIntegration` 权限。
- **后端进程管理**: `main.js` 的 `startPythonBackend()` 自动检测 `python3` 命令，解析 stdout 中 "启动" 关键字确认服务就绪。

## Critical Constraints

- **Python 3.10** (uv .python-version) — paddlepaddle/paddleocr 需要此版本且同时兼容 macOS x86_64 wheel
- **`torch` 锁定 2.2.x** — Python 3.10 + macOS x86_64 能获取到的最高 torch 版本
- **`transformers < 5.0`** — 与 torch 2.2 兼容
- **`numpy < 2.0`** — torch 2.2 要求 numpy 1.x
- **`tool.uv.required-environments`** 配置在 `pyproject.toml` 中，确保 uv 能正确解析 macOS x86_64 的 wheel

## Quality Notes

- 翻译模型未下载时自动回退规则翻译，不抛异常
- 知识抽取模型未下载时使用纯正则规则，结果可用但精度较低
- PaddleOCR 首次加载会编译 CUDA 相关代码（即使 CPU only），耗时约 30-60s，属正常行为
