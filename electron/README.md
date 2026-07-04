# AI智慧阅读 - Electron 前端

基于 Electron 28+ 的跨平台桌面客户端，提供电子书阅读、知识图谱可视化等交互界面。

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron 28 | 桌面框架（主进程 + 渲染进程隔离） |
| PDF.js | PDF 文档渲染 |
| ECharts 5 | 力导向知识图谱可视化 |
| 原生 ES Modules | 前端逻辑模块化（无框架依赖） |

## 快速启动

```bash
cd electron
npm install                  # 安装依赖
npm start                    # 开发模式启动
npm run build:win            # 打包 Windows 安装包
npm run build:mac            # 打包 macOS DMG
```

## 项目结构

```
electron/
├── main.js                  # 主进程（窗口管理、Python 进程生命周期、IPC）
├── preload.js               # 安全桥接（contextBridge 暴露 API）
├── package.json             # 依赖 & 构建配置
└── src/
    ├── index.html           # 单页应用（6 个视图）
    ├── css/
    │   ├── main.css         # 全局样式、布局、组件
    │   ├── reader.css       # 阅读器样式
    │   ├── library.css      # 书库样式
    │   ├── translation.css  # 翻译视图样式
    │   └── knowledge.css    # 知识图谱样式
    ├── js/
    │   ├── app.js           # 主控制器（导航、后端状态、设置）
    │   ├── api.js           # HTTP API 客户端
    │   ├── utils.js         # 工具函数
    │   ├── library.js       # 书库管理
    │   ├── reader.js        # 阅读器（翻页、笔记、书签、搜索）
    │   ├── translation.js   # 翻译界面
    │   └── knowledge.js     # 知识图谱（ECharts 渲染）
    └── lib/
        └── README.md        # 离线前端库说明
```

## 视图

| 视图 | 文件 | 说明 |
|------|------|------|
| 书库 | library.js | 书籍导入、列表、搜索、删除 |
| 阅读 | reader.js | PDF 分页渲染、翻页、笔记、书签 |
| 翻译 | translation.js | 划词 / 全文翻译、历史记录、生词 |
| 知识图谱 | knowledge.js | 力导向图、节点详情、大纲、导出 |
| 设置 | app.js | 字体、护眼、备份、重置 |

## 主进程功能

- **Python 生命周期管理** — 自动启动 / 停止 Flask 后端
- **IPC 桥接** — `dialog:openFile`、`file:read`、`file:copyToBooks` 等
- **安全策略** — `contextIsolation: true`、`nodeIntegration: false`
- **窗口管理** — 窗口状态、全屏、DevTools 开关

## 通信架构

```
Electron 渲染进程
    ↕ contextBridge (preload.js)
Electron 主进程 (main.js)
    ↕ 子进程管理
Python Flask 后端 (127.0.0.1:5001)
    ↕ SQLite + 文件系统
本地数据存储
```

## 离线依赖

前端离线库（`src/lib/`）需手动放置：

- **echarts.min.js** — ECharts 5 离线版本

安装方式：
```bash
cd electron
npm install echarts --save-dev
cp node_modules/echarts/dist/echarts.min.js src/lib/
```
