#!/usr/bin/env node
/**
 * i18n 自检，两个部分：
 *
 *   node scripts/i18n-scan.mjs
 *
 * ① 漏翻扫描 —— 找出 src/ 里还没走进 i18n 的用户可见中文。
 *    为什么不能简单 grep：这个仓库里有几百行中文**注释**，还有几处中文标点
 *    用在正则里（useSpeech 的断句规则），直接 grep 出来全是噪音。所以这里
 *    用一个字符状态机把注释剥掉，只在**字符串字面量、模板串、JSX 文本节点**
 *    里找汉字 —— 那才是用户能看见的东西。
 *
 * ② 字典自检 —— 两份字典的 key 对齐、英文表里别混进汉字、后端每个错误码
 *    两边都有对应文案、占位符集合一致。
 *
 * 目标输出：空（白名单项除外）。任何一条命中都说明 i18n 有缺口。
 * 退出码非 0 表示有问题，可以直接挂到 CI 上。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..', 'src')
const BACKEND = path.resolve(HERE, '..', '..', 'backend')

// 只认**汉字**，不认中文标点。这样 useSpeech 里按 。！？；，、 断句的正则
// 不会被误报成文案 —— 那几处是语言规则，不是给人看的字。
const HAN = /[一-鿿㐀-䶿]/

// 调试输出不是用户可见文案。正则和 console 参数里的中文都归这一类。
const DEBUG_LINE = /console\.(log|warn|error|info|debug)/

// 有意不翻译的中文。加条目必须写清理由 —— 白名单是这个脚本唯一的
// 失效方式，随手往里塞就等于把「漏翻检查」关掉了。
const ALLOW = [
  {
    re: /万字/,
    why: 'fmtLength 的中文单位：中文按万进位、英文按 k，是各语言自己的数字格式，不该进字典',
  },
  {
    re: /native:\s*'[^']*'/,
    why: '语言下拉里的母语名（中文 / 日本語）：任何界面语言下都显示母语原文',
  },
]

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
const allowed = []
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file)
  const orig = fs.readFileSync(file, 'utf8').split('\n')
  const stripped = stripComments(orig.join('\n')).split('\n')
  orig.forEach((rawLine, i) => {
    const line = stripped[i] ?? ''
    if (!HAN.test(line)) return
    if (DEBUG_LINE.test(line)) return
    const ok = ALLOW.find(a => a.re.test(rawLine))
    if (ok) { allowed.push(`${rel}:${i + 1}  ${ok.why}`); return }
    hits++
    console.log(`  ${rel}:${i + 1}  ${rawLine.trim().slice(0, 110)}`)
  })
}

console.log('')
if (allowed.length) {
  console.log(`  白名单 ${allowed.length} 处（有意保留，未计入待处理）：`)
  allowed.forEach(a => console.log(`    ${a}`))
  console.log('')
}
if (hits === 0) {
  console.log('  ✅ 没有漏翻的文案')
} else {
  console.log(`  共 ${hits} 处待处理（注释和 console 已被过滤，剩下的都是字符串或 JSX 文本）`)
}

// ─────────────────────────── ② 字典自检 ───────────────────────────

// 加载字典。不用 import()：frontend/package.json 没有 "type": "module"
// （Electron 主进程是 CJS），import 一个带 ESM 语法的 .js 会让 Node 猜模块
// 类型并甩一条警告。字典就是纯对象字面量，把 `export default` 换成 `return`
// 直接求值最省事，也不引入任何依赖。
const loadDict = file => {
  const src = fs.readFileSync(file, 'utf8').replace(/^\s*export\s+default\s*/m, 'return ')
  return new Function(src)()
}
const zh = loadDict(path.join(SRC, 'i18n', 'zh.js'))
const en = loadDict(path.join(SRC, 'i18n', 'en.js'))

let bad = 0
const fail = msg => { bad++; console.log(`  ❌ ${msg}`) }
// 复数条目是 { one, other } 对象，占位符要取两档的并集（各档必须一样才合理）
const HOLES = v => {
  const strs = typeof v === 'string' ? [v] : [v?.one, v?.other].filter(x => typeof x === 'string')
  const names = new Set()
  strs.forEach(s => [...s.matchAll(/\{(\w+)\}/g)].forEach(m => names.add(m[1])))
  return [...names].sort().join(',')
}

console.log('')
console.log('  字典自检：')

// 1. key 对齐。英文表缺条目时 t() 会退回中文，界面上看是「漏了一句」而不是
//    报错，所以必须在这里硬性拦住。
const kz = Object.keys(zh), ke = Object.keys(en)
const onlyZh = kz.filter(k => !(k in en))
const onlyEn = ke.filter(k => !(k in zh))
if (onlyZh.length) fail(`en.js 缺 ${onlyZh.length} 条：${onlyZh.slice(0, 8).join(', ')}${onlyZh.length > 8 ? ' …' : ''}`)
if (onlyEn.length) fail(`zh.js 缺 ${onlyEn.length} 条：${onlyEn.slice(0, 8).join(', ')}${onlyEn.length > 8 ? ' …' : ''}`)

// 2. 英文表里不该有汉字 —— 防的是从 zh.js 复制过来忘了翻译。
//    lang.* 是语言名，英文表里本来就用英文名，不涉及例外。
const hanInEn = Object.entries(en).filter(([, v]) => typeof v === 'string' && HAN.test(v))
if (hanInEn.length) fail(`en.js 里有汉字：${hanInEn.map(([k]) => k).join(', ')}`)

