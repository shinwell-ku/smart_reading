/**
 * AI智慧阅读 - Electron 主进程
 * 负责窗口管理、本地文件访问、Python后端生命周期管理
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

app.setName('AI智慧阅读');

// ============================================================
// 全局状态
// ============================================================
let mainWindow = null;
let pythonProcess = null;
const isDev = process.argv.includes('--dev');
const isPackaged = app.isPackaged;

// 路径配置：开发模式用项目目录，生产模式用打包后的资源目录
const RESOURCES_PATH = process.resourcesPath;
const ROOT_DIR = isPackaged ? RESOURCES_PATH : path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BOOKS_DIR = path.join(DATA_DIR, 'books');

console.log(`[主进程] 模式: ${isDev ? '开发' : '生产'}`);
console.log(`[主进程] 后端目录: ${BACKEND_DIR}`);
console.log(`[主进程] 数据目录: ${DATA_DIR}`);

// 确保数据目录存在
[DATA_DIR, BOOKS_DIR, path.join(DATA_DIR, 'db'), path.join(DATA_DIR, 'cache'), path.join(DATA_DIR, 'exports')].forEach(d => {
  if (!fs.existsSync(d)) {
    fs.mkdirSync(d, { recursive: true });
  }
});

// ============================================================
// Python 后端管理
// ============================================================

// venv 里可执行文件所在目录：Windows 是 Scripts，POSIX 是 bin
function venvBinDir() {
  return path.join(BACKEND_DIR, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
}

function venvPythonPath() {
  return path.join(venvBinDir(), process.platform === 'win32' ? 'python.exe' : 'python3');
}

function fixPyvenvConfig() {
  // 修正 pyvenv.cfg 中的 home 路径，使其指向打包后的 venv 实际位置
  const pyvenvPath = path.join(BACKEND_DIR, '.venv', 'pyvenv.cfg');
  if (!fs.existsSync(pyvenvPath)) return;
  try {
    const binDir = venvBinDir();
    let content = fs.readFileSync(pyvenvPath, 'utf-8');
    content = content.replace(/^home = .*/m, `home = ${binDir}`);
    fs.writeFileSync(pyvenvPath, content, 'utf-8');
    console.log(`[主进程] pyvenv.cfg home 已修正: ${binDir}`);
  } catch (e) {
    console.error('[主进程] pyvenv.cfg 修正失败:', e);
  }
}

function getPythonCommand() {
  // 生产模式（已打包）：修正 pyvenv.cfg + 使用打包的 venv
  if (isPackaged) {
    fixPyvenvConfig();
    const bundledPython = venvPythonPath();
    if (fs.existsSync(bundledPython)) {
      return bundledPython;
    }
  }
  // 开发模式：尝试多个系统 Python 命令
  const candidates = ['python3', 'python', 'python3.11', 'python3.10'];
  for (const cmd of candidates) {
    try {
      // 加超时：Windows 上 python3 可能是应用商店的占位程序，会挂住不返回
      const result = require('child_process').execSync(`${cmd} --version`, { encoding: 'utf8', timeout: 5000 });
      if (result.toLowerCase().includes('python')) {
        return cmd;
      }
    } catch (e) {
      continue;
    }
  }
  return 'python3'; // 默认
}

// 清理上次残留的后端进程，避免它占着 5001 端口让新进程绑不上。
// POSIX 用 lsof，Windows 没有 lsof，改走 netstat 找 PID + taskkill。
function killStaleBackend() {
  const cp = require('child_process');
  if (process.platform === 'win32') {
    try {
      const out = cp.execSync('netstat -ano -p TCP', { encoding: 'utf8', timeout: 5000 });
      const pids = new Set();
      for (const line of out.split('\n')) {
        const cols = line.trim().split(/\s+/);
        // 形如: TCP  127.0.0.1:5001  0.0.0.0:0  LISTENING  12345
        if (cols.length >= 5 && cols[1] && cols[1].endsWith(':5001') && /LISTENING/i.test(line)) {
          const pid = cols[cols.length - 1];
          if (/^\d+$/.test(pid) && pid !== '0') pids.add(pid);
        }
      }
      for (const pid of pids) {
        try { cp.execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, stdio: 'ignore' }); } catch (e) { /* 已退出 */ }
      }
      if (pids.size) console.log(`[主进程] 已清理占用 5001 的残留进程: ${[...pids].join(', ')}`);
    } catch (e) { /* 没有残留进程是正常情况 */ }
  } else {
    try {
      cp.execSync('lsof -ti:5001 | xargs kill -9 2>/dev/null; sleep 1', { timeout: 3000 });
    } catch (e) { /* 同上 */ }
  }
}

