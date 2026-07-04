# AI智慧阅读 - 后端服务

纯本地离线 Python 后端，**Flask + SQLAlchemy + Pydantic** MVC 架构。

## 快速开始

```bash
cd backend
uv sync
uv run python app.py       # → http://127.0.0.1:5001
```

## 架构：MVC 三层

```
┌──────────────────────────────────────────────┐
│  Controller  (routes/)                       │
│  HTTP 处理、参数校验、调 Service、Schema 序列化 │
├──────────────────────────────────────────────┤
│  Service     (services/)                     │
│  纯业务逻辑：文档解析、翻译、知识抽取、OCR      │
├──────────────────────────────────────────────┤
│  Model       (models/ + schemas/)            │
│  models/   — SQLAlchemy ORM（8 张表）        │
│  schemas/  — Pydantic 请求/响应校验           │
└──────────────────────────────────────────────┘
```

### 目录结构

```
backend/
├── app.py                    # 入口（应用工厂）
├── core/                     # 基础设施
│   ├── config.py             # 路径 + 服务单例
│   └── database.py           # SQLAlchemy 引擎/会话
├── models/                   # ORM 模型
│   └── __init__.py           # 8 张表
├── schemas/                  # 数据校验
│   └── __init__.py           # 全部 Pydantic Schema
├── routes/                   # 控制器
│   ├── system.py / books.py / progress.py / notes.py
│   ├── bookmarks.py / translation.py
│   ├── knowledge.py / search.py
│   └── __init__.py           # 蓝图注册
├── services/                 # 业务逻辑
│   ├── document_parser.py    # PDF/DOCX 解析
│   ├── translator.py         # NLLB-200 离线翻译
│   ├── knowledge_extractor.py  # 知识抽取
│   └── ocr_service.py        # PaddleOCR
└── pyproject.toml
```

## ORM 模型（8 张表）

| 模型 | 表 | 关键字段 |
|------|-----|---------|
| `Book` | books | title, author, file_type, total_pages, chapter_tree(JSON) |
| `ReadingProgress` | reading_progress | book_id(唯一), current_page, percentage |
| `Note` | notes | book_id, page_num, content, selected_text, color |
| `Bookmark` | bookmarks | book_id, page_num, title |
| `TranslationRecord` | translation_records | book_id, source_text, translated_text |
| `Vocabulary` | vocabulary | book_id, word, translation, context |
| `KnowledgeNode` | knowledge_nodes | book_id, node_id, label, node_type, level, parent_id |
| `KnowledgeEdge` | knowledge_edges | book_id, source_id, target_id, relation_type |

## AI 模型说明

| 模型 | 文件 | 用途 | 下载方式 |
|------|------|------|---------|
| **NLLB-200** | `data/models/nllb200_4bit/` | **离线翻译** — Meta 开源的 200 语种翻译模型，支持中/英/日/韩/法/德/俄/西等语言双向互译。`translator.py` 优先加载，无模型时自动回退到规则翻译。 | `uv run python ../scripts/download_models.py nllb200_4bit --mirror` |
| **BERT** | `data/models/bert4cls_small/` | **知识抽取** — Google 的中文预训练模型，自动从书籍文本中提取核心概念、专业名词、定理案例，识别因果/包含/对比等逻辑关系。`knowledge_extractor.py` 优先加载，无模型时用纯正则规则。 | `uv run python ../scripts/download_models.py bert4cls_small --mirror` |

> ⚠️ 两个模型均为**可选依赖**。不下载翻译模型则使用内置规则翻译（基础中英为主）；不下载知识模型则使用正则抽取（精度较低）。程序不会因缺少模型而崩溃。

## API 路由

| 方法 | 路径 | 控制器 |
|------|------|---------|
| GET | `/api/health` | system |
| POST/GET/DELETE | `/api/books[/:id]` | books |
| GET | `/api/books/:id/page/:num` | books |
| GET/PUT | `/api/progress/:bookId` | progress |
| GET/POST/DELETE | `/api/.../notes` | notes |
| GET/POST/DELETE | `/api/.../bookmarks` | bookmarks |
| POST | `/api/translate[/full]` | translation |
| GET | `/api/translate/status/:id` | translation |
| POST/GET | `/api/translate/words` | translation |
| POST/GET/PUT | `/api/knowledge/extract\|graph\|export` | knowledge |
| GET | `/api/search/:bookId` | search |
| POST | `/api/backup\|/api/data/clear` | system |

## 数据存储

| 存储 | 路径 |
|------|------|
| SQLite | `data/db/database.db`（WAL 模式） |
| 书籍 | `data/books/` |
| 缓存 | `data/cache/` |
| 导出 | `data/exports/` |
| 模型 | `data/models/` |

## 端口

- `127.0.0.1:5001`（仅本地回环）