// 3. 占位符两边必须一致。少一个 {n} 不会报错，只会让英文句子缺个数字。
//    例外：某一侧就是空串。英文不加括注这类由语言习惯决定，写在下面并注明理由。
const HOLES_EXEMPT = {
  'langopt.suffix': '英文界面不给语言加括注，en.js 里是有意的空串',
}
for (const k of kz) {
  if (!(k in en)) continue
  const a = HOLES(zh[k]), b = HOLES(en[k])
  if (a !== b && !(k in HOLES_EXEMPT)) fail(`${k} 占位符不一致：zh(${a}) vs en(${b})`)
}

// 4. 调用点必须把占位符都传齐。字典写 {count}、调用点传 {n} 的话，界面上会
//    原样显示「共 {count} 条结果」—— t() 找不到的键保留原样，不报错也没有
//    任何提示，是这套机制里最容易悄悄漏掉的一环。
{
  const CALL = /\bt(?:Jsx)?\(\s*['"]((?:[\w-]+\.)*[\w-]+)['"]\s*/g
  const files = walk(SRC)
  const skipped = new Set()
  for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf8'))
    const rel = path.relative(SRC, file)
    let m
    while ((m = CALL.exec(code))) {
      const key = m[1]
      // key 写错时 t() 会把 key 原样显示出来，界面上就是一句 'side.xxx.yyy'
      if (!(key in zh)) { fail(`${rel}: t('${key}') 字典里没有这个 key`); continue }
      if (!(key in en)) { fail(`${rel}: t('${key}') en.js 里没有`); continue }
      let i = m.index + m[0].length
      if (code[i] !== ',') continue                   // 没传参数
      i++
      while (/\s/.test(code[i])) i++
      if (code[i] === ')') continue                   // t('k', ) 不会写，防手滑
      if (code[i] !== '{') { skipped.add(key); continue }   // 传的是变量，静态看不出来
      // 取配对的大括号
      let depth = 0, j = i
      for (; j < code.length; j++) {
        if (code[j] === '{') depth++
        else if (code[j] === '}' && --depth === 0) break
      }
      // 解析顶层 key：按逗号切，再砍掉 `: 值`；简写 { lo, hi } 直接就是 key
      const body = code.slice(i + 1, j)
      const provided = new Set()
      let d = 0, cur = ''
      for (const ch of body + ',') {
        if ('([{'.includes(ch)) d++
        else if (')]}'.includes(ch)) d--
        else if (ch === ',' && d === 0) {
          const name = cur.trim().split(':')[0].trim()
          if (/^[A-Za-z_$][\w$]*$/.test(name)) provided.add(name)
          cur = ''
          continue
        }
        cur += ch
      }
      const need = HOLES(zh[key] ?? en[key])
      const miss = need ? need.split(',').filter(h => !provided.has(h)) : []
      // 复数条目：count 是隐式的，调用点传的是 count 本身
      if (miss.length) fail(`${rel}: t('${key}') 少传占位符 {${miss.join('}, {')}}`)
    }
  }
  if (skipped.size) {
    console.log(`  ⚠️  ${skipped.size} 个 key 的参数是变量，静态查不了：${[...skipped].slice(0, 6).join(', ')}${skipped.size > 6 ? ' …' : ''}`)
  }
}

// 5. 后端错误码 ↔ 字典。这是两条最危险的通道：前端 errText() 查不到 code
//    就会退回后端的中文原文，英文界面上突然冒一句中文，还不报错。
if (fs.existsSync(BACKEND)) {
  const codes = new Set()
  const walkPy = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== '__pycache__') walkPy(p) }
      else if (e.name.endsWith('.py')) {
        const s = fs.readFileSync(p, 'utf8')
        for (const m of s.matchAll(/"code":\s*"([A-Z_]+)"/g)) codes.add(m[1])
        for (const m of s.matchAll(/ParseError\(\s*"([A-Z_]+)"/g)) codes.add(m[1])
      }
    }
  }
  walkPy(BACKEND)

  // 前端自己造的三个码没有后端来源，其余每个 err.* 都该能在后端找到出处
  const LOCAL = new Set(['UNKNOWN', 'NETWORK', 'TIMEOUT'])
  const missing = [...codes].filter(c => !(`err.${c}` in zh) || !(`err.${c}` in en))
  const orphan = Object.keys(zh)
    .filter(k => k.startsWith('err.') && !LOCAL.has(k.slice(4)) && !codes.has(k.slice(4)))
    .map(k => k.slice(4))
  if (missing.length) fail(`后端有码但字典没有：${missing.join(', ')}`)
  if (orphan.length) fail(`字典有文案但后端查无此码（拼错 / 已废弃？）：${orphan.join(', ')}`)
  if (!missing.length && !orphan.length) console.log(`  ✅ 后端 ${codes.size} 个错误码两边都对得上`)
} else {
  console.log('  ⚠️  没找到 backend/ 目录，跳过错误码对拍')
}

if (!onlyZh.length && !onlyEn.length && !hanInEn.length && !bad) {
  console.log(`  ✅ zh / en 各 ${kz.length} 条，key 与占位符完全对齐`)
}

console.log('')
if (bad || hits) {
  console.log(`  ✗ i18n 还有 ${hits} 处漏翻、${bad} 处字典问题`)
  process.exit(1)
}
console.log('  ✅ i18n 检查全部通过')
