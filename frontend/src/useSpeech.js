/**
 * 朗读 —— 基于浏览器内建的 Web Speech API（window.speechSynthesis）。
 *
 * 为什么不带本地模型、也不走后端合成：Chromium 自带语音合成，用的是操作系统
 * 已经装好的语音。零依赖、离线可用、即点即读，安装包体积一点不涨。
 *
 * （早期版本是后端调 macOS 的 `say` 命令合成再回传 WAV —— 只能在 macOS 用，
 *   而且不是流式，长文本要等全文合成完才出声；为它引入的 onnxruntime +
 *   piper-phonemize 两个大依赖后来也一并移除了。）
 *
 * 语言支持取决于系统：
 *   macOS   系统语音，中文有婷婷/美佳/善怡等，开箱可用
 *   Windows SAPI，中文语音取决于有没有装对应语言包
 *   Linux   需要额外装 speech-dispatcher，多半没有
 * 找不到目标语言的语音时**不静默回退**（否则会用英文声音念中文），
 * 由调用方提示用户。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null

export const isSupported = !!synth

// ── 语音列表 ────────────────────────────────────────────────
// Chromium 的 getVoices() 首次调用返回空数组，要等 voiceschanged 事件才有。
// 这是已知行为，不是 bug —— 所以这里同步取一次、异步再取一次。
export function loadVoices() {
  return new Promise(resolve => {
    if (!synth) return resolve([])
    const now = synth.getVoices()
    if (now.length) return resolve(now)

    let done = false
    const finish = v => { if (!done) { done = true; synth.removeEventListener?.('voiceschanged', onChange); resolve(v) } }
    const onChange = () => { const v = synth.getVoices(); if (v.length) finish(v) }

    synth.addEventListener?.('voiceschanged', onChange)
    // 兜底：个别环境不触发 voiceschanged，1.5 秒后拿一次就算数
    setTimeout(() => finish(synth.getVoices()), 1500)
  })
}

/** 按语言挑语音；挑不到返回 null（**不**退而求其次用别的语言） */
export function pickVoice(voices, lang) {
  if (!voices || !voices.length) return null
  const norm = s => (s || '').toLowerCase().replace('_', '-')
  const want = norm(lang || 'zh')

  return voices.find(v => norm(v.lang) === want)
      || voices.find(v => norm(v.lang).startsWith(want.split('-')[0]))
      || null
}

/** 用户选定的语音（按 voiceURI 记，跨设备名字可能不重名）+ 语速 */
export function resolveVoice(voices, prefs) {
  return voices.find(v => v.voiceURI === prefs.voiceURI) || pickVoice(voices, prefs.lang)
}

// ── 朗读偏好（存 localStorage，与 sr_eyeCare 一个路子）──
const PREFS_KEY = 'sr_tts'
const PREFS_DEFAULT = { voiceURI: '', rate: 1, lang: 'zh' }

export function readTtsPrefs() {
  try {
    return { ...PREFS_DEFAULT, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }
  } catch { return { ...PREFS_DEFAULT } }
}

export function writeTtsPrefs(patch) {
  const next = { ...readTtsPrefs(), ...patch }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  // 走 window 事件通知其它组件 —— 项目里跨组件通信统一用这个方式
  window.dispatchEvent(new Event('tts-prefs-changed'))
  return next
}

export function useTtsPrefs() {
  const [prefs, setPrefs] = useState(readTtsPrefs)
  useEffect(() => {
    const h = () => setPrefs(readTtsPrefs())
    window.addEventListener('tts-prefs-changed', h)
    return () => window.removeEventListener('tts-prefs-changed', h)
  }, [])
  return prefs
}

// ── 按句切片 ────────────────────────────────────────────────
// 两个原因，缺一不可：
//   1. Chromium 对单个 utterance 有长度上限，超长文本会被**静默截断**，
//      读到一半就没声了，而且不报错。
//   2. 切成句才能「暂停在当前句」「跳到下一句」—— 整段丢进去就只能从头听。
//
// 中文按 。！？； 断，英文的 `.` 只在后面跟空格或行尾时才算句末
// （否则 "3.5"、"e.g." 会被切开）。
export function splitSentences(text, maxLen = 160) {
  if (!text) return []
  const flat = String(text).replace(/\s+/g, ' ').trim()
  if (!flat) return []

  const rough = flat.split(/(?<=[。！？；!?;])|(?<=\.)(?=\s|$)/)

  const out = []
  for (const piece of rough) {
    const s = piece.trim()
    if (!s) continue
    if (s.length <= maxLen) { out.push(s); continue }

    // 超长（整段没标点）：按逗号再切
    for (const sub of s.split(/(?<=[，,、])/)) {
      const t = sub.trim()
      if (!t) continue
      if (t.length <= maxLen) { out.push(t); continue }
      // 连逗号都没有：硬切，保证不超上限
      for (let i = 0; i < t.length; i += maxLen) out.push(t.slice(i, i + maxLen))
    }
  }
  return out
}

