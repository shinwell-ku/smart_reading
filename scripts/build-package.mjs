#!/usr/bin/env node
/**
 * AI智慧阅读 — 生产包构建脚本（macOS / Windows 通用）
 *
 *   node scripts/build-package.mjs [mac|win|all] [--no-builder]
 *
 * 流程：
 *   1. backend 源码 + 可脱离本机运行的 Python 环境 → frontend/build-resources/
 *   2. 建空的 data/{db,books,cache,exports}
 *   3. 编译前端（vite）
 *   4. electron-builder 出安装包
 *
 * 用 Node 而不是 bash：Windows 上不必装 Git Bash / WSL，
 * 也不用为 BSD sed 和 GNU sed 的方言差异打补丁。
 *
 * ── 两个平台把 Python 运行环境塞进包里的方式不同 ──
 *
 * macOS：把标准库和 libpython3.10.dylib 复制进 .venv 自身，
 *        pyvenv.cfg 的 home 指向 .venv/bin。
 *        POSIX 版 CPython 发现可执行文件在 bin/ 里时会自动往上一层找 prefix，
 *        所以 .venv 自己就能当 prefix 用。
 *
 * Windows：Windows 版 CPython 没有那条「bin 就上翻一层」的规则，
 *        光把标准库塞进 .venv 是找不到的。因此改为把构建机上那份
 *        基础 Python 安装整体复制成 backend/python-runtime/，
 *        pyvenv.cfg 的 home 指向它 —— 那本来就是一个合法的 Python 安装布局
 *        （python.exe 与 Lib/、DLLs/ 同级），CPython 一定能认。
 *
 * 两边的 home 值 main.js 每次启动时还会再改写一次（fixPyvenvConfig），
 * 这里是保证包本身就自洽。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const IS_WIN = process.platform === 'win32';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_DIR = path.join(DIR, 'frontend');
const RES_DIR = path.join(FRONTEND_DIR, 'build-resources');
const BACKEND_SRC = path.join(DIR, 'backend');
const VENV_SRC = path.join(BACKEND_SRC, '.venv');
const VENV_DST = path.join(RES_DIR, 'backend', '.venv');

// ── 参数 ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const noBuilder = argv.includes('--no-builder');
const target = argv.find((a) => ['mac', 'win', 'all'].includes(a)) || 'all';
if (argv.length && !argv.some((a) => ['mac', 'win', 'all', '--no-builder'].includes(a))) {
  console.error('用法: node scripts/build-package.mjs [mac|win|all] [--no-builder]');
  process.exit(1);
}

// ── 小工具 ───────────────────────────────────────────────────
const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const mkdir = (p) => fs.mkdirSync(p, { recursive: true });
const exists = (p) => fs.existsSync(p);

/** 目录体积（MB，保留一位小数） */
function duMB(dir) {
  if (!exists(dir)) return 0;
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total / 1024 / 1024;
}

/**
 * 复制目录树，解引用符号链接（venv 里大量用软链省空间，
 * 但软链指向的是构建机的绝对路径，装到用户机器上就断了）。
 */
function copyTree(src, dst, skip = () => false) {
  if (!exists(src)) return false;
  const root = path.resolve(src);
  fs.cpSync(root, dst, {
    recursive: true,
    dereference: true,
    force: true,
    filter: (s) => {
      const rel = path.relative(root, s);
      if (!rel) return true;
      return !skip(rel.split(path.sep).join('/'));
    },
  });
  return true;
}

const SKIP_JUNK = (rel) =>
  rel.split('/').includes('__pycache__') ||
  rel.endsWith('.pyc') ||
  rel.split('/').includes('.DS_Store');

// ── pyvenv.cfg ───────────────────────────────────────────────
function readPyvenv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][\w.-]*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function setPyvenvHome(file, dir) {
  let txt = fs.readFileSync(file, 'utf8');
  const line = `home = ${dir}`;
  txt = /^[ \t]*home[ \t]*=.*$/m.test(txt)
    ? txt.replace(/^[ \t]*home[ \t]*=.*$/m, line)
    : `${line}\n${txt}`;
  fs.writeFileSync(file, txt, 'utf8');
  console.log(`  pyvenv.cfg home → ${dir}`);
}

