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
│   ├── database.py           # SQLAlchemy 引擎/会话
│   └── translator_config.py  # 翻译模型配置（本地/远程，JSON 持久化）
├── models/                   # ORM 模型
│   └── __init__.py           # 8 张表
├── schemas/                  # 数据校验
│   └── __init__.py           # 全部 Pydantic Schema
├── routes/                   # 控制器（9 个模块）
│   ├── system.py / books.py / progress.py / notes.py
│   ├── bookmarks.py / translation.py
│   ├── knowledge.py / search.py / settings.py
│   └── __init__.py           # 蓝图注册
├── services/                 # 业务逻辑
│   ├── document_parser.py    # PDF（内嵌目录优先）/ DOCX 解析
│   ├── translator.py         # 翻译（本地 NLLB-200 + 远程 LLM，热切换）
│   ├── knowledge_extractor.py  # 知识抽取（规则 + 可选 BERT）
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
| **NLLB-200** | `data/models/nllb200_4bit/model.safetensors` | **离线翻译** — Meta 开源的 200 语种翻译模型。`translator.py` 优先加载，无模型时自动回退到规则翻译或远程 LLM。**注意**：需 safetensors 格式（已转换），`.bin` 文件与 torch 2.2.2 + transformers 4.48 不兼容。 | `uv run python ../scripts/download_models.py nllb200_4bit --mirror` |
| **BERT** | `data/models/bert4cls_small/` | **知识抽取** — Google 的中文预训练模型，自动从书籍文本中提取核心概念、专业名词、定理案例，识别因果/包含/对比等逻辑关系。`knowledge_extractor.py` 优先加载，无模型时用纯正则规则。 | `uv run python ../scripts/download_models.py bert4cls_small --mirror` |

> ⚠️ 两个模型均为**可选依赖**。不下载翻译模型则使用内置规则翻译或远程 LLM；不下载知识模型则使用正则抽取。程序不会因缺少模型而崩溃。

## 翻译引擎（新增）

支持本地 NLLB-200 和远程 LLM 热切换，通过 `data/config/translator.json` 配置：

```json
{
  "mode": "local",            // "local" | "remote"
  "remote": {
    "provider": "openai",     // deepseek | siliconflow | moonshot | ...
    "api_base": "https://api.openai.com/v1",
    "api_key": "",
    "model": "gpt-4o-mini",
    "max_tokens": 4096,
    "temperature": 0.3
  }
}
```

远程模式使用标准 `openai` SDK，兼容任何 OpenAI 格式 API（DeepSeek、硅基流动、智谱 GLM、Ollama 等）。

## API 路由

| 方法 | 路径 | 控制器 |
|------|------|---------|
| GET | `/api/health` | system |
| POST/GET/DELETE | `/api/books[/:id]` | books |
| GET | `/api/books/:id/page/:num` | books |
| GET/PUT | `/api/progress/:bookId` | progress |
| GET/POST/DELETE | `/api/.../notes` | notes |
| GET/POST/DELETE | `/api/.../bookmarks` | bookmarks |
| PUT | `/api/bookmarks/:id` | bookmarks（更新标题） |
| POST | `/api/translate[/full]` | translation |
| GET | `/api/translate/status/:id` | translation |
| POST/GET | `/api/translate/words` | translation |
| POST/GET/PUT | `/api/knowledge/extract\|graph\|export` | knowledge |
| GET | `/api/search/:bookId` | search |
| POST | `/api/backup\|/api/data/clear` | system |
| GET/PUT | `/api/settings/translator` | settings（翻译配置） |
| GET | `/api/settings/translator/presets` | settings（厂商预设） |

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

## 数据库

- SQLite WAL 模式，8 张表
- 连接池：pool_size=20, max_overflow=40
- 文件位置：`../data/db/database.db`
