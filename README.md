# 📖 AI智慧阅读

**纯离线本地 AI 智能阅读软件** — 集成电子书阅读、多语种AI翻译、知识抽取、知识图谱可视化的一体化学习工具。

## ✨ 功能特性

### 📚 电子书阅读
- 支持 PDF（文本/扫描版）、DOCX 格式导入
- 分页渲染、保留原文排版、自动识别目录
- 划线、高亮、批注、笔记、书签
- 阅读进度自动保存、全书关键词检索
- 护眼模式、字体/行距调节、全屏阅读

### 🌐 离线 AI 翻译
- 支持中英中日中韩中法等 200+ 语种双向互译
- 划词翻译 + 全文双语对照翻译
- 长难句智能优化、专业术语优化
- 翻译记录本地保存、生词摘录

### 🧠 AI 知识抽取
- 全自动解析书籍文本，无需人工标注
- 自动抽取：核心概念、专业名词、定理、案例
- 自动识别逻辑关系：因果、包含、对比、递进
- 生成层级知识结构：章节→要点→知识点

### 🎯 知识图谱可视化
- 力导向知识图谱自动生成（ECharts Force Graph）
- 缩放、拖拽、节点详情展开
- 节点双击回溯原文（规划中）
- 支持手动编辑图谱
- PNG 图谱 / 知识大纲本地导出

### 🔒 数据隐私
- 100% 本地离线运行，零网络请求
- 所有数据存储于本地 SQLite + 文件系统
- 支持手动备份 / 导出 / 重置

## 🏗️ 系统架构

```
┌─────────────────────────────────────────┐
│         UI交互层 (Electron)              │
│  阅读渲染 │ 图谱可视化 │ 用户操作界面    │
├─────────────────────────────────────────┤
│         业务逻辑层 (Python Flask)        │
│  文档解析 │ OCR识别 │ 翻译调度 │ 知识抽取 │
├─────────────────────────────────────────┤
│         AI模型推理层 (本地量化模型)       │
│  NLLB-200 │ BERT │ PaddleOCR │ 向量模型  │
├─────────────────────────────────────────┤
│         本地数据存储层                    │
│  SQLite + 本地资源文件夹                  │
└─────────────────────────────────────────┘
```

## 🚀 快速启动

