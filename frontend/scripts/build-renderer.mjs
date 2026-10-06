#!/usr/bin/env node
/**
 * 编译渲染进程（React -> dist/）。
 *
 * 除了跑 vite，还要把 dist/index.html 里的 crossorigin 属性去掉 ——
 * 打包后页面是 file:// 协议加载的，带 crossorigin 的 <script>/<link>
 * 会被 Chromium 按 CORS 规则拒绝。
 *
 * 单独抽成脚本是因为这一段以前写在 package.json 里用 sed（BSD 语法），
 * Windows 上跑不了。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

execFileSync(npx, ['vite', 'build'], { cwd: FRONTEND_DIR, stdio: 'inherit' });

const indexPath = path.join(FRONTEND_DIR, 'dist', 'index.html');
if (fs.existsSync(indexPath)) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const stripped = html.replace(/ crossorigin/g, '');
  if (stripped !== html) fs.writeFileSync(indexPath, stripped, 'utf8');
  console.log(`[renderer] 已移除 crossorigin 属性: ${path.relative(FRONTEND_DIR, indexPath)}`);
}