/**
 * 版本号体检。
 *
 * 版本号只在**发版**时改（`npm version minor --no-git-tag-version`），本地
 * 试打包不用动 —— 所以这里只提醒、不拦截。
 *
 * 要防的是这么一种不报错的事故：版本号没改就重打了一次包，release/ 下
 * 那份**已经传上 GitHub Release 的**安装包被静默覆盖，本地从此和线上
 * 对不上，之后想复现或重传也没了基准。把当前处境直接摆出来，就不用记。
 */
function reportVersion() {
  const version = JSON.parse(
    fs.readFileSync(path.join(FRONTEND_DIR, 'package.json'), 'utf8')
  ).version;

  let released = false;
  try {
    const tags = execFileSync('git', ['tag', '-l', `v${version}`], {
      cwd: DIR, encoding: 'utf8',
    }).trim();
    released = tags.length > 0;
  } catch {
    return; // 没有 git / 不是仓库，静默跳过
  }

  if (!released) {
    console.log(`  版本 ${version}（还没打过 tag，看情况是首次发或本地试打）`);
    return;
  }

  // 产物名从 electron-builder 的 artifactName 还原，别自己另写一套规则
  const cfgPath = path.join(FRONTEND_DIR, 'build', 'electron-builder.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const expand = (tpl, ext) =>
    tpl && tpl.replace(/\$\{version\}/g, version).replace(/\$\{ext\}/g, ext);
  const files = [expand(cfg.mac?.artifactName, 'dmg'), expand(cfg.win?.artifactName, 'exe')]
    .filter(Boolean);

  console.log('');
  console.log(`  ⚠️  版本 ${version} 已经发过（tag v${version} 在）`);
  console.log(`      再打一次会覆盖 release/ 下的 ${files.join(' 和 ')}`);
  console.log('      · 只是本地试打包 → 忽略这条，继续');
  console.log('      · 要发新版 → 先跑 npm version minor --no-git-tag-version');
  console.log('');
}

// ── 前置检查 ─────────────────────────────────────────────────
function preflight() {
  if (!exists(path.join(BACKEND_SRC, 'app.py'))) {
    throw new Error(`找不到后端入口: ${path.join(BACKEND_SRC, 'app.py')}`);
  }
  if (!exists(VENV_SRC)) {
    throw new Error('缺少 backend/.venv —— 先在 backend/ 下执行: uv sync');
  }

  // venv 的平台必须和要打的包一致。这一条是整个脚本存在的理由：
  // 拿 macOS 的 venv 去出 Windows 安装包，exe 里装的是 Mach-O，
  // 装到 Windows 上后端起不来，而且要到运行时才发现。
  const isWinVenv = exists(path.join(VENV_SRC, 'Scripts', 'python.exe'));
  const isPosixVenv = exists(path.join(VENV_SRC, 'bin', 'python3')) || exists(path.join(VENV_SRC, 'bin', 'python'));
  if (!isWinVenv && !isPosixVenv) {
    throw new Error(`backend/.venv 里既没有 Scripts/python.exe 也没有 bin/python —— venv 不完整，重新 uv sync`);
  }
  const venvPlatform = isWinVenv ? 'win' : 'unix';
  const hostPlatform = IS_WIN ? 'win' : 'unix';
  if (venvPlatform !== hostPlatform) {
    throw new Error(
      `backend/.venv 是 ${venvPlatform === 'win' ? 'Windows' : 'POSIX'} 布局，` +
        `但当前是 ${hostPlatform === 'win' ? 'Windows' : 'POSIX'} 环境。\n` +
        `  venv 不能跨平台复用，必须在本机重新 uv sync。`
    );
  }

  if (target !== 'all') {
    const wantWin = target === 'win';
    if (wantWin !== IS_WIN) {
      throw new Error(
        `不能交叉打包：要出 ${target === 'win' ? 'Windows' : 'macOS'} 包，` +
          `但当前在 ${IS_WIN ? 'Windows' : 'macOS'} 上。\n` +
          `  Python 运行环境是平台绑定的，请在目标平台上重新 uv sync 后再打包。`
      );
    }
  }
}

// ── [1/5] 后端源码 ───────────────────────────────────────────
function copyBackendSource() {
  const dst = path.join(RES_DIR, 'backend');
  const skip = (rel) => {
    if (SKIP_JUNK(rel)) return true;
    const top = rel.split('/')[0];
    if (top === '.venv' || top === 'venv') return true;
    if (top === '.python-version') return true;
    if (/\.db(-wal|-shm)?$/.test(rel)) return true;
    return false;
  };
  copyTree(BACKEND_SRC, dst, skip);
  console.log(`  后端源码 ${duMB(dst).toFixed(1)} MB`);
}

// ── [2/5] Python 运行环境 ────────────────────────────────────
function copyVenv() {
  const skip = (rel) => {
    if (SKIP_JUNK(rel)) return true;
    if (rel === 'share' || rel.startsWith('share/')) return true;
    return false;
  };
  copyTree(VENV_SRC, VENV_DST, skip);
  console.log(`  .venv ${duMB(VENV_DST).toFixed(1)} MB`);
}

/** 基础 Python 安装的根目录（构建机上的那份） */
function basePythonHome() {
  if (IS_WIN) {
    const cfg = readPyvenv(path.join(VENV_SRC, 'pyvenv.cfg'));
    const home = cfg.home;
    if (!home || !exists(home)) {
      throw new Error(
        `pyvenv.cfg 里的 home 无效: ${home || '(空)'}\n` +
          `  这是构建机上基础 Python 3.10 的安装目录，打包时需要整体复制进安装包。\n` +
          `  若 .venv 是手工建的，重新 uv sync 一般就能写上正确的 home。`
      );
    }
    return home;
  }
  // POSIX：从 venv 里的 python 软链一路 realpath 到真身，再上溯两层
  const bin = path.join(VENV_SRC, 'bin');
  const exe = ['python3', 'python'].map((n) => path.join(bin, n)).find(exists);
  if (!exe) throw new Error('backend/.venv/bin 下找不到 python3');
  return path.dirname(path.dirname(fs.realpathSync(exe)));
}

const PY_HOME = { value: null };
const pyHome = () => (PY_HOME.value ??= basePythonHome());

/** macOS：标准库 + libpython 塞进 .venv 自己，home 指向 .venv/bin */
function provisionPosixRuntime() {
  const home = pyHome();
  const libRoot = path.join(home, 'lib');
  const stdlibName = exists(libRoot)
    ? fs.readdirSync(libRoot).find((n) => /^python3\.\d+$/.test(n))
    : null;
  if (!stdlibName) {
    throw new Error(`找不到 Python 标准库: ${libRoot}/python3.x\n  （基础 Python 在 ${home}）`);
  }

  const skip = (rel) => {
    if (SKIP_JUNK(rel)) return true;
    const top = rel.split('/')[0];
    return top === 'site-packages' || top === 'test' || top === 'tests';
  };
  copyTree(path.join(libRoot, stdlibName), path.join(VENV_DST, 'lib', stdlibName), skip);
  console.log(`  标准库 (${stdlibName}) → .venv/lib/`);

  // Python 运行时链接库，venv 里的 python 起不来就靠它
  const dylib = fs.readdirSync(libRoot).find((n) => /^libpython3\.\d+\.(dylib|so)/.test(n));
  if (dylib) {
    fs.copyFileSync(path.join(libRoot, dylib), path.join(VENV_DST, 'lib', dylib));
    console.log(`  ${dylib} → .venv/lib/`);
  } else {
    console.log('  ⚠ 没找到 libpython3.x.dylib，若打包后后端起不来先查这里');
  }

  setPyvenvHome(path.join(VENV_DST, 'pyvenv.cfg'), path.join(VENV_DST, 'bin'));
}

/** Windows：基础 Python 安装整体复制成 backend/python-runtime，home 指向它 */
function provisionWindowsRuntime() {
  const home = pyHome();
  const runtime = path.join(RES_DIR, 'backend', 'python-runtime');

  const skip = (rel) => {
    if (SKIP_JUNK(rel)) return true;
    const top = rel.split('/')[0];
    // 运行时不需要的：自带 site-packages 由 .venv 提供，
    // 其余是开发/文档/构建产物
    if (top === 'Scripts' || top === 'include' || top === 'libs' || top === 'Doc' || top === 'Tools') return true;
    if (rel === 'Lib/site-packages' || rel.startsWith('Lib/site-packages/')) return true;
    // 标准库里的大块头，这个应用一个都用不到（合计约 40MB）
    for (const d of ['test', 'idlelib', 'lib2to3', 'turtledemo', 'ensurepip', 'distutils']) {
      if (rel === `Lib/${d}` || rel.startsWith(`Lib/${d}/`)) return true;
    }
    return false;
  };
  copyTree(home, runtime, skip);
  console.log(`  基础 Python 运行时 → backend/python-runtime/ (${duMB(runtime).toFixed(1)} MB)`);

  // python.exe 加载 python3XX.dll 时先看自己所在目录，
  // 而它在 .venv/Scripts/ 里，所以这些 DLL 得在这儿也放一份
  const prefix = readPyvenv(path.join(VENV_SRC, 'pyvenv.cfg')).version_info || '3.10';
  const major = prefix.split('.')[0];
  const wanted = [
    `python${prefix.split('.').slice(0, 2).join('')}.dll`,
    `python${major}.dll`,
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'ucrtbase.dll',
  ];
  const scripts = path.join(VENV_DST, 'Scripts');
  let copied = 0;
  for (const dll of wanted) {
    const src = path.join(runtime, dll);
    if (exists(src)) {
      fs.copyFileSync(src, path.join(scripts, dll));
      copied++;
    }
  }
  console.log(`  运行时 DLL → .venv/Scripts/ (${copied} 个)`);

  setPyvenvHome(path.join(VENV_DST, 'pyvenv.cfg'), runtime);
}

// ── [3/5] 数据目录 ───────────────────────────────────────────
function createDataDirs() {
  for (const d of ['db', 'books', 'cache', 'exports']) {
    mkdir(path.join(RES_DIR, 'data', d));
  }
  console.log('  data/{db,books,cache,exports} 已创建（不打包任何模型权重）');
}

// ── [4/5] 前端 ───────────────────────────────────────────────
function buildRenderer() {
  execFileSync(process.execPath, [path.join(FRONTEND_DIR, 'scripts', 'build-renderer.mjs')], {
    cwd: FRONTEND_DIR,
    stdio: 'inherit',
  });
}

// ── [5/5] electron-builder ───────────────────────────────────
function runElectronBuilder() {
  const npx = IS_WIN ? 'npx.cmd' : 'npx';
  const args = ['electron-builder', '--config', 'build/electron-builder.json'];
  if (target === 'win' || target === 'all') args.push('--win');
  if (target === 'mac' || target === 'all') args.push('--mac');
  execFileSync(npx, args, { cwd: FRONTEND_DIR, stdio: 'inherit' });
}

// ── 主流程 ───────────────────────────────────────────────────
function main() {
  console.log('==============================');
  console.log('  构建 AI智慧阅读 安装包');
  console.log(`  平台: ${target}   宿主机: ${process.platform}`);
  console.log('==============================');

  preflight();
  reportVersion();

  console.log('\n[1/5] 复制后端代码...');
  rm(RES_DIR);
  mkdir(path.join(RES_DIR, 'backend'));
  copyBackendSource();

  console.log('\n[2/5] 复制 Python 虚拟环境...');
  copyVenv();
  if (IS_WIN) provisionWindowsRuntime();
  else provisionPosixRuntime();
  console.log(`  合计 ${duMB(path.join(RES_DIR, 'backend')).toFixed(1)} MB`);

  console.log('\n[3/5] 创建数据目录...');
  createDataDirs();

  console.log('\n[4/5] 编译前端...');
  buildRenderer();

  if (noBuilder) {
    console.log('\n--no-builder：停在 electron-builder 之前。');
    console.log(`产物目录: ${path.relative(DIR, RES_DIR)}`);
    return;
  }

  console.log('\n[5/5] 构建 Electron 安装包...');
  runElectronBuilder();

  rm(RES_DIR);
  rm(path.join(FRONTEND_DIR, 'release', 'mac'));
  rm(path.join(FRONTEND_DIR, 'release', 'win-unpacked'));

  console.log('\n✅ 构建完成！安装包位于: frontend/release/');
  console.log('==============================');
}

try {
  main();
} catch (err) {
  // 预期内的失败（venv 平台不符、不能交叉打包、缺文件）都是可读的中文说明，
  // 直接打印，不要甩一坨堆栈
  console.error(`\n❌ ${err.message}\n`);
  process.exit(1);
}
