# 📖 AI智慧阅读

**AI 智能阅读软件** — 集成电子书阅读、多语种 AI 翻译、知识抽取、知识图谱可视化的一体化学习工具。

书籍、笔记、翻译记录等数据全部留在本地；翻译与知识抽取通过 OpenAI 兼容 API 调用远程大模型。

## ✨ 功能特性

### 📚 电子书阅读
- 支持 PDF（文本/扫描版）、DOCX 格式导入
- 分页渲染、保留原文排版、自动识别目录
- 划线、高亮、批注、笔记、书签
- 阅读进度自动保存、全书关键词检索
- 护眼模式（阅读区与工具面板米色纸感配色）、字体/行距调节、全屏阅读

### 🌐 AI 翻译（远程 LLM）
- 通过 OpenAI 兼容 API 调用大模型，不捆绑任何本地模型
- 预设厂商：DeepSeek、硅基流动、月之暗面、智谱 GLM、阿里通义千问、字节豆包、讯飞星火、OpenAI、Google Gemini、xAI Grok、Ollama
- 一键「获取模型」从厂商接口拉取可用模型列表
- 划词翻译 + 全文双语对照翻译
- 翻译记录本地保存、生词摘录

### 🧠 AI 知识抽取
- 全自动解析书籍文本，无需人工标注
- 自动抽取：核心概念、专业名词、定理、案例
- 自动识别逻辑关系：因果、包含、对比、递进
- 生成层级知识结构：章节→要点→知识点
- 未配置 AI 引擎时自动回退纯正则规则，离线仍可生成图谱

### 🎯 知识图谱可视化
- 三种布局：力导向 / 环形 / 辐射
- 连线过滤：全部连线 / 仅层级 / 仅关系
- 标签密度控制：自动 / 全部 / 隐藏
- 节点疏密度滑块调节
- 缩放、拖拽、节点详情展开
- 图谱 / 知识大纲导出

### 🔒 数据隐私
- 书籍、笔记、翻译记录、生词本全部存储在本地 SQLite + 文件系统
- 不收集任何用户数据或使用统计，无遥测
- 支持手动备份 / 导出 / 重置
- ⚠️ **调用 AI 功能时**，被翻译/抽取的**文本片段**会发送到你配置的厂商 API。书名、笔记、阅读进度等不会外发。翻译引擎可指向 Ollama 等本地服务，此时全程不出本机

## 🏗️ 系统架构

```
┌─────────────────────────────────────────┐
│         UI交互层 (Electron)              │
│  阅读渲染 │ 图谱可视化 │ 用户操作界面    │
├─────────────────────────────────────────┤
│         业务逻辑层 (Python Flask)        │
│  文档解析 │ 翻译调度 │ 知识抽取 │ 检索   │
├─────────────────────────────────────────┤
│         远程 LLM (OpenAI 兼容 API)       │
│  DeepSeek │ 通义 │ 智谱 │ OpenAI │ Ollama│
├─────────────────────────────────────────┤
│         本地数据存储层                    │
│  SQLite + 本地资源文件夹                  │
└─────────────────────────────────────────┘
```

## 🚀 快速启动