### 环境要求
- **操作系统**: Windows 10/11 或 macOS 10.15+
- **内存**: 8GB+（推荐 16GB）
- **存储**: 5GB+（含模型文件）
- **Python**: 3.9+
- **Node.js**: 18+
- **包管理**: [uv](https://docs.astral.sh/uv/)（Python），npm（Node.js）

### 一键启动

```bash
# Mac / Linux
chmod +x start.sh
./start.sh

# Windows
双击 start.bat
```

### 手动启动

```bash
# 1. 启动 Python 后端（使用 uv）
cd backend
uv sync                        # 安装依赖
uv run python app.py &        # 启动后端服务 (127.0.0.1:5001)

# 2. 启动 前端
cd frontend
npm install
npm start
```

### 下载 AI 模型（可选）

项目依赖两个离线 AI 模型，均为**可选** — 不下载也不影响程序运行（自动降级到规则模式）：

| 模型 | 用途 | 大小 | 下载命令 |
|------|------|------|---------|
| **NLLB-200** | **离线翻译** — 200 语种双向翻译（中/英/日/韩/法/德等） | ~600MB | `uv run python ../scripts/download_models.py nllb200_4bit --mirror` |
| **BERT** | **知识抽取** — 从书籍中自动提取概念、关系、层级大纲 | ~400MB | `uv run python ../scripts/download_models.py bert4cls_small --mirror` |

```bash
cd backend
uv run python ../scripts/download_models.py --list                        # 查看已下载的模型
uv run python ../scripts/download_models.py --all --mirror                # 下载全部模型（国内镜像）
```

### 打包为安装程序

打包命令会将 Python 后端、虚拟环境、数据目录一并打包进安装包：

```bash
# 先确保模型已下载（可选）
cd backend
uv run python ../scripts/download_models.py --all --mirror

# 打包 macOS DMG（需 macOS）
cd frontend
npm run build:mac

# 打包 Windows 安装包（需 Windows）
npm run build:win

# 两者同时
npm run build:all
```

打包流程：
1. 复制 `backend/` 代码 + `.venv/`（裁剪体积）
2. 复制 `data/models/`（如有则打包 AI 模型）
3. 创建数据目录占位
4. 调用 electron-builder 生成安装包
5. 安装包位于 `frontend/dist/`

> 用户安装后开箱即用，无需手动安装 Python 或下载模型。
> 安装目录下包含完整的 Python 运行时 + 所有依赖 + AI 模型。

## 📁 项目结构

```
smart_reading/
├── backend/                    # Python 后端（MVC）
│   ├── app.py                 # 入口（Flask 应用工厂）
│   ├── core/                  # 基础设施
│   │   ├── config.py          # 路径 + 服务容器
│   │   └── database.py        # SQLAlchemy 引擎/会话
│   ├── models/                # ORM 模型（8 张表）
│   ├── schemas/               # Pydantic 请求/响应校验
│   ├── routes/                # 控制器（8 个模块）
│   ├── services/              # 业务逻辑（解析/翻译/知识/OCR）
│   └── pyproject.toml         # 依赖管理（uv）
├── frontend/                   # 前端（React + Vite）
│   ├── main.js                # Electron 主进程
│   ├── preload.js             # 安全桥接
│   ├── index.html             # Vite 入口
│   ├── vite.config.js         # 构建配置
│   ├── src/                   # React 源码
│   │   ├── main.jsx           # React 入口
│   │   ├── App.jsx            # 根组件
│   │   ├── App.css            # 全局样式
│   │   ├── api.js             # API 客户端
│   │   ├── pages/             # 页面组件
│   │   └── components/        # 组件
│   └── dist_vue/              # 构建产物
├── data/                      # 本地数据
│   ├── db/                    # SQLite 数据库
│   ├── books/                 # 书籍文件
│   ├── cache/                 # 缓存
│   ├── exports/               # 导出/备份
│   └── models/                # AI 模型权重
├── scripts/
│   └── download_models.py     # 模型下载助手
├── build/
│   └── electron-builder.json  # 打包配置
├── CLAUDE.md                  # AI 辅助开发指南
├── start.sh / start.bat       # 启动脚本
└── README.md
```

## 🧩 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 28+ | 跨平台桌面应用 |
| 前端框架 | React 18 + Ant Design 5 | 组件化 UI |
| PDF 渲染 | react-pdf | 文字选中、缩放原生支持 |
| 图谱可视化 | ECharts 5 | 力导向知识图谱 |
| 后端框架 | Flask 3.0 | 轻量 REST API |
| 数据库 | SQLite (WAL 模式) | 本地结构化存储 |
| 包管理 | uv (Python) / npm (Node.js) | 依赖管理 |
| AI 翻译 | NLLB-200 4bit | 200+ 语种量化模型 |
| 知识抽取 | BERT 微调版 | 实体/关系提取 |
| OCR | PaddleOCR 量化版 | 扫描 PDF 识别 |
| 文档解析 | PyMuPDF + python-docx | PDF/DOCX 解析 |

## 📋 开发计划

### Phase 1：MVP 基础版 ✅
- [x] 项目架构搭建
- [x] 文档导入渲染
- [x] 基础阅读功能
- [x] 基础离线翻译
- [x] 本地进度保存

### Phase 2：完整功能版 ✅
- [x] 全语种翻译支持
- [x] OCR 扫描解析（PaddleOCR）
- [x] 完整 AI 知识抽取
- [x] 力导向知识图谱
- [x] 数据导出备份
- [ ] 双向原文联动（双击节点回溯）

### Phase 3：性能优化（进行中）
- [ ] 大文件速度优化
- [ ] 模型推理加速
- [ ] UI 美化完善
- [ ] 内存占用优化

## 🔐 安全说明

- 本软件 **完全离线**，不发起任何网络请求
- 所有 AI 模型推理在本地 CPU 执行
- 阅读数据、笔记、翻译记录全部本地存储
- 不会收集任何用户数据或使用统计

## 📄 License

MIT License

---

> **纯本地 · 零联网 · 隐私安全**
