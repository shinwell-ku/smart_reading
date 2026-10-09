#!/usr/bin/env node
/**
 * 漏翻扫描 —— 找出 src/ 里还没走进 i18n 的用户可见中文。
 *
 *   node scripts/i18n-scan.mjs
 *
 * 为什么不能简单 grep：这个仓库里有几百行中文**注释**，还有几处中文标点
 * 用在正则里（useSpeech 的断句规则），直接 grep 出来全是噪音。所以这里
 * 用一个字符状态机把注释剥掉，只在**字符串字面量、模板串、JSX 文本节点**
 * 里找汉字 —— 那才是用户能看见的东西。
 *
 * 目标输出：空（白名单项除外）。任何一条命中都说明还有文案没收进字典。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

// 只认**汉字**，不认中文标点。这样 useSpeech 里按 。！？；，、 断句的正则
// 不会被误报成文案 —— 那几处是语言规则，不是给人看的字。
const HAN = /[一-鿿㐀-䶿]/

// 调试输出不是用户可见文案。正则和 console 参数里的中文都归这一类。
const DEBUG_LINE = /console\.(log|warn|error|info|debug)/

function stripComments(code) {
  // 返回一份「把注释换成空格、其余原样」的文本（保持行列号不变）
  const out = Array.from(code)
  let i = 0
  let state = 'normal'   // normal | line | block | sq | dq | tpl
  while (i < code.length) {
    const c = code[i], n = code[i + 1]
    if (state === 'normal') {
      if (c === '/' && n === '/') { state = 'line'; out[i] = out[i + 1] = ' '; i += 2; continue }
      if (c === '/' && n === '*') { state = 'block'; out[i] = out[i + 1] = ' '; i += 2; continue }
      if (c === "'") state = 'sq'
      else if (c === '"') state = 'dq'
      else if (c === '`') state = 'tpl'
      i++; continue
    }
    if (state === 'line') {
      if (c === '\n') state = 'normal'
      else out[i] = ' '
      i++; continue
    }
    if (state === 'block') {
      if (c === '*' && n === '/') { out[i] = out[i + 1] = ' '; state = 'normal'; i += 2; continue }
      if (c !== '\n') out[i] = ' '
      i++; continue
    }
    // 字符串内部：跳过转义
    if (c === '\\') { i += 2; continue }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
      state = 'normal'
    }
    i++
  }
  return out.join('')
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'i18n') continue          // 译文本身就长这样
      if (e.name === 'node_modules') continue
      walk(p, acc)
    } else if (/\.(js|jsx)$/.test(e.name)) {
      acc.push(p)
    }
  }
  return acc
}

let hits = 0
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file)
  const orig = fs.readFileSync(file, 'utf8').split('\n')
  const stripped = stripComments(orig.join('\n')).split('\n')
  orig.forEach((rawLine, i) => {
    const line = stripped[i] ?? ''
    if (!HAN.test(line)) return
    if (DEBUG_LINE.test(line)) return
    hits++
    console.log(`  ${rel}:${i + 1}  ${rawLine.trim().slice(0, 110)}`)
  })
}

console.log('')
if (hits === 0) {
  console.log('  ✅ 没有漏翻的文案')
} else {
  console.log(`  共 ${hits} 处待处理（注释和 console 已被过滤，剩下的都是字符串或 JSX 文本）`)
}
process.exit(hits === 0 ? 0 : 1)
