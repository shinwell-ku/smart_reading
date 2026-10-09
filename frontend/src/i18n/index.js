/**
 * 界面国际化 —— 自己实现，不引 i18n 库。
 *
 * 只有中英两种语言、约 280 条文案，i18next 那套命名空间 / 懒加载 / 格式化
 * 一条都用不上，却要多背 ~40KB gzip。这里一个字典表加一个 t() 就够。
 */
import { useSyncExternalStore } from 'react'
import zh from './zh'
import en from './en'

export const DICTS = { zh, en }

export const LANGS = [
  { value: 'zh', label: '简体中文' },
  { value: 'en', label: 'English' },
]

const STORAGE_KEY = 'sr_uiLang'

// 语言存模块级变量，不是 React state —— api.js、useSpeech.js 这些非组件
// 代码也要出文案，它们拿不到 hook。React 侧用 useSyncExternalStore 订
// 同一个值，两边永远一致。
let current = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (DICTS[saved]) return saved
  } catch { /* 隐私模式等读不到 localStorage，走系统语言 */ }
  // 首次启动跟随系统语言：英文系统的用户第一次打开就该是英文
  return /^zh/i.test(navigator.language || '') ? 'zh' : 'en'
})()

const listeners = new Set()

export const getLang = () => current

export function setLang(lang) {
  if (!DICTS[lang] || lang === current) return
  current = lang
  try { localStorage.setItem(STORAGE_KEY, lang) } catch {}
  applyToDocument(lang)
  listeners.forEach(cb => cb())
}

// <html lang> 和窗口标题跟着语言走。
// 窗口标题设 document.title 就够 —— main.js 里 BrowserWindow 的 title
// 会被 HTML 的 <title> 覆盖，主进程不用改。
function applyToDocument(lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  document.title = DICTS[lang]['app.title']
}
applyToDocument(current)

const has = key => DICTS[current][key] !== undefined

/**
 * 取文案。
 *
 * ⚠️ 只能在**渲染路径**里调（组件函数体、JSX）。别把结果存进模块级常量 ——
 * 那样切语言时不会更新，而且会在「首次渲染时恰好是什么语言」上悄悄正确。
 * 需要在模块级放列表的，存 key，渲染时再 t()。
 *
 * @param key      字典 key，如 'side.translate.btn'
 * @param params   插值参数；带 count 时按英文复数在 one/other 之间选
 * @param fallback 查不到时的兜底（映射未收录的后端 code 时用，直接显示原文）
 */
export function t(key, params, fallback) {
  let s = DICTS[current][key]
  if (s === undefined) s = DICTS.zh[key]     // 英文表缺条目时退回中文，总比露出 key 强
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn('[i18n] 缺文案:', key)
    return fallback ?? key
  }
  // 复数：字典里给 { one, other } 就算复数条目。中英都只有两档，
  // 等哪天加俄语、波兰语（三档以上）再换 Intl.PluralRules 不迟。
  if (typeof s !== 'string') s = s[Number(params?.count) === 1 ? 'one' : 'other']
  // 参数缺失时保留 {k} 原样 —— 比静默变成空字符串容易发现问题
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m))
  return s
}

/** 语言代码 → 显示名。字典里没有的代码原样返回（系统可能装着别的语音） */
export function langName(code) {
  const s = DICTS[current]['lang.' + code]
  return typeof s === 'string' ? s : code
}

/**
 * 把后端响应变成可读文案。
 *
 * 后端返回的是 { error: <中文兜底>, code: <CODE>, params: {...} }，
 * 这里按 code 查当前语言的文案；查不到就退回后端的原文 —— 宁可显示
 * 中文兜底，也不要显示 err.SOMETHING 这种半成品。
 *
 * 收口在 api.js 里统一调用，见那边的注释。
 */
export function errText(r) {
  if (r?.code && has('err.' + r.code)) return t('err.' + r.code, r.params || r)
  return r?.error || t('err.UNKNOWN')
}

/**
 * 组件里用。语言一变就重渲染。
 *
 * 注意：切语言只会触发 re-render，**不会**卸载重挂 —— 所以阅读位置、
 * 面板宽度这些不会被重置。千万不要在任何地方写 key={lang}，那会把
 * 整棵子树重建，Reader 会跳回第一页。
 */
export function useI18n() {
  const lang = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb) },
    getLang,
  )
  return { lang, t, setLang, langName, errText }
}
