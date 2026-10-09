import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Select, Button, Input, message, notification, Modal, Tooltip, Progress, Alert } from 'antd'
import { DeleteOutlined, ZoomInOutlined, ZoomOutOutlined, SoundOutlined, PauseCircleOutlined, PlayCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useSpeech, useTtsPrefs, resolveVoice, isSupported as ttsSupported } from '../useSpeech'
import { SIDE_TABS } from '../sideTabs'
import { useI18n, t as tGlobal, tJsx, getLang } from '../i18n'

function cleanText(text) {
  if (!text) return ''
  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  t = t.replace(/\n{3,}/g, '\n\n')
  t = t.replace(/([^\n])\n(?=[^\n])/g, '$1 ')
  t = t.replace(/[ \t]+/g, ' ')
  t = t.replace(/[-￰-￿​-‍﻿◀▶▲▼←→↑↓↔↕♦♥♣♠•●○◆◇■□▬▲△▼▽◆◇○◎●◐◑★☆☛☚✔✗✘‰‼‽‽]/g, '')
  // 部分电子书在文本层塞了 0.007pt 的隐形锚点，如 idx_3a027a18。
  // 肉眼看不见但不占位，划选时会被一起圈进来。后端解析按字号过滤，
  // 这里拿到的是浏览器文本层的原文，得单独清一遍。
  // 固定 8 位十六进制，实测 158 个样本全为 8 位。
  // 两侧都不加 \b：标记与正文是两个相邻 span，取文本时被无缝拼在一起
  // （形如 idx_516bc706app），加边界反而匹配不上。收窄成精确的 8 位，
  // 就不会误伤后面那个正常单词。
  t = t.replace(/idx_[0-9a-fA-F]{8}/g, '')
  t = t.replace(/[ \t]{2,}/g, ' ')
  // 页眉页脚不在这里处理：判断哪一行是书眉要看整本书里哪些行在每页重复，
  // 单页信息不够，所以在后端解析时就剔除了（document_parser._strip_running_heads）。
  // 这里曾经有两条 /^\s*\d+\s*\n/ 之类的规则，但上面合并换行之后已经没有 \n
  // 可匹配，实际从未生效，已删除。
  t = t.split('\n').map(l => l.trim()).join('\n').trim()
  return t
}

// 秒数 → 人类可读时长。这个函数在组件外，拿不到 hook 里的 t，
// 所以用模块级的 tGlobal（它读的就是当前语言）。
function fmtDuration(sec) {
  if (sec == null) return ''
  if (sec < 60) return tGlobal('common.durSec', { n: sec })
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? tGlobal('common.durMinSec', { m, s }) : tGlobal('common.durMin', { m })
}

// 书的长度的单位中英不同：中文按「万字」（÷1e4），英文按 k characters
// （÷1e3）—— 差一个数量级，不能共用同一个参数值
function fmtLength(chars) {
  return getLang() === 'zh'
    ? `${(chars / 10000).toFixed(1)} 万字`
    : `${Math.round(chars / 1000)}k characters`
}