### 环境要求
- **操作系统**: Windows 10/11 或 macOS 10.15+
- **内存**: 4GB+
- **存储**: 500MB+
- **Python**: 3.10
- **Node.js**: 18+
- **包管理**: [uv](https://docs.astral.sh/uv/)（Python），npm（Node.js）

### 启动开发版

```bash
# 1. 装依赖（各一次）
cd backend && uv sync          # Python 依赖
cd ../frontend && npm install  # 前端依赖

# 2. 启动：编译前端 + 打开 Electron，并自动拉起 Python 后端
cd frontend
npm start
```

**不需要另开终端起后端** —— Electron 主进程启动时会自己拉起 `backend/.venv` 里的 Python。

只想单独调后端接口（比如用 curl 试 API）时：

```bash
cd backend
uv run python app.py           # → http://127.0.0.1:5001
```

### 配置 AI 引擎

打开应用后点顶栏「⚙️ 设置」，在 **AI 引擎** 一节：

1. 选择厂商（自动填入接口地址和默认模型）
2. 填入 API Key
3. 点「获取模型」从接口拉取可用模型列表，或直接手工输入模型名
4. 点「保存配置」——立即生效，无需重启

配置写入 `data/config/translator.json`。

### 打包为安装程序

产物在 `frontend/release/`。两个平台共用一个打包脚本 `scripts/build-package.mjs`（Node 写的，不需要 bash / Git Bash）：

```bash
cd frontend
npm run build:mac        # → AI-SmartReading-1.0.0.dmg（实测 176 MB）
npm run build:win        # → AI-SmartReading-Setup-1.0.0.exe
npm run build:all        # 两个都要（仅同平台可打的那个会成功）
```

> 安装包文件名是英文，但**安装后显示的应用名是中文「AI智慧阅读」**（`productName`）。文件名用英文是因为 Release 上传时中文会被 GitHub 剥掉。

脚本做的事：复制 `backend/` 代码 → 复制 `.venv/` 并让它**脱离本机也能跑** → 创建 `data/{db,books,cache,exports}` 占位 → 编译前端 → 调 electron-builder。

**不打包任何模型权重**，安装后无需装 Python。

> ⚠️ `data/` 在安装包里是**空目录**，electron-builder 会跳过空目录，所以包内没有它 —— 首次启动时由主进程/后端自动创建。因此**应用必须安装到可写位置**（默认的 `/Applications` 或 `%LOCALAPPDATA%` 都可以）。

#### Python 运行环境是怎么跟进包里的

两个平台的放法不同，脚本内部分派：

| | macOS | Windows |
|---|---|---|
| 标准库 | `.venv/lib/python3.10/` | `backend/python-runtime/Lib/` |
| 运行时链接库 | `libpython3.10.dylib` → `.venv/lib/` | `python310.dll` → `python-runtime/` **和** `.venv/Scripts/` |
| `pyvenv.cfg` 的 `home` | `.venv/bin` | `backend/python-runtime` |

原因是 POSIX 版 CPython 发现自己在 `bin/` 目录里时会自动往上一层找 prefix，Windows 版没有这条规则 —— 所以 Windows 侧直接给出一份完整的 Python 安装目录（`python.exe` 与 `Lib/`、`DLLs/` 同级），CPython 必然认得。
`frontend/main.js` 每次启动还会按同样规则再改一次 `pyvenv.cfg`，把构建机的绝对路径覆盖掉。

#### Windows 打包

**不能交叉打包，必须在 Windows 机器上构建。**

```powershell
# 1. 准备：Python 3.10、Node 18+、uv（https://docs.astral.sh/uv/）

# 2. 建 Windows 版 venv —— 不能复用 macOS 的，那里面是 Mach-O 二进制
cd backend
uv sync

# 3. 打包
cd ..\frontend
npm install
npm run build:win        # → release\AI-SmartReading-Setup-1.0.0.exe
```

脚本的 `preflight` 会自己挡住跨平台误操作：venv 布局与宿主机对不上、或目标平台不是当前平台，都会直接报错退出 —— 而不是产出一个装到用户机器上才发现的坏包。

### 发布新版本

以发 `1.0.1` 为例，顺序不能颠倒。

#### 1. 改版本号

```bash
cd frontend
npm version patch --no-git-tag-version     # patch 修 bug / minor 加功能 / major 不兼容
```

**`--no-git-tag-version` 不能省** —— 否则 npm 会自己替你 commit 并打 tag，和下面手动控制的流程打架。

版本号是**单点来源**：安装包文件名（electron-builder 的 `${version}`）和「关于」页（`vite.config.js` 注入的 `__APP_VERSION__`）都从 `frontend/package.json` 取，改这一处就够。

#### 2. 打包

```bash
npm run build:mac                  # → frontend/release/AI-SmartReading-1.0.1.dmg
```

Windows 包**必须在 Windows 机器上**构建（见上一节）：

```powershell
cd backend ; uv sync
cd ..\frontend ; npm run build:win
```

#### 3. 提交并打 tag

```bash
cd ..
git add -A
git commit -m "chore: 发布 v1.0.1"
git push

git tag v1.0.1                     # tag 名必须和 package.json 的版本一致，v 前缀别丢
git push origin v1.0.1
```

> 先推提交、再推 tag。如果 tag 打错了要挪位置，得删掉重建：
> `git push origin :refs/tags/v1.0.1` 然后重新 `git tag` + `git push`。

#### 4. 建 Release

GitHub → **Releases → Draft a new release**

| 字段 | 填什么 |
|---|---|
| Choose a tag | 选刚推上去的 `v1.0.1`（**选已有的**，不要在 Release 页新建同名 tag） |
| Release title | `v1.0.1 — <一句话说明>` |
| Describe this release | 写这一版改了什么 |
| Release label | 不填 |
| 附件 | `frontend/release/AI-SmartReading-1.0.1.dmg` |

**两个坑**：

- **附件名只能是纯英文。** GitHub 上传时会把中文剥掉 —— `AI智慧阅读-1.0.0.dmg` 会变成 `AI.-1.0.0.dmg`，下载的人会以为文件坏了。`electron-builder.json` 的 `artifactName` 已经配成英文，正常打包不会踩到；手工改过名的话自己留意。
- **别传 `.blockmap` 和 `.yml`。** 那是 electron-builder 的增量更新元数据，没有配套的更新服务就没用，传上去只会让用户困惑。

#### 5. 验证

```bash
curl -sIL "https://github.com/<用户名>/smart_reading/releases/download/v1.0.1/AI-SmartReading-1.0.1.dmg" \
  | grep -iE "^HTTP|content-length|content-disposition"
```

应当返回 `200`，且 `content-disposition` 里的文件名是完整的英文名。

## 📁 项目结构

```
smart_reading/
├── backend/                    # Python 后端（MVC）
│   ├── app.py                 # 入口（Flask 应用工厂）
│   ├── core/                  # 基础设施
│   │   ├── config.py          # 路径 + 服务容器
│   │   ├── database.py        # SQLAlchemy 引擎/会话
│   │   └── translator_config.py # AI 引擎配置
│   ├── models/                # ORM 模型（8 张表）
│   ├── schemas/               # Pydantic 请求/响应校验
│   ├── routes/                # 控制器（9 个模块）
│   ├── services/              # 业务逻辑（解析/翻译/知识抽取）
│   └── pyproject.toml         # 依赖管理（uv）
├── frontend/                   # 前端（React + Vite）
│   ├── main.js                # Electron 主进程
│   ├── preload.js             # 安全桥接
│   ├── index.html             # Vite 入口
│   ├── vite.config.js         # 构建配置
│   ├── assets/                # 应用图标
│   ├── build/                 # electron-builder 配置 + 图标资源
│   ├── src/                   # React 源码
│   │   ├── main.jsx           # React 入口
│   │   ├── App.jsx            # 根组件
│   │   ├── App.css            # 全局样式
│   │   ├── api.js             # API 客户端
│   │   ├── pages/             # 页面组件（Library/Reader/Settings/About）
│   │   └── components/        # 组件（SidePanel）
│   └── dist/                   # 构建产物
├── data/                      # 本地数据
│   ├── db/                    # SQLite 数据库
│   ├── books/                 # 书籍文件
│   ├── cache/                 # 缓存
│   ├── config/                # 应用配置（translator.json）
│   └── exports/               # 导出/备份
├── scripts/
│   └── build-package.mjs      # 安装包构建脚本（macOS / Windows 通用）
├── LICENSE
└── README.md
```

## 🧩 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 28+ | 跨平台桌面应用 |
| 前端框架 | React 18 + Ant Design 5 | 组件化 UI |
| PDF 渲染 | react-pdf | 文字选中、缩放原生支持 |
| 图谱可视化 | ECharts 6 | 力导向/环形/辐射知识图谱 |
| 后端框架 | Flask 3.0 | 轻量 REST API |
| 数据库 | SQLite (WAL 模式) | 本地结构化存储 |
| 包管理 | uv (Python) / npm (Node.js) | 依赖管理 |
| AI 翻译 | OpenAI SDK | 兼容 OpenAI 格式的 LLM API |
| 知识抽取 | 远程 LLM / 正则规则 | 实体/关系提取 |
| 文档解析 | PyMuPDF + python-docx | PDF（内嵌目录优先）/ DOCX 解析 |

> 扫描版 PDF 无文本层时会被标记为 `is_scan_pdf`，当前**不提供 OCR**，这类书籍无法翻译或抽取。

## 📋 开发计划

### Phase 1：MVP 基础版 ✅
- [x] 项目架构搭建
- [x] 文档导入渲染
- [x] 基础阅读功能
- [x] 本地进度保存

### Phase 2：完整功能版 ✅
- [x] 全语种翻译支持（远程 LLM）
- [x] AI 知识抽取
- [x] 力导向知识图谱
- [x] 数据导出备份
- [x] 护眼模式
- [ ] 双向原文联动（双击节点回溯）
- [ ] 扫描版 PDF 的 OCR 支持

### Phase 3：性能优化（进行中）
- [ ] 大文件速度优化
- [ ] UI 美化完善
- [ ] 内存占用优化

## 🔐 安全说明

- 书籍、笔记、翻译记录、生词本全部本地存储，不收集任何用户数据、无使用统计
- **调用翻译或知识抽取时**，相关文本片段会发送到你配置的 LLM 厂商 API（该厂商的数据处理政策适用）
- 将接口地址指向本地 Ollama 等服务，可做到全程不出本机
- API Key 保存在本地 `data/config/translator.json`，请勿将 `data/` 目录分享给他人

## 📄 License

[MIT](LICENSE) © 2026 Shinwell

安装包内含 Electron、Python 3.10 运行时及若干开源依赖，各自的许可证随包分发，详见各组件的 LICENSE 文件。

---
