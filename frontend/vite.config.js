import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 用 readFileSync 而不是 import ... with { type: 'json' }：
// vite.config.js 是先被 esbuild 打包再执行的，JSON 导入断言在
// 不同 Node / esbuild 组合下行为不一致，这样读最省事。
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  // 版本号只有 package.json 一个来源：安装包文件名（electron-builder 的
  // ${version}）和「关于」页都从它取。以前 About.jsx 里写死了一份，
  // 发版时忘了改就会对不上。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