export default function SidePanel({ book, page, activeTab, onTabChange }) {
  const { t, langName } = useI18n()
  const [sourceText, setSourceText] = useState('')
  const [resultText, setResultText] = useState('')
  const [translateError, setTranslateError] = useState('')
  const [translating, setTranslating] = useState(false)
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('zh')
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [noteColor, setNoteColor] = useState('#FFD700')
  const [bookmarks, setBookmarks] = useState([])
  const [words, setWords] = useState([])
  const [wordRefresh, setWordRefresh] = useState(0)
  const [editingBmId, setEditingBmId] = useState(null)
  const [editingBmTitle, setEditingBmTitle] = useState('')
  const [graphExists, setGraphExists] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(null)
  const pollRef = useRef(null)
  const [searching, setSearching] = useState(false)
  const [graphData, setGraphData] = useState(null)
  const [graphLayout, setGraphLayout] = useState('force')
  const [graphLabels, setGraphLabels] = useState('auto')
  const [graphEdges, setGraphEdges] = useState('all')
  const [graphRepulsion, setGraphRepulsion] = useState(400)
  const [selectedEntity, setSelectedEntity] = useState(null)
  const [showEntityList, setShowEntityList] = useState(true)
  const [graphSearch, setGraphSearch] = useState('')
  const graphRef = useRef(null)
  const chartRef = useRef(null)
  const resizeObserverRef = useRef(null)

  // ── 朗读 ──
  const speech = useSpeech()
  const ttsPrefs = useTtsPrefs()
  const ttsVoice = resolveVoice(speech.voices, ttsPrefs)

  const toggleSpeak = () => {
    if (speech.state === 'playing') return speech.pause()
    if (speech.state === 'paused') return speech.resume()
    if (!ttsSupported) { message.warning(t('common.ttsUnsupported')); return }
    const text = sourceText.trim()
    if (!text) { message.info(t('side.tts.needText')); return }
    if (!ttsVoice) {
      // 不静默降级：宁可不出声，也不能拿英文声音念中文
      notification.warning({
        message: t('common.noVoice'),
        description: t('side.tts.noVoiceDesc', { lang: langName(ttsPrefs.lang) }),
        duration: 8,
      })
      return
    }
    speech.speak(text, { voice: ttsVoice, rate: ttsPrefs.rate })
  }

  useEffect(() => {
    const h = (e) => { if (e.detail && activeTab === 'translate') setSourceText(cleanText(e.detail.slice(0, 5000))) }
    window.addEventListener('pdf-selection', h)
    return () => window.removeEventListener('pdf-selection', h)
  }, [activeTab])

  useEffect(() => {
    if (!book) return
    api.getNotes(book.id).then(r => setNotes(r.notes || [])).catch(() => {})
    api.getBookmarks(book.id).then(r => setBookmarks(r.bookmarks || [])).catch(() => {})
    api.getWords(book.id).then(r => setWords(r.words || [])).catch(() => {})
    loadGraph(book.id)
  }, [book])

  useEffect(() => {
    const h = () => { if (book) api.getBookmarks(book.id).then(r => setBookmarks(r.bookmarks || [])).catch(() => {}) }
    window.addEventListener('refresh-bookmarks', h)
    return () => window.removeEventListener('refresh-bookmarks', h)
  }, [])

  // 切换书籍/卸载时停掉进度轮询，避免继续打接口
  useEffect(() => () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [book])

  // 切到知识图谱时自动加载
  useEffect(() => {
    if (activeTab === 'knowledge' && book) loadGraph(book.id)
  }, [activeTab, book])

  // 生词标签激活时 + 翻译后自动刷新
  useEffect(() => {
    if (activeTab === 'vocabulary' && book) {
      api.getWords(book.id).then(r => setWords(r.words || [])).catch(() => {})
    }
  }, [activeTab, book, wordRefresh])


  const translate = async () => {
    const text = sourceText.trim()
    if (!text) { message.info(t('side.translate.needText')); return }
    setTranslating(true)
    setResultText(t('side.translate.inProgress'))
    setTranslateError('')
    try {
      const r = await api.translate({ text: text, source_lang: sourceLang, target_lang: targetLang })
      if (r.error) { setTranslateError(r.error); setResultText(''); return }
      setResultText(r.translated_text || '')
      // 自动保存生词
      if (r.translated_text && book) {
        api.saveWord({ book_id: book.id, word: text, translation: r.translated_text || '', page_num: page }).then(() => {
          setWordRefresh(n => n + 1)
        }).catch(() => {})
      }
    } catch (e) {
      setTranslateError(e.message || t('err.NETWORK')); setResultText('')
    } finally {
      // 必须放在 finally：「未配置 AI 引擎」「接口返回错误」这两条路都是
      // return 出去的，写在 try 后面根本执行不到，按钮会一直转圈。
      setTranslating(false)
    }
  }

  const fillPageText = async () => {
    if (!book) return
    try {
      const r = await api.getPageContent(book.id, page)
      if (r.content) setSourceText(cleanText(r.content.slice(0, 3000)))
    } catch {}
  }

  const addNote = async () => {
    if (!book || !noteText.trim()) return
    await api.addNote(book.id, { page_num: page, content: noteText, color: noteColor })
    message.success(t('side.notes.added'))
    setNoteText('')
    const r = await api.getNotes(book.id)
    setNotes(r.notes || [])
  }

  const deleteNote = async (id) => {
    await api.deleteNote(id)
    const r = await api.getNotes(book.id)
    setNotes(r.notes || [])
  }

  // 从"直接读图谱"兜底：后端重启会丢内存里的进度，此时靠图谱是否生成来判断
  const finishIfGraphReady = async (bid) => {
    try {
      const data = await api.getKnowledgeGraph(bid)
      if (data.nodes && data.nodes.length) {
        setExtracting(false); setProgress(null)
        setGraphExists(true); setGraphData(data)
        notification.info({ message: t('side.tab.knowledge'), description: t('side.kg.extracted'), placement: 'bottomRight', duration: 6 })
        loadGraph(bid)
        return true
      }
    } catch {}
    return false
  }

  const startExtract = async () => {
    if (!book || extracting) return
    const bid = book.id

    // 先估算规模并提示。LLM 模式下这是几分钟 + 真金白银，
    // 不能让用户毫无预期地点一下然后干等。
    let llm = false
    try {
      const cfg = await api.getTranslatorConfig()
      // 注意：is_configured 是后端 pydantic 的 property，model_dump() 不会带出来，
      // 这里按同样的规则自己判断
      const r = cfg.remote || {}
      llm = !!(r.api_base && r.api_key && r.model)
    } catch {}

    const chars = book.total_chars || 0
    // 与后端分块一致：2000 字一块、200 字重叠 → 每块前进 1800 字
    const chunks = Math.max(1, Math.ceil(chars / 1800))
    const lo = Math.max(1, Math.round(chunks * 3 / 60))
    const hi = Math.max(2, Math.round(chunks * 8 / 60))

    const ok = await new Promise(resolve => {
      Modal.confirm({
        title: t('side.kg.confirmTitle'),
        width: 460,
        content: llm ? (
          <div style={{ fontSize: 12, lineHeight: 1.9 }}>
            <div>
              {/* 加粗的部分由 tJsx 的参数带进来 —— 词典里不能写 <b>，
                  那会被当纯文本渲染出来。长度单位也在这里算：中文按
                  万字、英文按 k characters，差一个数量级 */}
              {tJsx('side.kg.ai.intro', { len: <b>{fmtLength(chars)}</b>, chunks: <b>{chunks}</b> })}
            </div>
            <ul style={{ margin: '8px 0 0 18px', padding: 0, color: '#606266' }}>
              <li>{tJsx('side.kg.ai.time', { time: <b>{t('common.durRange', { lo, hi })}</b> })}</li>
              <li>{tJsx('side.kg.ai.calls', { chunks: <b>{chunks}</b> })}</li>
              <li>{t('side.kg.ai.keepOpen')}</li>
            </ul>
            <div style={{ marginTop: 8, color: '#909399' }}>
              {t('side.kg.ai.tip')}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, lineHeight: 1.9 }}>
            <div>
              {tJsx('side.kg.rule.intro', { len: <b>{fmtLength(chars)}</b> })}
            </div>
            <ul style={{ margin: '8px 0 0 18px', padding: 0, color: '#606266' }}>
              <li>{t('side.kg.rule.fast')}</li>
              <li>{t('side.kg.rule.free')}</li>
            </ul>
            <div style={{ marginTop: 8, color: '#fa8c16' }}>
              {t('side.kg.rule.warn')} {t('side.kg.rule.tip')}
            </div>
          </div>
        ),
        okText: t('side.kg.confirmOk'), cancelText: t('common.cancel'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
    if (!ok) return

    setExtracting(true)
    setProgress(null)
    if (chartRef.current) { chartRef.current.dispose(); chartRef.current = null }
    setGraphExists(false); setGraphData(null); setSelectedEntity(null)

    try { await api.extractKnowledge(bid) } catch {}

    let missCount = 0
    const timer = setInterval(async () => {
      let p = null
      try { p = await api.getKnowledgeProgress(bid) } catch {}

      if (p && p.running) {
        missCount = 0
        setProgress(p)
        return
      }

      // 后端已不在跑：可能刚好完成，也可能是重启丢了进度
      if (p && p.error) {
        clearInterval(timer)
        setExtracting(false); setProgress(null)
        message.error(t('side.kg.extractFailed', { msg: p.error }))
        return
      }
      if (await finishIfGraphReady(bid)) { clearInterval(timer); return }

      // 没在跑、也没报错、图谱还没生成 —— 先别急着下结论，给几次重试机会。
      // 注意 clearInterval 不能提到这段前面：一提就把轮询停了，missCount
      // 永远到不了 3，extracting 一直是 true，按钮就一直转圈。
      if (++missCount >= 3) {
        clearInterval(timer)
        setExtracting(false); setProgress(null)
        message.warning(t('side.kg.interrupted'))
      }
    }, 1000)

    pollRef.current = timer
  }

  const renderGraph = (data, layout, labels, edges, repulsion) => {
    if (!data || !graphRef.current) return

    // 布局映射
    const echartsLayout = layout === 'radial' ? 'force' : layout
    const showLabel = labels === 'all' ? true : labels === 'none' ? false : undefined
    const r = layout === 'circular' ? 0 : layout === 'radial' ? repulsion * 0.5 : repulsion

    // 边过滤
    const filteredEdges = data.edges.filter(e => {
      if (edges === 'all') return true
      if (edges === 'hierarchy') return e.type === 'hierarchy'
      if (edges === 'relation') return e.type !== 'hierarchy'
      return true
    })

    if (chartRef.current) { chartRef.current.dispose(); chartRef.current = null }
    if (resizeObserverRef.current) { resizeObserverRef.current.disconnect(); resizeObserverRef.current = null }

    import('echarts').then(echarts => {
      requestAnimationFrame(() => {
        if (!graphRef.current) return
        const chart = echarts.init(graphRef.current)
        chartRef.current = chart
        chart.setOption({
          tooltip: {
            formatter: (p) => {
              if (p.dataType !== 'node') return ''
              const desc = p.data.description || ''
              return `<b>${p.name}</b>${desc ? '<br/><span style="font-size:11px;color:#909399">' + desc.slice(0, 80) + '</span>' : ''}`
            }
          },
          series: [{
            type: 'graph',
            layout: echartsLayout,
            roam: true, draggable: true,
            circular: layout === 'circular' ? { rotateLabel: true } : undefined,
            data: data.nodes.map(n => ({
              id: n.id, name: n.label,
              symbolSize: [28, 22, 16, 12][n.level] || 12,
              itemStyle: {
                color: {
                  'root': '#636e72', 'chapter': '#13c2c2',
                  'concept': '#1677ff', 'technology': '#52c41a',
                  'method': '#faad14', 'person': '#722ed1', 'term': '#eb2f96',
                }[n.type] || '#bfbfbf',
                borderColor: '#fff', borderWidth: 2,
              },
              label: { show: showLabel !== undefined ? showLabel : n.level <= 2, fontSize: 11, fontWeight: n.level <= 1 ? 600 : 400 },
              // description/type/page_num 是自定义字段，双击跳原文要从这里读
              description: n.description, type: n.type, page_num: n.page_num,
            })),
            edges: filteredEdges.map(e => ({
              source: e.source, target: e.target,
              label: { show: showLabel !== undefined ? showLabel : true, formatter: e.label || '', fontSize: 9, color: '#909399' },
              lineStyle: {
                color: e.type === 'hierarchy' ? '#bfbfbf' : '#1677ff',
                width: e.type === 'hierarchy' ? 1 : 2,
                curveness: e.type === 'hierarchy' ? 0.2 : 0.3,
                type: e.type === 'hierarchy' ? 'solid' : 'dashed',
              },
            })),
            layoutAnimation: false,
            selectedMode: 'multiple',
            select: {
              itemStyle: { borderColor: '#303133', borderWidth: 3 },
              label: { fontWeight: 'bold', fontSize: 12 },
              lineStyle: { width: 2 },
            },
            emphasis: { focus: 'adjacency', lineStyle: { width: 2.5 } },
            force: { repulsion: r, edgeLength: [80, 200], gravity: layout === 'radial' ? 0.15 : 0.05, friction: 0.2 },
            label: { show: showLabel !== undefined ? showLabel : true, position: 'right', fontSize: 10, color: '#303133' },
            lineStyle: { color: '#e0e0e0' },
          }]
        })
        // 节点点击 → 查看详情 + 选中高亮
        chart.on('click', (params) => {
          if (params.dataType === 'node') {
            const node = data.nodes.find(n => n.id === params.data.id)
            if (node) setSelectedEntity(node)
          }
        })
        // 双击节点：清除选中 + 跳到该实体在原文中的页码
        chart.on('dblclick', (params) => {
          if (params.dataType !== 'node') return
          chart.dispatchAction({ type: 'unselectAll' })
          if (params.data.page_num > 0) {
            window.dispatchEvent(new CustomEvent('go-to-page', { detail: params.data.page_num }))
          }
        })
        const obs = new ResizeObserver(() => { try { chart.resize() } catch {} })
        obs.observe(graphRef.current)
        resizeObserverRef.current = obs
      })
    }).catch(e => console.error('[图谱] 渲染失败:', e))
  }

  const loadGraph = async (bid) => {
    try {
      const data = await api.getKnowledgeGraph(bid)
      if (!data.nodes || !data.nodes.length) {
        setGraphExists(false)
        setGraphData(null)
        return
      }
      setGraphExists(true)
      setGraphData(data)
      renderGraph(data, graphLayout, graphLabels, graphEdges, graphRepulsion)
    } catch (e) { console.error('[图谱] 加载失败:', e) }
  }

  // 布局/标签/边/斥力切换时重新渲染
  useEffect(() => {
    if (graphData) renderGraph(graphData, graphLayout, graphLabels, graphEdges, graphRepulsion)
  }, [graphLayout, graphLabels, graphEdges, graphRepulsion])

  // Language options
  const langOpts = [
    { value: 'auto', key: 'lang.auto' }, { value: 'zh', native: '中文', key: 'lang.zh' },
    { value: 'en', native: 'English', key: 'lang.en' }, { value: 'ja', native: '日本語', key: 'lang.ja' },
    { value: 'ko', native: '한국어', key: 'lang.ko' }, { value: 'fr', native: 'Français', key: 'lang.fr' },
    { value: 'de', native: 'Deutsch', key: 'lang.de' }, { value: 'es', native: 'Español', key: 'lang.es' },
    { value: 'ru', native: 'Русский', key: 'lang.ru' }, { value: 'pt', native: 'Português', key: 'lang.pt' },
    { value: 'it', native: 'Italiano', key: 'lang.it' }, { value: 'nl', native: 'Nederlands', key: 'lang.nl' },
    { value: 'pl', native: 'Polski', key: 'lang.pl' }, { value: 'tr', native: 'Türkçe', key: 'lang.tr' },
    { value: 'vi', native: 'Tiếng Việt', key: 'lang.vi' }, { value: 'th', native: 'ไทย', key: 'lang.th' },
    { value: 'ar', native: 'العربية', key: 'lang.ar' }, { value: 'hi', native: 'हिन्दी', key: 'lang.hi' },
    { value: 'mn', native: 'Монгол', key: 'lang.mn' },
  ].map(o => ({
    // 母语名固定不变（用户扫这个列表找的是"我要翻成的那门语言"），
    // 括注跟着界面语言走 —— 英文界面下 langopt.suffix 是空串，
    // 就只剩母语名
    value: o.value,
    label: o.native ? `${o.native}${t('langopt.suffix', { name: t(o.key) })}` : t(o.key),
  }))

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 面板内容（左侧） */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'translate' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div className="panel-controls">
              <Select value={sourceLang} onChange={setSourceLang} size="small" style={{ width: 140 }} options={langOpts} />
              <Button size="small" onClick={() => { const s = sourceLang; const tgt = targetLang === 'auto' ? 'en' : targetLang; setSourceLang(tgt); setTargetLang(s === 'auto' ? 'en' : s) }}>⇄</Button>
              <Select value={targetLang} onChange={setTargetLang} size="small" style={{ width: 140 }} options={langOpts.filter(o => o.value !== 'auto')} />
              <Button type="primary" size="small" onClick={translate} loading={translating}>{t('side.translate.btn')}</Button>
              <Button size="small" onClick={fillPageText}>{t('side.translate.currentPage')}</Button>
              <Button size="small" onClick={() => { setSourceText(''); setResultText('') }}>{t('side.translate.clear')}</Button>
              <Tooltip title={speech.state === 'playing' ? t('side.speak.pause') : speech.state === 'paused' ? t('side.speak.resume') : t('side.speak.play')}>
                <Button size="small" onClick={toggleSpeak}
                        icon={speech.state === 'playing' ? <PauseCircleOutlined /> : speech.state === 'paused' ? <PlayCircleOutlined /> : <SoundOutlined />} />
              </Tooltip>
              {speech.state !== 'idle' && (
                <Tooltip title={t('side.speak.stop')}><Button size="small" onClick={speech.stop} icon={<CloseCircleOutlined />} /></Tooltip>
              )}
            </div>
            {speech.state !== 'idle' && (
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#909399', alignItems: 'baseline', flexShrink: 0 }}>
                <span style={{ flexShrink: 0 }}>{speech.state === 'paused' ? t('side.speak.paused') : t('side.speak.playing')} {speech.index + 1}/{speech.sentences.length}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#606266' }}>
                  {speech.sentences[speech.index] || ''}
                </span>
              </div>
            )}
            <Input.TextArea className="panel-textarea" value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder={t('side.translate.srcPlaceholder')} />
            {translateError && (
              <Alert
                type="error" showIcon message={translateError}
                action={<Button size="small" type="link" onClick={() => window.dispatchEvent(new CustomEvent('open-settings'))}>{t('side.translate.goSettings')}</Button>}
              />
            )}
            <Input.TextArea className="panel-textarea" value={resultText} readOnly placeholder={t('side.translate.resultPlaceholder')} />
          </div>
        )}
        {activeTab === 'vocabulary' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto' }}>
              {words.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20, fontSize: 12 }}>{t('side.vocab.empty')}</div>
              ) : (
                words.map((w, i) => (
                  <div key={w.id || i} className="panel-card" style={{ padding: '8px 8px 4px', marginBottom: 6, borderRadius: 4, border: '1px solid #e4e7ed', fontSize: 12, position: 'relative' }}>
                    <div style={{ fontWeight: 600, color: '#303133', marginBottom: 2, paddingRight: 20 }}>{w.word}</div>
                    <div style={{ color: '#1677ff', marginBottom: 2 }}>{w.translation}</div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#909399', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {w.page_num > 0 && (
                          <span style={{ cursor: 'pointer' }} onClick={() => window.dispatchEvent(new CustomEvent('go-to-page', { detail: w.page_num }))}>
                            {t('common.pageNo', { page: w.page_num })}
                          </span>
                        )}
                        <span>{w.created_at || ''}</span>
                      </div>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ width: 20, height: 20, minWidth: 0, fontSize: 10 }}
                        onClick={async () => { await api.deleteWord(w.id); setWords(words.filter(x => x.id !== w.id)) }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {activeTab === 'notes' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <Input.TextArea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder={t('side.notes.placeholder')} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['#FFD700', '#FF6B6B', '#51CF66', '#339AF0', '#CC66FF'].map(c => (
                <div key={c} onClick={() => setNoteColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: noteColor === c ? '2px solid #303133' : '2px solid transparent', flexShrink: 0 }} />
              ))}
              <Button type="primary" size="small" onClick={addNote}>{t('side.notes.add')}</Button>
            </div>
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
              {notes.length === 0 ? <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20 }}>{t('side.notes.empty')}</div> : notes.map(n => (
                <div key={n.id} className="panel-card" style={{ padding: 8, marginBottom: 6, borderRadius: 4, borderLeft: '3px solid ' + (n.color || '#ffd43b'), fontSize: 12 }}>
                  <div>{n.content}</div>
                  <div style={{ display: 'flex', fontSize: 11, color: '#909399', marginTop: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('common.pageNo', { page: n.page_num })} {n.created_at || ''}</span>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ width: 20, height: 20, minWidth: 0, fontSize: 10 }} onClick={() => deleteNote(n.id)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'bookmarks' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto' }}>
              {bookmarks.length === 0 ? <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20 }}>{t('side.bookmarks.empty')}</div> : bookmarks.map(b => (
                <div key={b.id} style={{ padding: '6px 8px', fontSize: 12, borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => { if (editingBmId !== b.id) window.dispatchEvent(new CustomEvent('go-to-page', { detail: b.page_num })) }}>
                    <div style={{ flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                      {editingBmId === b.id ? (
                        <Input size="small" value={editingBmTitle} autoFocus
                          onChange={e => setEditingBmTitle(e.target.value)}
                          onBlur={async () => {
                            if (editingBmTitle.trim()) {
                              await api.updateBookmark(b.id, { title: editingBmTitle.trim() })
                              const r = await api.getBookmarks(book.id)
                              setBookmarks(r.bookmarks || [])
                            }
                            setEditingBmId(null)
                          }}
                          onPressEnter={async () => {
                            if (editingBmTitle.trim()) {
                              await api.updateBookmark(b.id, { title: editingBmTitle.trim() })
                              const r = await api.getBookmarks(book.id)
                              setBookmarks(r.bookmarks || [])
                            }
                            setEditingBmId(null)
                          }}
                        />
                      ) : (
                        <span onClick={() => { setEditingBmId(b.id); setEditingBmTitle(b.title || t('common.pageNo', { page: b.page_num })) }} style={{ color: '#303133' }}>{b.title || t('common.pageNo', { page: b.page_num })}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#909399', flexShrink: 0, fontSize: 11 }}>{t('common.pageNo', { page: b.page_num })} {b.created_at || ''}</span>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ width: 20, height: 20, minWidth: 0, fontSize: 10 }} onClick={function(e) { e.stopPropagation(); api.deleteBookmark(b.id).then(function() { api.getBookmarks(book.id).then(function(r) { setBookmarks(r.bookmarks || []) }) }) }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'search' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <Input.Search
              placeholder={t('side.search.placeholder')} value={searchQuery} allowClear
              onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults([]) }}
              loading={searching}
              onSearch={async (val) => {
                if (!book || !val.trim()) return
                setSearching(true)
                try {
                  const r = await api.search(book.id, val.trim())
                  setSearchResults(r.results || [])
                } catch { message.error(t('side.search.failed')) }
                setSearching(false)
              }}
            />
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
              {searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20, fontSize: 12 }}>{t('side.search.hint')}</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#909399', marginBottom: 6 }}>{t('side.search.count', { count: searchResults.length })}</div>
                  {searchResults.map((r, i) => {
                    const page = r.page || Math.ceil((r.line || i) / 40) || 1
                    return (
                      <div key={i} className="panel-card" style={{ padding: 8, marginBottom: 6, borderRadius: 4, border: '1px solid #e4e7ed', fontSize: 12, cursor: 'pointer' }}
                        onClick={() => window.dispatchEvent(new CustomEvent('go-to-page', { detail: page }))}>
                        <div style={{ color: '#1677ff', marginBottom: 4 }}>{t('side.search.hit', { page, line: r.line || i + 1 })}</div>
                        <div style={{ color: '#606266', lineHeight: 1.6, wordBreak: 'break-all' }} dangerouslySetInnerHTML={{
                          __html: (r.context || r.matched || '').replace(new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<span style="background:#ffd43b;padding:0 2px">${m}</span>`)
                        }} />
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>
        )}
        {activeTab === 'knowledge' && (
          <div className="panel-body" style={{ flex: 1 }}>
            {graphExists && (
              <div style={{ display: 'flex', gap: 4, paddingBottom: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'nowrap' }}>
                <Select size="small" value={graphLayout} onChange={setGraphLayout} style={{ width: 82 }}
                  options={[{ value: 'force', label: t('side.kg.layout.force') }, { value: 'circular', label: t('side.kg.layout.circular') }, { value: 'radial', label: t('side.kg.layout.radial') }]} />
                <Select size="small" value={graphLabels} onChange={setGraphLabels} style={{ width: 82 }}
                  options={[{ value: 'auto', label: t('side.kg.label.auto') }, { value: 'all', label: t('side.kg.label.all') }, { value: 'none', label: t('side.kg.label.none') }]} />
                {graphLayout !== 'circular' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 10, color: '#909399' }}>{t('side.kg.sparse')}</span>
                    <input type="range" min={100} max={800} step={50} value={graphRepulsion} onChange={e => setGraphRepulsion(Number(e.target.value))} style={{ width: 50, margin: 0 }} />
                    <span style={{ fontSize: 10, color: '#909399' }}>{t('side.kg.dense')}</span>
                  </div>
                )}
                <Button size="small" type={showEntityList ? 'primary' : 'default'} onClick={() => setShowEntityList(v => !v)} style={{ fontSize: 11 }}>{showEntityList ? t('side.kg.list.hide') : t('side.kg.list.show')}</Button>
                <Tooltip title={t('side.kg.zoomOut')}><Button size="small" icon={<ZoomOutOutlined />} onClick={() => { try { chartRef.current?.setOption({ series: [{ zoom: (chartRef.current.getOption().series[0]?.zoom || 1) / 1.3 }] }) } catch {} }} /></Tooltip>
                <Tooltip title={t('side.kg.zoomIn')}><Button size="small" icon={<ZoomInOutlined />} onClick={() => { try { chartRef.current?.setOption({ series: [{ zoom: (chartRef.current.getOption().series[0]?.zoom || 1) * 1.3 }] }) } catch {} }} /></Tooltip>
                <Tooltip title={t('side.kg.reset')}><Button size="small" onClick={() => { try { chartRef.current?.setOption({ series: [{ zoom: 1, center: ['50%', '50%'] }] }) } catch {} }} style={{ fontSize: 11, padding: '0 6px' }}>⊡</Button></Tooltip>
                <Button size="small" danger onClick={async () => { if (!book || !graphExists) return; await api.deleteKnowledgeGraph(book.id); setGraphExists(false); setGraphData(null); setSelectedEntity(null); if (chartRef.current) { chartRef.current.dispose(); chartRef.current = null } }}>{t('side.kg.clear')}</Button>
              </div>
            )}
            {graphExists && (
              <div style={{ fontSize: 10, color: '#909399', paddingBottom: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#1677ff', marginRight:2 }}></span>{t('side.kg.type.concept')}</span>
                <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#52c41a', marginRight:2 }}></span>{t('side.kg.type.technology')}</span>
                <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#faad14', marginRight:2 }}></span>{t('side.kg.type.method')}</span>
                <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#722ed1', marginRight:2 }}></span>{t('side.kg.type.person')}</span>
                <span><span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:'#eb2f96', marginRight:2 }}></span>{t('side.kg.type.term')}</span>
              </div>
            )}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 6 }}>
              {graphExists && showEntityList && graphData && (
                <div style={{ width: 150, flexShrink: 0, fontSize: 11, borderRight: '1px solid #f0f0f0', paddingRight: 4, display: 'flex', flexDirection: 'column' }}>
                  <Input size="small" placeholder={t('side.kg.entityPlaceholder')} value={graphSearch} onChange={e => setGraphSearch(e.target.value)} style={{ marginBottom: 4, fontSize: 11 }} />
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {graphData.nodes.filter(n => n.level >= 2 && (!graphSearch || n.label.includes(graphSearch))).map((n, i) => (
                      <div key={n.id} style={{ padding: '3px 6px', cursor: 'pointer', borderRadius: 3, color: '#303133', marginBottom: 2, background: selectedEntity?.id === n.id ? '#e6f4ff' : 'transparent', borderLeft: `3px solid ${{root:'#636e72',chapter:'#13c2c2',concept:'#1677ff',technology:'#52c41a',method:'#faad14',person:'#722ed1',term:'#eb2f96'}[n.type] || '#bfbfbf'}` }} onClick={() => setSelectedEntity(n)}>{n.label}</div>
                    ))}
                  </div>
                </div>
              )}
              <div ref={graphRef} className="panel-graph" style={{ flex: 1, minHeight: 150 }}>
              {!graphExists && !extracting && (
                <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 30, fontSize: 12 }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>🔗</div>
                  {t('side.kg.empty')}
                </div>
              )}
              {extracting && (
                <div style={{ padding: '24px 16px', fontSize: 12 }}>
                  <Progress
                    percent={progress?.percent ?? 0}
                    status={progress?.percent == null ? 'active' : 'normal'}
                    showInfo={progress?.percent != null}
                    strokeColor="#1677ff"
                  />
                  <div style={{ textAlign: 'center', color: '#606266', marginTop: 8 }}>
                    {/* 后端 progress.stage 是固定的几个值，字典里有对应文案；
                        还没报到 stage 时（刚点下去那一下）显示「正在启动」 */}
                    {t('side.kg.stage.' + (progress?.stage || ''), null, t('side.kg.starting'))}
                  </div>
                  {progress?.total > 0 && (
                    <div style={{ textAlign: 'center', color: '#909399', marginTop: 2 }}>
                      {t('side.kg.chunk', { cur: progress.current, total: progress.total })}
                      {progress.eta > 0 && t('side.kg.eta', { time: fmtDuration(progress.eta) })}
                    </div>
                  )}
                  {progress?.eta == null && progress?.elapsed > 0 && (
                    <div style={{ textAlign: 'center', color: '#c0c4cc', marginTop: 2 }}>
                      {t('side.kg.elapsed', { time: fmtDuration(progress.elapsed) })}
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <Button size="small" type="primary" block disabled={extracting} loading={extracting}
                onClick={startExtract}>
                {extracting ? t('side.kg.generating') : graphExists ? t('side.kg.regenerate') : t('side.kg.generate')}
              </Button>
            </div>
          </div>
        )}
        {/* 实体详情弹窗 */}
        <Modal title={selectedEntity?.label || ''} open={!!selectedEntity} onCancel={() => setSelectedEntity(null)} footer={null} width={360} centered>
          {selectedEntity && (
            <div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#909399' }}>{t('side.kg.typeLabel')}</span>
                <span style={{ fontSize: 13 }}>{selectedEntity.type || 'concept'}</span>
              </div>
              {selectedEntity.description && (
                <div className="panel-card" style={{ marginBottom: 8, fontSize: 12, color: '#303133', lineHeight: 1.6, padding: 8, borderRadius: 4 }}>
                  {selectedEntity.description}
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
      {/* 右侧竖排 tab 标签 */}
      <div className="tab-rail" style={{ width: 56, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e4e7ed', flexShrink: 0, alignItems: 'center' }}>
        {SIDE_TABS.map(tab => (
          <div key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{ padding: '12px 0 8px', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #e4e7ed', color: tab.key === activeTab ? '#1677ff' : '#909399', width: '100%', background: tab.key === activeTab ? '#e6f4ff' : 'transparent', borderLeft: `3px solid ${tab.key === activeTab ? '#1677ff' : 'transparent'}`, transition: 'all 0.15s' }}>
            <div style={{ fontSize: 20 }}>{tab.icon}</div>
            <div style={{ fontSize: 10, marginTop: 2, fontWeight: tab.key === activeTab ? 600 : 400 }}>{t(tab.i18n)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
