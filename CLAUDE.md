# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI智慧阅读 — AI 智能阅读软件。数据（书籍、笔记、图谱）全部留在本地；翻译与知识抽取通过 OpenAI 兼容 API 调用**远程 LLM**，不自带任何本地模型。

四层架构：Electron 前端 → Python Flask 后端 → 远程 LLM → SQLite + 文件存储。

后端采用 **MVC 三层**：Controller (routes/) → Service (services/) → Model (models/ + schemas/)

前端采用 **React 18 + Ant Design 5 + react-pdf**

Tech: **Electron 28** / **react-pdf** / **ECharts 6** / **Ant Design 5** / **Flask 3.0** / **SQLAlchemy 2.0** / **Pydantic 2** / **PyMuPDF** / **openai 2** / **SQLite** (WAL)

## Key Commands

### Backend (Python / uv)
```bash
cd backend
uv sync                          # 安装全部依赖
uv run python app.py             # 启动后端 → http://127.0.0.1:5001
uv run python -c "..."           # 在 venv 中运行任意 Python
uv add <pkg>                     # 添加依赖
uv lock                          # 锁定版本
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
npm run build:mac                # macOS 安装包 (.dmg)，实测 176 MB
npm run build:win                # ⚠ 见下方「Windows 打包移植」，当前不可用
# 产物在 frontend/release/ 目录下（不是 dist/）
```

### Windows 打包移植

**不能交叉打包**：`backend/.venv` 是平台绑定的（macOS 是 Mach-O + `bin/`+`lib/python3.10/`，Windows 需要 `Scripts/` + `Lib/` + `.pyd`）。
即使 electron-builder 在 macOS 上能产出 `.exe`，里面装的也是 macOS 的解释器，装到 Windows 上后端起不来。

必须**在 Windows 机器上** `uv sync` 建 Windows venv，并改写 `scripts/build_package.sh`。逐项对照：

| 环节 | macOS（现脚本） | Windows 对应 |
|---|---|---|
| venv 可执行目录 | `.venv/bin/` | `.venv/Scripts/` |
| venv 依赖目录 | `.venv/lib/python3.10/site-packages/` | `.venv/Lib/site-packages/` |
| 解释器命令 | `python3` | `python` / `py` |
| 标准库 | `$PYTHON_HOME/lib/python3.10/` | `$PYTHON_HOME/Lib/` + `DLLs/` |
| 运行时库 | `libpython3.10.dylib` → `.venv/lib/` | `python310.dll` → 与 `python.exe` 同目录 |
| 复制 | `rsync -a` / `cp -rL` | `robocopy /E` 或 Node `fs.cpSync`（需 `dereference: true`） |
| 原地改文件 | `sed -i ''`（BSD） | `sed -i`（GNU）或直接用 Node/PowerShell |
| shell | bash | PowerShell 或 Git Bash |

**运行时已经处理好了**，不用动：`frontend/main.js` 里 `venvBinDir()`／`getPythonCommand()`／`killStaleBackend()` 都按 `process.platform` 分派（Windows 走 `Scripts/python.exe` 和 `netstat`+`taskkill`）。

**两个容易踩的点**：
- `pyvenv.cfg` 的 `home` 会被打包脚本写成**构建机的绝对路径**（且在 `build-resources/` 下，构建完就被删）。它靠 `main.js` 的 `fixPyvenvConfig()` 在每次启动时改写成本机实际路径来自愈 —— 所以**直接执行包里的 `bin/python3` 会报 `No module named 'encodings'`，这是正常的**，不代表包坏了，要通过应用启动来验证。
- `data/` 下四个都是空目录，electron-builder 会跳过空目录，包内没有 `data/`。由主进程和后端的 `os.makedirs` 在首次启动时创建 —— 因此应用**必须装在可写位置**。