// ── 播放器 ──────────────────────────────────────────────────
/**
 * @returns {{
 *   voices: SpeechSynthesisVoice[],
 *   state: 'idle'|'playing'|'paused',
 *   index: number,          // 正在读第几句，-1 表示没在读
 *   sentences: string[],
 *   speak(text, opts): void,
 *   pause(): void, resume(): void, stop(): void,
 *   setVoice(v): void, setRate(r): void,
 * }}
 */
export function useSpeech(settings = {}) {
  const [voices, setVoices] = useState([])
  const [state, setState] = useState('idle')
  const [index, setIndex] = useState(-1)
  const [sentences, setSentences] = useState([])

  const cfg = useRef({ voice: null, rate: 1, onFinish: null })
  const stopped = useRef(false)
  const keepAlive = useRef(null)

  useEffect(() => { loadVoices().then(setVoices) }, [])

  // 播放期间每 10 秒戳一下 pause/resume。
  // Chromium 有个老毛病：连续合成超过十几秒会不声不响地停住，
  // 这一下能把它续上。只在真的在播时执行，不影响暂停状态。
  const startKeepAlive = useCallback(() => {
    if (keepAlive.current) return
    keepAlive.current = setInterval(() => {
      if (synth && synth.speaking && !synth.paused) { synth.pause(); synth.resume() }
    }, 10000)
  }, [])
  const stopKeepAlive = useCallback(() => {
    if (keepAlive.current) { clearInterval(keepAlive.current); keepAlive.current = null }
  }, [])

  useEffect(() => () => { stopKeepAlive(); synth?.cancel() }, [stopKeepAlive])

  const speak = useCallback((text, opts = {}) => {
    if (!synth) return
    const list = Array.isArray(text) ? text : splitSentences(text)
    if (!list.length) return

    stopped.current = false
    cfg.current = {
      voice: opts.voice !== undefined ? opts.voice : cfg.current.voice,
      rate: opts.rate !== undefined ? opts.rate : cfg.current.rate,
      onFinish: opts.onFinish || null,
    }
    setSentences(list)
    setState('playing')
    setIndex(0)

    // 一次把所有句子排进队列：Chromium 会顺序播，句间无缝。
    // 比「每句 onend 里再 speak() 下一句」稳 —— 那种写法在 cancel 之后
    // 紧接着 speak 经常不发声，而且句间会有一小段空隙。
    const enqueue = () => {
      if (stopped.current) return
      list.forEach((s, i) => {
        const u = new SpeechSynthesisUtterance(s)
        if (cfg.current.voice) u.voice = cfg.current.voice
        u.rate = cfg.current.rate
        if (cfg.current.voice?.lang) u.lang = cfg.current.voice.lang
        u.onstart = () => setIndex(i)
        u.onend = () => {
          if (stopped.current) return
          if (i === list.length - 1) {
            setState('idle'); setIndex(-1); stopKeepAlive()
            cfg.current.onFinish?.()
          }
        }
        u.onerror = e => {
          // 'interrupted'/'canceled' 是上面那句 cancel 造成的，不是故障
          if (e.error === 'interrupted' || e.error === 'canceled') return
          console.warn('[朗读]', e.error)
        }
        synth.speak(u)
      })
      startKeepAlive()
    }

    // 换语音/语速、或从头重放，都要先把队列清掉，否则改动对已入队的句子不生效。
    // 但 cancel 之后同步紧接着 speak 有时直接不出声（Chromium 的老毛病），
    // 所以要等一拍再排 —— 60ms 足够让它把队列清干净，用户也觉察不到。
    if (synth.speaking || synth.pending) {
      synth.cancel()
      setTimeout(enqueue, 60)
    } else {
      enqueue()
    }
  }, [startKeepAlive, stopKeepAlive])

  const pause = useCallback(() => {
    if (!synth) return
    synth.pause(); setState('paused')
  }, [])

  const resume = useCallback(() => {
    if (!synth) return
    synth.resume(); setState('playing')
  }, [])

  const stop = useCallback(() => {
    if (!synth) return
    stopped.current = true
    synth.cancel()
    setState('idle'); setIndex(-1); setSentences([])
    stopKeepAlive()
  }, [stopKeepAlive])

  // 从第 n 句开始重排（点击某句跳读时用）
  const speakFrom = useCallback((list, n, opts = {}) => {
    speak(list.slice(n), { ...opts, onFinish: opts.onFinish })
    setIndex(n)
  }, [speak])

  return { voices, state, index, sentences, speak, speakFrom, pause, resume, stop }
}