function startPythonBackend() {
  return new Promise((resolve, reject) => {
    killStaleBackend();

    const pythonCmd = getPythonCommand();
    const appPy = path.join(BACKEND_DIR, 'app.py');

    console.log(`[主进程] 启动 Python 后端: ${pythonCmd} ${appPy}`);

    pythonProcess = spawn(pythonCmd, [appPy], {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        SMART_READING_HOME: ROOT_DIR
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let started = false;

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Python] ${output}`);
      // 检测服务启动完成
      if (!started && output.includes('启动')) {
        started = true;
        // 给服务一点时间完成初始化
        setTimeout(() => resolve(), 500);
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('Traceback') || msg.includes('ERROR')) {
        console.error(`[Python ERR] ${msg}`);
      } else {
        console.log(`[Python LOG] ${msg}`);
      }
    });

    pythonProcess.on('error', (err) => {
      console.error(`[主进程] Python 启动失败:`, err);
      // 不阻止 Electron 启动，只是没有后端功能
      if (!started) {
        started = true;
        resolve();
      }
    });

    pythonProcess.on('exit', (code) => {
      console.log(`[Python] 进程退出, code=${code}`);
      pythonProcess = null;
      if (!started) {
        started = true;
        resolve();
      } else {
        // 意外退出，3 秒后自动重启
        console.log('[主进程] Python 后端意外退出，3 秒后自动重启...');
        setTimeout(() => {
          startPythonBackend().catch(e => console.error('[主进程] 重启失败:', e));
        }, 3000);
      }
    });

    // 超时处理
    setTimeout(() => {
      if (!started) {
        started = true;
        resolve();
      }
    }, 8000);
  });
}

function stopPythonBackend() {
  if (pythonProcess) {
    console.log('[主进程] 停止 Python 后端');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t']);
    } else {
      pythonProcess.kill('SIGTERM');
      setTimeout(() => {
        if (pythonProcess) {
          pythonProcess.kill('SIGKILL');
        }
      }, 3000);
    }
    pythonProcess = null;
  }
}

// ============================================================
// 窗口创建
// ============================================================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'AI智慧阅读',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // 允许访问本地文件
    },
    show: true,
    backgroundColor: '#f0f2f5'
  });

  // 加载页面
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  mainWindow.loadFile(indexPath);

  // 开发模式打开开发者工具
  mainWindow.once('ready-to-show', () => {
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================
// IPC 处理器
// ============================================================

// 文件对话框 - 选择导入书籍
ipcMain.handle('dialog:openFile', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入文档',
    filters: [
      { name: '支持的文档', extensions: ['pdf', 'docx', 'txt', 'md', 'markdown', 'html', 'htm'] },
      { name: 'PDF 文件', extensions: ['pdf'] },
      { name: 'Word 文件', extensions: ['docx'] },
      { name: '文本 / Markdown', extensions: ['txt', 'md', 'markdown'] },
      { name: '网页文件', extensions: ['html', 'htm'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections'],
    ...options
  });
  return result;
});

// 保存文件对话框
ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// 读取本地文件
ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath);
    return { success: true, data: content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 写入本地文件
ipcMain.handle('file:write', async (event, filePath, data) => {
  try {
    const buf = Array.isArray(data) ? Buffer.from(data) : data;
    fs.writeFileSync(filePath, buf);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 获取文件信息
ipcMain.handle('file:stat', async (event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      success: true,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 获取数据目录
ipcMain.handle('app:getDataDir', () => {
  return DATA_DIR;
});

// 获取书籍目录
ipcMain.handle('app:getBooksDir', () => {
  return BOOKS_DIR;
});

// 在文件管理器里定位文件（导出备份后告诉用户文件在哪）
ipcMain.handle('app:showInFolder', (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 复制文件到书籍目录
ipcMain.handle('file:copyToBooks', async (event, sourcePath) => {
  try {
    const filename = path.basename(sourcePath);
    const destPath = path.join(BOOKS_DIR, filename);

    // 避免覆盖
    let finalPath = destPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      finalPath = path.join(BOOKS_DIR, `${base}_${counter}${ext}`);
      counter++;
    }

    fs.copyFileSync(sourcePath, finalPath);
    return { success: true, path: finalPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================
// 应用生命周期
// ============================================================

app.whenReady().then(async () => {
  // 移除默认菜单栏
  Menu.setApplicationMenu(null);

  // 先启动 Python 后端
  try {
    await startPythonBackend();
  } catch (e) {
    console.error('[主进程] 后端启动失败:', e);
  }

  // 后端就绪后创建窗口
  createMainWindow();
  // 通知渲染进程后端已就绪
  if (mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('backend-ready');
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopPythonBackend();
});