### Start Everything
```bash
# 两个终端分别跑：后端 uv run python app.py，前端 npm start
# 打包后运行时 Electron 主进程会自动拉起 Python 后端，无需手动启动
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

### 数据备份

设置页「数据管理」三件事，对应 `backend/routes/system.py`：

| 接口 | 行为 |
|------|------|
| `POST /api/backup {dest_path}` | 导出到用户选定路径。打包 `database.db`（backup API 快照，穿透 WAL）+ `books/` + `cache/` + `config/translator.json` + `manifest.json`。先写临时名再 `os.replace` 原子改名 |
| `POST /api/restore {path}` | 整体替换（非合并）。校验 `manifest.json` 的 `format` 标识；解压时逐个成员做 `realpath` + `commonpath` 校验防 zip-slip；用 `backup()` 写入当前库；重写 `file_path` |
| `POST /api/data/clear` | 清 8 张表 + `books/` 与 `cache/` 全部内容（跳过 `.gitkeep`），**保留 `config/`** |

`cache/` 必须进备份：`book_<id>_text.txt` / `_pages.json` 是正文来源，没有任何重新生成的路径，漏掉的话恢复后的书能列出来但打不开。book id 原样保留，cache 键才继续对得上。

### Backend Service Modules
- `document_parser.py` — PDF (PyMuPDF / 内嵌目录优先) / DOCX (python-docx) 解析，章节识别。扫描版 PDF 无文本层时会置 `is_scan_pdf`，不提供 OCR
- `translator.py` — 翻译服务，通过 OpenAI 兼容 API 调用远程 LLM，配置见 `data/config/translator.json`；未配置时返回结构化 `error` 而非假译文
- `knowledge_extractor.py` — 知识抽取。已配置 AI 引擎时走 LLM，否则回退纯正则规则（离线仍可用）

### Database (SQLite WAL mode)
8 tables: `books`, `reading_progress`, `notes`, `bookmarks`, `translation_records`, `vocabulary`, `knowledge_nodes`, `knowledge_edges`

### Data Directory Layout
```
data/
├── db/          # SQLite 数据库
├── books/       # 原始 PDF/DOCX
├── config/      # translator.json（AI 引擎配置）
├── exports/     # 备份包、大纲导出
└── cache/       # 分页文本、翻译结果、图谱 JSON
```

## AI Engine

**不自带任何本地模型** —— 安装包不含模型权重，也没有 torch / transformers 依赖（2026-10 移除）。
翻译与知识抽取都通过 OpenAI 兼容 API 调用远程 LLM。

预设厂商（`backend/core/translator_config.py` 的 `PROVIDER_PRESETS`）：DeepSeek、硅基流动、月之暗面、智谱 GLM、阿里通义千问、字节豆包、讯飞星火、OpenAI、Anthropic(需 proxy)、Google Gemini、xAI Grok、Ollama

### 配置 (`data/config/translator.json`)

```json
{ "remote": { "provider": "deepseek", "api_base": "...", "api_key": "...", "model": "...", "max_tokens": 4096, "temperature": 0.3 } }
```

- 无 `mode` 字段。旧的 `mode: local/remote` 配置无需迁移，多余键会被 pydantic 静默忽略
- 是否可用由 `RemoteConfig.is_configured` 判定（api_base + api_key + model 三者非空）
- **热切换**：`load_config()` 每次调用都重新读盘，`TranslatorService._reload_config()` 在每次 `translate()` 开头执行，所以设置页保存后立即生效，无需重启

### Settings 页面

单页 Modal（无 Tab），三节：阅读（护眼模式）/ AI 引擎 / 数据管理。
「获取模型」按钮调 `POST /api/settings/translator/models`，走厂商的 `GET /models` 填充 AutoComplete 下拉；
不支持该接口的厂商（如 Anthropic 兼容端点）会返回可读错误，用户仍可手工输入模型名。

### Translator Details

- 语言检测用 `langdetect` + CJK 启发式混合策略
- `langdetect` 短文本（<30 字符）直接跳过，走 CJK 字符比例检测
- `langdetect` 返回地区码（`zh-cn`）自动映射为短码（`zh`）
- 翻译失败时返回 `{"translated_text": "", "error": "<可读原因>"}`，前端翻译面板用 `Alert` 展示并给「去设置」入口

## Key Patterns

- **配置热切换**: `load_config()` 每次都重读 JSON，不缓存。所有用到 AI 配置的服务（translator / knowledge_extractor）在动作前都会 `_reload_config()`
- **服务是进程级单例**: `TranslatorService` 由 `core/config.py:_get_service()` 缓存。外部直接读它的状态前必须先刷新配置（见 `is_configured(reload=True)`），否则拿到的是启动时的旧值
- **备份/恢复必须走 SQLite 的 backup API**：`database.db` 是 WAL 模式，直接 `shutil.copy2` 主库文件会丢掉还留在 `-wal` 里的事务（真的丢过 2.4MB）。恢复同理 —— **不要替换 db 文件、不要删 `-wal`/`-shm`**：Flask 是多线程的，`engine.dispose()` 只能关掉池里空闲的连接，其它线程已借出的连接仍持有旧 `-shm` 映射，删除伴随文件会导致随机的 `disk I/O error`。统一用 `src.backup(dst)` 按页搬运
- **恢复后必须重写 `books.file_path`**：库里存的是绝对路径，换机器/换安装位置后会全部悬空（`/file` 404、删除静默失效）。按 `BOOKS_DIR + basename(旧路径)` 改回
- **后台任务**: 全文翻译 / 知识抽取用 `threading.Thread(daemon=True)` 异步执行
- **前端跨组件通信**: 用 `window` 自定义事件（`go-to-page` / `refresh-bookmarks` / `toggle-panel` / `open-settings`），由 `App.jsx` 统一监听
- **IPC 权限**: 渲染进程通过 `preload.js` 的 `contextBridge` 暴露有限 API
- **后端进程管理**: `startPythonBackend()` 自动检测 `python3` 命令
- **后端自动重启**: 进程意外退出后 3 秒自动拉起
- **PDF 文字选中**: react-pdf text layer + `window.getSelection()` → 自动填充翻译

## Critical Constraints

- **Python 3.10** — `.python-version` 与 `scripts/build_package.sh` 打包的运行时都是 3.10。移除 torch 后这条已不是硬性要求，但改动会牵动打包脚本里的 Python 运行时复制，未动
- **`[tool.uv] required-environments`** 锁定 `darwin/x86_64`，同样是 torch 时代的遗留，可以放开但需一并验证打包
- **打包不含模型**: `scripts/build_package.sh` 只创建空的 `data/{db,books,cache,exports}`，不复制任何模型权重

## Quality Notes

- 翻译和知识抽取都走远程 LLM，设置页保存后实时生效，无需重启
- 使用标准 OpenAI SDK，兼容任何 OpenAI 格式 API
- 未配置 AI 引擎时：翻译返回结构化错误并引导去设置；知识抽取自动回退纯正则规则
- 全文翻译在未配置 / 无可翻译文本（扫描版 PDF）时直接返回 400，不起空跑的后台线程
- 语言检测使用 `langdetect` + CJK 启发式，短文本（<30 字符）绕过 langdetect 直接走启发式
- 知识图谱展示支持力导向/环形/辐射三种布局 + 连线/标签/疏密度控制
- Reader 同时支持 PDF（react-pdf 渲染）和 DOCX（文本分页渲染，白底黑字带阴影）
- PDF 目录优先使用内嵌书签（`doc.get_toc()`），无内嵌目录时回退正则识别
- 护眼模式（`body.eye-care`）**只作用于阅读区与工具面板**，顶栏菜单、书库、设置弹窗保持原样
