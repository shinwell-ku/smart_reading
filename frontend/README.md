# AI智慧阅读 - 前端

基于 **React 18 + Ant Design 5 + react-pdf + Vite** 的跨平台桌面客户端。

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron 28 | 桌面框架（主进程 + 渲染进程隔离） |
| React 18 | UI 组件框架 |
| Ant Design 5 | UI 组件库（按钮/输入框/滑块/对话框等） |
| react-pdf | PDF 渲染，内置文字层，支持文字选中 |
| ECharts 5 | 知识图谱力导向图 |
| Vite 5 | 构建工具 |

## 快速启动

```bash
cd frontend
npm install                    # 安装依赖
npm start                      # 编译 + 启动 Electron
npm run build:vue              # 仅编译前端（输出到 dist_vue/）
npm run build:win              # 打包 Windows 安装包
npm run build:mac              # 打包 macOS DMG
```

## 项目结构

```
frontend/
├── main.js                  # Electron 主进程
├── preload.js               # 安全桥接（contextBridge）
├── index.html               # Vite 入口
├── vite.config.js           # 构建配置
├── src/
│   ├── main.jsx             # React 入口
│   ├── App.jsx              # 根组件（导航 + 布局）
│   ├── App.css              # 全局样式
│   ├── api.js               # HTTP API 客户端
│   ├── pages/
│   │   ├── Library.jsx      # 书库（导入/列表/搜索/删除）
│   │   ├── Reader.jsx       # PDF 阅读器（react-pdf）
│   │   ├── Settings.jsx     # 设置（字体/护眼/备份/重置）
│   │   └── About.jsx        # 关于
│   └── components/
│       └── SidePanel.jsx    # 侧面板（翻译/笔记/书签/图谱）
├── dist_vue/                # Vite 构建产物
└── build/                   # electron-builder 配置
```

## 功能

| 功能 | 说明 |
|------|------|
| 书库 | 导入 PDF/DOCX，封面缩略图，搜索，删除 |
| 阅读 | react-pdf 渲染，滚轮/键盘翻页，自适应缩放，文字选中 |
| 翻译 | 选中文本自动填充，8 种语言，当前页/全文翻译 |
| 笔记 | 颜色选择，添加/删除 |
| 书签 | 工具栏一键添加，侧面板管理 |
| 图谱 | ECharts 力导向图，点击节点查看详情 |
| 面板 | 右侧竖排 tab，可拖拽缩放宽度，可折叠 |
| 设置 | 字体/行距/护眼，备份/重置数据 |

## 通信架构

```
React 渲染进程
    ↕ contextBridge (preload.js)
Electron 主进程 (main.js)
    ↕ 子进程管理 + HTTP
Python Flask 后端 (127.0.0.1:5001)
    ↕ SQLAlchemy + SQLite
本地数据存储
```

## 主进程功能

- **Python 后端管理** — 自动启动/停止/健康检查，崩溃后 3 秒自动重启
- **IPC 桥接** — `dialog:openFile`、`file:read`、`file:copyToBooks`
- **安全策略** — `contextIsolation: true`、`nodeIntegration: false`、`webSecurity: false`
