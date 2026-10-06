# AI智慧阅读 - 后端服务

Python 后端，**Flask + SQLAlchemy + Pydantic** MVC 架构。数据全部本地存储；翻译与知识抽取通过 OpenAI 兼容 API 调用远程 LLM。

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
│  纯业务逻辑：文档解析、翻译、知识抽取            │
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
│   └── translator_config.py  # AI 引擎配置（JSON 持久化）
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
│   ├── translator.py         # 翻译（远程 LLM，OpenAI 兼容 API）
│   └── knowledge_extractor.py  # 知识抽取（LLM / 纯正则回退）
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

## AI 引擎

**不自带任何本地模型**，没有 torch / transformers 依赖，安装包不含模型权重（2026-10 移除）。
翻译与知识抽取都通过 OpenAI 兼容 API 调用远程 LLM。

通过 `data/config/translator.json` 配置：

```json
{
  "remote": {
    "provider": "deepseek",   // deepseek | siliconflow | moonshot | openai | ollama | ...
    "api_base": "https://api.deepseek.com",
    "api_key": "",
    "model": "deepseek-chat",
    "max_tokens": 4096,
    "temperature": 0.3
  }
}
```

使用标准 `openai` SDK，兼容任何 OpenAI 格式 API（DeepSeek、硅基流动、智谱 GLM、Ollama 等）。

- 无 `mode` 字段；旧的 `mode: local/remote` 配置会被 pydantic 静默忽略，无需迁移
- 是否可用由 `RemoteConfig.is_configured` 判定（api_base + api_key + model 三者非空）
- `is_configured()` 默认会重新读盘。`TranslatorService` 是进程级单例，`_config` 只在 `translate()` 内刷新，路由直接查状态时必须传 `reload=True`（默认），否则读到启动时的旧配置
- 未配置时翻译返回 `{"translated_text": "", "error": "..."}`；知识抽取自动回退纯正则规则

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
| POST | `/api/backup` | system（导出备份到 `dest_path`） |
| POST | `/api/restore` | system（从 `path` 恢复，整体覆盖） |
| POST | `/api/data/clear` | system（清除书籍文件+数据+缓存，保留 config） |
| GET/PUT | `/api/settings/translator` | settings（AI 引擎配置） |
| GET | `/api/settings/translator/presets` | settings（厂商预设） |
| POST | `/api/settings/translator/models` | settings（拉取厂商可用模型列表） |

## 数据存储

| 存储 | 路径 |
|------|------|
| SQLite | `data/db/database.db`（WAL 模式） |
| 书籍 | `data/books/` |
| 缓存 | `data/cache/` |
| 导出 | `data/exports/` |
| 配置 | `data/config/translator.json` |

## 端口

- `127.0.0.1:5001`（仅本地回环）

## 数据库

- SQLite WAL 模式，8 张表
- 连接池：pool_size=20, max_overflow=40
- 文件位置：`../data/db/database.db`
