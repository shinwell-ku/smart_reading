# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI智慧阅读 — 纯本地离线 AI 智能阅读软件。四层架构：Electron 前端 → Python Flask 后端 → 本地量化 AI 模型 → SQLite + 文件存储。

后端采用 **MVC 三层**：Controller (routes/) → Service (services/) → Model (models/ + schemas/)

前端采用 **React 18 + Ant Design 5 + react-pdf**

Tech: **Electron 28** / **react-pdf** / **ECharts 6** / **Ant Design 5** / **Flask 3.0** / **SQLAlchemy 2.0** / **Pydantic 2** / **PyMuPDF** / **PyTorch 2.2** (CPU) / **Transformers 4** / **openai 2** / **SQLite** (WAL)

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
npm run build                    # 仅编译前端
npm run build:win                # 打包 Windows
npm run build:mac                # 打包 macOS
```

### Build Production Package
```bash
cd frontend
npm run build:mac                # macOS 安装包 (.dmg)
npm run build:win                # Windows 安装包 (.exe)
# 产物在 frontend/dist/ 目录下
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
├── core/            # 基础设施（config + database + translator_config）
├── models/          # SQLAlchemy ORM（8 张表）
├── schemas/         # Pydantic 校验
├── routes/          # 控制器（9 个模块）
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
├── dist/            # Vite 构建产物
└── vite.config.js       # Vite 配置
```

### Backend Service Modules
- `document_parser.py` — PDF (PyMuPDF / 内嵌目录优先) / DOCX (python-docx) 解析，章节识别
- `translator.py` — 翻译服务，支持本地 NLLB-200 模型 + 远程 LLM（OpenAI 兼容 API），通过 `data/config/translator.json` 配置热切换
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
| **NLLB-200** | 200-language translation (local mode) | Rule-based translation (basic EN/CN only), or Remote LLM |
| **BERT** (已移除) | 知识抽取（已由规则替代） | Regex-based extraction |

两个模型均为**可选** — 不下载也不影响程序运行。

### NLLB-200 Model State (as of 2026-07-04)

- **格式**: `data/models/nllb200_4bit/model.safetensors` (2.3 GB, 已安装)
- **原格式**: 最初为 `pytorch_model.bin`，因 transformers 4.57+ 对 `.bin` 文件强制 `weights_only=True`（CVE-2025-32434），要求 torch ≥ 2.6，与项目使用的 torch 2.2.2 不兼容。已转换为 safetensors 格式。
- **下载命令**: `uv run python scripts/download_models.py nllb200_4bit --mirror`
- **重要**: 重新下载后得到的 `.bin` 文件需要用上述方法转换为 safetensors，否则 `from_pretrained(local_files_only=True)` 会报 torch 版本错误。

### 翻译引擎 (支持热切换)

通过设置页面或 `data/config/translator.json` 配置：

| 模式 | 说明 | 配置项 |
|------|------|--------|
| **本地模式** | NLLB-200 离线模型，免费但质量一般 | `mode: local` |
| **远程模式** | 通过 OpenAI 兼容 API 调用外部 LLM | `mode: remote` + 厂商/地址/Key/模型 |

远程模式预设厂商（OpenAI 兼容 API）：DeepSeek、硅基流动、月之暗面、智谱 GLM、阿里通义千问、字节豆包、讯飞星火、OpenAI、Anthropic(需 proxy)、Google Gemini、xAI Grok、Ollama

### Translator Details

- 语言检测用 `langdetect` + CJK 启发式混合策略
- `langdetect` 短文本（<30 字符）直接跳过，走 CJK 字符比例检测
- `langdetect` 返回地区码（`zh-cn`）自动映射为短码（`zh`）

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
- **`transformers < 5.0`** — 与 torch 2.2 兼容。uv 环境实际安装 transformers 4.48.3
- **`numpy < 2.0`** — torch 2.2 要求 numpy 1.x

## Quality Notes

- 翻译引擎支持本地 NLLB 和远程 LLM 热切换，设置页面实时生效
- 翻译远程模式使用标准 OpenAI SDK，兼容任何 OpenAI 格式 API
- 语言检测使用 `langdetect` + CJK 启发式，短文本（<30 字符）绕过 langdetect 直接走启发式
- 知识抽取模型未下载时使用纯正则规则
- 知识图谱展示支持力导向/环形/辐射三种布局 + 连线/标签/疏密度控制
- PaddleOCR 首次加载耗时约 30-60s
- Reader 同时支持 PDF（react-pdf 渲染）和 DOCX（文本分页渲染，白底黑字带阴影）
- PDF 目录优先使用内嵌书签（`doc.get_toc()`），无内嵌目录时回退正则识别
