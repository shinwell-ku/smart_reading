import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { api } from '../api'
import { Button, Slider, message, notification, Tooltip } from 'antd'
import { BarsOutlined, StarOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/TextLayer.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { useSpeech, useTtsPrefs, resolveVoice, isSupported as ttsSupported } from '../useSpeech'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export default function Reader({ book, onPageChange, onBack }) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)       // 当前可见页
  const [scale, setScale] = useState(1)          // 显示缩放（CSS transform 用）
  const [renderScale, setRenderScale] = useState(1)  // canvas 光栅化用的缩放，恒定不变则不重绘
  const [textFontSize, setTextFontSize] = useState(15)
  const [loading, setLoading] = useState(true)
  const [pdfData, setPdfData] = useState(null)
  const [docxContent, setDocxContent] = useState('')
  const [docxAllText, setDocxAllText] = useState('')  // DOCX 全文
  const [docxPages, setDocxPages] = useState([])       // DOCX 分页数组
  const [pageBaseHeights, setPageBaseHeights] = useState([])  // 各页在 scale=1 下的高度
  // pageOffsets / totalHeight 由 pageBaseHeights + scale 经 useMemo 派生，见下方
  const scrollRef = useRef(null)
  const restoredRef = useRef(false)   // 是否已恢复过阅读位置（只恢复一次）
  const pageRef = useRef(page)
  pageRef.current = page
  const pdfRef = useRef(null)

  // pdf 走 react-pdf 画布；其余（docx / txt / md / html）都是文本分页渲染
  const isText = !!book?.file_type && book.file_type !== 'pdf'
  const chapters = book?.chapters || []
  const [outlineOpen, setOutlineOpen] = useState(false)

  // ── 朗读 ──
  const speech = useSpeech()
  const ttsPrefs = useTtsPrefs()
  const ttsVoice = resolveVoice(speech.voices, ttsPrefs)
  const [continuous, setContinuous] = useState(false)
  // 连续朗读要在异步回调里读最新值，用 ref 兜住
  const continuousRef = useRef(false)
  continuousRef.current = continuous
  const readingPageRef = useRef(1)
  // 目录面板宽度：可拖拽，记住上次的宽度
  const [outlineWidth, setOutlineWidth] = useState(() => {
    const saved = parseInt(localStorage.getItem('sr_outlineWidth'), 10)
    return Number.isFinite(saved) ? Math.max(160, Math.min(420, saved)) : 220
  })
  const [scrollPos, setScrollPos] = useState(0)  // 触发虚拟滚动重渲染

  // ─── 加载文档 ───
  useEffect(() => {
    if (!book) return
    setLoading(true)
    setPdfData(null)
    setDocxContent('')
    setDocxAllText('')
    setPage(1)
    setNumPages(0)
    setPageBaseHeights([])        // 换书时清掉上一本的页高基准
    setRenderScale(1)
    restoredRef.current = false

    if (isText) {
      ;(async () => {
        try {
          let restoredPage = 1
          try { const p = await api.getProgress(book.id); if (p?.current_page > 1) restoredPage = p.current_page } catch {}
          pageRef.current = restoredPage  // 同步 ref，供后续滚动恢复使用
          setPage(restoredPage)
          onPageChange(restoredPage)
          setNumPages(book.total_pages || 0)
          // DOCX: 加载全部文本
          await loadDocxAll(book.id)
          setLoading(false)
        } catch (e) {
          console.error('DOCX load error:', e)
          message.error('文档加载失败')
          setLoading(false)
        }
      })()
    } else {
      ;(async () => {
        try {
          let restoredPage = 1
          try { const p = await api.getProgress(book.id); if (p?.current_page > 1) restoredPage = p.current_page } catch {}
          pageRef.current = restoredPage
          setPage(restoredPage)
          onPageChange(restoredPage)
          const resp = await fetch(`http://127.0.0.1:5001/api/books/${book.id}/file`)
          const buffer = await resp.arrayBuffer()
          setPdfData({ data: new Uint8Array(buffer) })
          setLoading(false)
        } catch (e) {
          console.error('PDF load error:', e)
          message.error('PDF 加载失败')
          setLoading(false)
        }
      })()
    }
  }, [book])

  // DOCX: 加载全部文本并按页拆分
  const loadDocxAll = async (bid) => {
    try {
      const resp = await fetch(`http://127.0.0.1:5001/api/books/${bid}/full_text`)
      if (resp.ok) {
        const text = await resp.text()
        setDocxAllText(text)
        // 按页码标记拆分（每页约 40 行）
        const lines = text.split('\n')
        const pages = []
        for (let i = 0; i < lines.length; i += 40) {
          pages.push(lines.slice(i, i + 40).join('\n'))
        }
        setDocxPages(pages.length ? pages : [text])
        return
      }
    } catch {}
    // 回退：逐页加载
    const total = book?.total_pages || 0
    const parts = []
    for (let i = 1; i <= total; i++) {
      try {
        const r = await api.getPageContent(bid, i)
        if (r.content) parts.push(r.content)
      } catch {}
    }
    setDocxPages(parts.length ? parts : ['暂无内容'])
    setDocxAllText(parts.join('\n'))
  }

  // 监听容器宽度变化（开关目录、拖拽面板时自适应缩放）
  //
  // 必须防抖 + 设变化阈值：开/关目录时布局要经过几帧才稳定，
  // 不防抖的话每一步都会 setScale，而 scale 一变 react-pdf 就会
  // 丢弃画布重新渲染（pageKey 里含 scale），于是连闪好几下。
  // 阈值则避免宽度只差 1~2px 就触发一次全量重渲染。
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let timer = null

    const obs = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1]
      const w = Math.round(entry.contentRect.width)
      if (w <= 100) return
      if (!pdfRef.current) return

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        pdfRef.current.getPage(1).then(pageObj => {
          const vp = pageObj.getViewport({ scale: 1 })
          const fit = Math.max(0.5, Math.min(2, parseFloat((w / vp.width).toFixed(2))))
          // 差异太小就别动，不值得付一次画布重建的代价
          if (Math.abs(fit - scaleRef.current) < 0.02) return
          setScale(fit)
        }).catch(() => {})
      }, 250)
    })

    obs.observe(el)
    return () => { if (timer) clearTimeout(timer); obs.disconnect() }
  }, [])

  // PDF 加载完成
  const onLoadSuccess = useCallback(async (pdf) => {
    setNumPages(pdf.numPages)
    pdfRef.current = pdf
    // 计算容器宽度 + 自适应缩放
    if (scrollRef.current) {
      const w = Math.round(scrollRef.current.clientWidth - 32)
      if (w > 100) {
        // 自动计算缩放比例，让页面适配宽度
        try {
          const pageObj = await pdf.getPage(1)
          const vp = pageObj.getViewport({ scale: 1 })
          const fit = Math.max(0.5, Math.min(2, parseFloat((w / vp.width).toFixed(2))))
          setScale(fit)
          setRenderScale(fit)   // 首屏按当前尺寸光栅化
        } catch {}
      }
    }
  }, [])

  // 测量各页在 scale=1 下的高度。只随文档变化测一次。
  //
  // 关键：getViewport({scale}).height 与 scale 严格成正比，
  // 所以任何缩放下的真实高度 = 基准高度 × scale，纯乘法即可。
  // 原实现把这一步写在依赖 scale 的 effect 里，每次缩放都要把
  // 全部页面（实测 758 页）重新 getPage 一遍再 setState，
  // 于是开/关目录时反复触发整页重排 —— 就是闪一下抖几下的来源。
  useEffect(() => {
    if (!pdfRef.current || !numPages) return
    let cancelled = false
    ;(async () => {
      const hs = []
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return
        try {
          const p = await pdfRef.current.getPage(i)
          hs.push(p.getViewport({ scale: 1 }).height)
        } catch { hs.push(600) }
      }
      if (!cancelled) setPageBaseHeights(hs)
    })()
    return () => { cancelled = true }
  }, [numPages])

  // 偏移量由基准高度和当前缩放直接算出，不再碰 pdf 对象
  const PAGE_GAP = 12
  const { pageOffsets, totalHeight } = useMemo(() => {
    if (!pageBaseHeights.length) return { pageOffsets: [], totalHeight: 0 }
    const offs = []
    let acc = 0
    for (const h of pageBaseHeights) {
      offs.push(acc)
      acc += Math.round(h * scale) + PAGE_GAP
    }
    return { pageOffsets: offs, totalHeight: acc }
  }, [pageBaseHeights, scale])

  // 放大到超过已光栅化的分辨率时，提高渲染分辨率重画一次。
  //
  // 画布只按 renderScale 光栅化，显示再大也只是 CSS 拉伸，会糊。
  // 所以显示缩放超过渲染分辨率时要补一次真正的重绘。
  // 这只在用户主动放大时发生；开关目录那种「显示变小」的场景
  // 不会触发，所以不会闪 —— 这正是拆开两个 scale 的目的。
  useEffect(() => {
    if (scale > renderScale + 0.01) setRenderScale(scale)
  }, [scale, renderScale])

  // 恢复到上次阅读位置：换书后只做一次
  useEffect(() => {
    if (restoredRef.current) return
    if (!scrollRef.current || pageRef.current <= 1) return
    if (isText) {
      const pages = scrollRef.current.querySelectorAll('.docx-page')
      const target = pages[pageRef.current - 1]
      if (!target) return
      restoredRef.current = true
      target.scrollIntoView({ block: 'start' })
    } else if (pageOffsets.length) {
      const target = pageOffsets[pageRef.current - 1]
      if (target === undefined) return
      restoredRef.current = true
      scrollRef.current.scrollTop = target
    }
  }, [pageOffsets, isText, book])

  // 缩放变化后把滚动位置重新锚定到当前页。
  //
  // 缩放一变，每页高度跟着变、总高也变，而 scrollTop 还是旧的像素值，
  // 对应的位置就漂到别的页去了（开/关目录时会跳到很后面甚至最后一页）。
  // 所以这里必须补一次锚定。
  //
  // 但触发条件只能挂在 scale 上，不能像原来那样挂在 pageOffsets 上 ——
  // 那样每次偏移量更新都会强制回滚，和滚动过程互相打架，就成了抖动。
  const prevScaleRef = useRef(scale)
  // 必须用 useLayoutEffect：它在 DOM 提交后、浏览器绘制前同步执行。
  // 用 useEffect 的话顺序是「提交新偏移量 → 绘制（此时 scrollTop 还是旧值，
  // 对应错误的页，就是你看到的那一闪）→ 才纠正 scrollTop → 再绘制」，
  // 中间那帧错位会被真真切切画出来。用 layout effect 则纠正发生在绘制之前，
  // 错位帧根本不会上屏。
  useLayoutEffect(() => {
    if (prevScaleRef.current === scale) return
    prevScaleRef.current = scale
    if (isText || !scrollRef.current || !pageOffsets.length) return
    const target = pageOffsets[pageRef.current - 1]
    if (target !== undefined) scrollRef.current.scrollTop = target
  }, [scale, pageOffsets, isText])

  // 从滚动位置找当前页
  const findPageFromScroll = useCallback((scrollTop) => {
    const offsets = pageOffsets
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (scrollTop >= offsets[i] - 50) return i + 1  // 容忍 50px
    }
    return 1
  }, [pageOffsets])

  // 滚动到指定页
  const scrollToPage = useCallback((pageNum) => {
    if (!scrollRef.current) return
    if (isText) {
      const pages = scrollRef.current.querySelectorAll('.docx-page')
      const target = pages[pageNum - 1]
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      const offset = pageOffsets[pageNum - 1]
      if (offset !== undefined) scrollRef.current.scrollTo({ top: offset, behavior: 'smooth' })
    }
  }, [pageOffsets, isText])

  // 滚动处理
  let _scrollTimer = null
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const scrollTop = scrollRef.current.scrollTop
    setScrollPos(scrollTop)

    let currentPage = 1
    if (isText) {
      // DOCX：根据可见区域判断当前页
      const pages = scrollRef.current.querySelectorAll('.docx-page')
      for (let i = 0; i < pages.length; i++) {
        const rect = pages[i].getBoundingClientRect()
        if (rect.top < scrollRef.current.clientHeight * 0.6) {
          currentPage = i + 1
        }
      }
    } else if (pageOffsets.length) {
      // PDF：根据 pageOffsets 计算
      currentPage = findPageFromScroll(scrollTop)
    }

    if (currentPage !== pageRef.current) {
      pageRef.current = currentPage
      setPage(currentPage)
      onPageChange(currentPage)
      if (_scrollTimer) clearTimeout(_scrollTimer)
      _scrollTimer = setTimeout(() => saveProgress(currentPage), 500)
    }
  }, [pageOffsets, onPageChange, isText])

  // 选中文本 → 广播
  const handleSelect = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection()
      const text = sel?.toString()?.trim()
      if (text) {
        window.dispatchEvent(new CustomEvent('pdf-selection', { detail: text.slice(0, 3000) }))
      }
    }, 50)
  }, [])

  // 跳转（外部：书签、大纲）
  const goTo = useCallback((n) => {
    const p = Math.max(1, Math.min(n, numPages))
    scrollToPage(p)
  }, [numPages, scrollToPage])

  // 取某一页的正文。文本类书直接有分页数组，PDF 要问后端。
  const fetchPageText = useCallback(async (p) => {
    if (!book) return ''
    let raw = ''
    if (isText && docxPages[p - 1]) raw = docxPages[p - 1]
    else {
      try { raw = (await api.getPageContent(book.id, p))?.content || '' } catch { raw = '' }
    }
    // 后端已经清过页眉页脚和隐形锚点，这里只兜掉零宽字符
    return raw.replace(/[\u200b-\u200f\u2028-\u202f\ufeff]/g, '').trim()
  }, [book, isText, docxPages])

  // 念完一页后自动接着念下一页（连续朗读）
  const readPageRef = useRef(null)
  readPageRef.current = useCallback(async (p) => {
    if (!ttsVoice) {
      notification.warning({
        message: '系统里没有可用的语音',
        description: `找不到「${ttsPrefs.lang === 'zh' ? '中文' : ttsPrefs.lang}」语音，朗读无法开始。`,
        duration: 8,
      })
      return
    }
    const text = await fetchPageText(p)
    if (!text) { message.info(`第 ${p} 页没有可朗读的文字`); return }
    readingPageRef.current = p
    speech.speak(text, {
      voice: ttsVoice,
      rate: ttsPrefs.rate,
      onFinish: () => {
        if (!continuousRef.current) return
        const next = readingPageRef.current + 1
        if (next > numPages) { setContinuous(false); return }
        goTo(next)
        // 等页面滚过去、内容加载完再念，否则会和滚动打架
        setTimeout(() => readPageRef.current?.(next), 600)
      },
    })
  }, [ttsVoice, ttsPrefs, fetchPageText, speech, numPages, goTo])

  const toggleReadPage = useCallback(() => {
    if (speech.state === 'playing') return speech.pause()
    if (speech.state === 'paused') return speech.resume()
    if (!ttsSupported) { message.warning('当前环境不支持语音合成'); return }
    readPageRef.current?.(pageRef.current)
  }, [speech])

  // 离开阅读页 / 关掉这本书时停掉声音，别让它念到下一本去
  useEffect(() => () => speech.stop(), [book?.id])

  // 键盘
  useEffect(() => {
    const handler = (e) => {
      if (!numPages) return
      if (e.key === 'ArrowUp') { e.preventDefault(); scrollRef.current?.scrollBy({ top: -60, behavior: 'smooth' }) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); scrollRef.current?.scrollBy({ top: 60, behavior: 'smooth' }) }
      else if (e.key === 'PageUp') { e.preventDefault(); scrollRef.current?.scrollBy({ top: -scrollRef.current?.clientHeight * 0.8 || -400, behavior: 'smooth' }) }
      else if (e.key === 'PageDown') { e.preventDefault(); scrollRef.current?.scrollBy({ top: scrollRef.current?.clientHeight * 0.8 || 400, behavior: 'smooth' }) }
      else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        if (isText) setTextFontSize(s => Math.min(36, s + 2))
        else setScale(s => Math.min(3, s + 0.2))
      }
      else if ((e.ctrlKey || e.metaKey) && (e.key === '-')) {
        e.preventDefault()
        if (isText) setTextFontSize(s => Math.max(9, s - 2))
        else setScale(s => Math.max(0.5, s - 0.2))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [numPages, isText])

  // Ctrl+滚轮 / 手势缩放（触控板双指捏合）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e) => {
      if (!numPages && !isText) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (isText) {
          setTextFontSize(s => Math.max(9, Math.min(36, s + (e.deltaY > 0 ? -2 : 2))))
        } else {
          setScale(s => Math.max(0.5, Math.min(3, s + (e.deltaY > 0 ? -0.15 : 0.15))))
        }
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [numPages, isText])

  // 接收书签跳转事件
  useEffect(() => {
    const h = (e) => { if (e.detail) goTo(e.detail) }
    window.addEventListener('go-to-page', h)
    return () => window.removeEventListener('go-to-page', h)
  }, [goTo])

  const saveProgress = (p) => {
    if (!book) return
    try { api.updateProgress(book.id, { current_page: p, total_pages: numPages, percentage: numPages > 0 ? p / numPages : 0, scroll_position: 0 }) } catch {}
  }

  // ─── 计算可见的 PDF 页面列表（scrollPos 变化时重算）───
  const visiblePages = (() => {
    if (!pageOffsets.length || !scrollRef.current) return []
    // 缩放刚变、scrollTop 还没被上面那个 useLayoutEffect 校正的那一帧，
    // 桌面上的 scrollTop 是旧的，而 pageOffsets 已经是新的 —— 两者错配，
    // 算出来的可见页是错的。那些页挂载后 canvas 还没画好就被卸载，
    // 再接上真正该显示的那批页，中间的空档就是"闪一下"。
    // 所以这一帧改用「校正后的位置」来算。
    const scaleJustChanged = scale !== prevScaleRef.current
    const st = scaleJustChanged
      ? (pageOffsets[pageRef.current - 1] ?? scrollPos)
      : scrollRef.current.scrollTop
    const vh = scrollRef.current.clientHeight
    const start = Math.max(1, findPageFromScroll(Math.max(0, st - 600)) - 1)
    const end = Math.min(numPages, findPageFromScroll(st + vh + 600) + 1)
    const pages = []
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  })(scrollPos)  // eslint-disable-line no-unused-expressions

  // 总滚动高度 = 末页起始 + 末页估算高度

  const renderChapters = (items, indent, curPage, onGo) => {
    return items.map((ch, i) => (
      <div key={i}>
        <div className={`outline-item ${ch.page === curPage ? 'active' : ''}`}
          style={{ paddingLeft: 12 + indent * 16 }}
          onClick={() => onGo(ch.page)}>
          <span>{ch.title}</span>
        </div>
        {ch.children?.length > 0 && renderChapters(ch.children, indent + 1, curPage, onGo)}
      </div>
    ))
  }

  return (
    <>
      <div className="reader-toolbar">
        <Tooltip title="返回书库"><Button type="text" onClick={onBack}>←</Button></Tooltip>
        <span className="reader-title">{book?.title || ''}</span>
        <Tooltip title="目录"><Button type="text" disabled={!chapters.length} onClick={() => setOutlineOpen(v => !v)} style={{ color: outlineOpen ? '#409eff' : undefined }} icon={<BarsOutlined />} /></Tooltip>
        <Tooltip title="缩小"><Button type="text" disabled={!numPages} icon={<ZoomOutOutlined />} onClick={() => {
          if (isText) setTextFontSize(s => Math.max(9, s - 2))
          else setScale(s => Math.max(0.5, s - 0.2))
        }} /></Tooltip>
        <span style={{ fontSize: 12, color: '#909399', minWidth: 36, textAlign: 'center' }}>
          {isText ? Math.round(textFontSize / 15 * 100) + '%' : Math.round(scale * 100) + '%'}
        </span>
        <Tooltip title="放大"><Button type="text" disabled={!numPages} icon={<ZoomInOutlined />} onClick={() => {
          if (isText) setTextFontSize(s => Math.min(36, s + 2))
          else setScale(s => Math.min(3, s + 0.2))
        }} /></Tooltip>
        <Tooltip title="添加书签"><Button type="text" disabled={!numPages} icon={<StarOutlined />} onClick={async () => { if (!book) return; await api.addBookmark(book.id, { page_num: page }); message.success('书签已添加: 第' + page + '页'); window.dispatchEvent(new CustomEvent('refresh-bookmarks')) }} /></Tooltip>
        <Tooltip title={speech.state === 'playing' ? '暂停朗读' : speech.state === 'paused' ? '继续朗读' : '朗读本页'}>
          <Button type="text" disabled={!numPages} onClick={toggleReadPage}
                  style={{ color: speech.state !== 'idle' ? '#409eff' : undefined }}>
            {speech.state === 'playing' ? '⏸' : '🔊'}
          </Button>
        </Tooltip>
        {speech.state !== 'idle' && (
          <>
            <Tooltip title="停止朗读"><Button type="text" onClick={speech.stop}>⏹</Button></Tooltip>
            <span style={{ fontSize: 11, color: '#909399', flexShrink: 0 }}>
              {readingPageRef.current}页 {speech.index + 1}/{speech.sentences.length}句
            </span>
          </>
        )}
        <Tooltip title={continuous ? '关闭连续朗读（读完当前页会自动翻页）' : '连续朗读：读完当前页自动翻到下一页继续念'}>
          <Button type="text" onClick={() => setContinuous(v => !v)}
                  style={{ color: continuous ? '#409eff' : undefined }}>🔁</Button>
        </Tooltip>
        <Tooltip title="全屏"><Button type="text" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen() }}>⛶</Button></Tooltip>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {outlineOpen && chapters.length > 0 && (
          <>
            <div className="reader-outline" style={{ width: outlineWidth }}>
              <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#606266', borderBottom: '1px solid #e4e7ed' }}>目录</div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                {renderChapters(chapters, 0, page, goTo)}
              </div>
            </div>
            {/* 拖动调宽：与右侧面板同一个 .split-handle 样式，方向相反（右拖变宽） */}
            <div className="split-handle" title="拖动调整目录宽度"
              onMouseDown={(e) => {
                e.preventDefault()
                const startX = e.clientX
                const startW = outlineWidth
                const maxW = Math.min(420, window.innerWidth * 0.4)
                let finalW = startW
                document.body.style.userSelect = 'none'
                document.body.style.cursor = 'col-resize'
                const onMove = (ev) => {
                  finalW = Math.max(160, Math.min(maxW, startW + (ev.clientX - startX)))
                  setOutlineWidth(finalW)
                }
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                  document.body.style.userSelect = ''
                  document.body.style.cursor = ''
                  localStorage.setItem('sr_outlineWidth', finalW)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}
            />
          </>
        )}
        {/* 滚动容器 */}
        <div className="pdf-container" ref={scrollRef} onScroll={handleScroll} onMouseUp={handleSelect}>
          {loading && <div style={{ padding: 60, color: '#909399', textAlign: 'center', whiteSpace: 'nowrap' }}>📖 加载中...</div>}
          {!loading && isText && (
            <div style={{ width: '100%', maxWidth: 800, margin: '0 auto', padding: '16px 0' }}>
              {docxPages.map((pageText, idx) => (
                <div key={idx} className="docx-page" data-page={idx + 1}
                  style={{ background: '#fff', boxShadow: '0 1px 8px rgba(0,0,0,0.08)', borderRadius: 2, padding: '32px 48px', marginBottom: 12, lineHeight: 1.9, fontSize: textFontSize, color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {pageText}
                </div>
              ))}
              {!docxPages.length && (docxContent || <div style={{ padding: 60, color: '#c0c4cc', textAlign: 'center' }}>暂无内容</div>)}
            </div>
          )}
          {!loading && !isText && pdfData && (
            <Document
              file={pdfData}
              loading={<div style={{ padding: 40, color: '#909399', textAlign: 'center', whiteSpace: 'nowrap' }}>📖 正在加载文档...</div>}
              onLoadSuccess={onLoadSuccess}
              onLoadError={(e) => { console.error('PDF error:', e); message.error(`PDF加载失败`) }}
            >
              {/* 虚拟滚动：只渲染可见页 */}
              <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
                {visiblePages.map(p => (
                  <div key={p} style={{ position: 'absolute', top: pageOffsets[p - 1], left: '50%', transform: 'translateX(-50%)' }}>
                    {/* canvas 按 renderScale 光栅化，显示大小再用 CSS 缩放。
                        scale 变化（开关目录导致的宽度变化）只动这一层 transform，
                        不碰 Page 的 scale，于是画布不会重建，也就不会闪。 */}
                    <div style={{
                      transform: `scale(${scale / renderScale})`,
                      transformOrigin: 'top center',
                    }}>
                      <Page
                        pageNumber={p}
                        scale={renderScale}
                        loading={null}   /* 虚拟滚动下每滚出一页都会闪一下"加载中"，去掉 */
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Document>
          )}
        </div>
      </div>
      <div className="reader-footer">
        <Button type="text" disabled={page <= 1} onClick={() => goTo(page - 1)}>◀</Button>
        <span style={{ fontSize: 12, color: '#606266', minWidth: 90, textAlign: 'center' }}>第 {page}/{numPages} 页</span>
        <Slider min={1} max={numPages || 1} value={page} onChange={goTo} style={{ flex: 1, maxWidth: 300, margin: '0 8px' }} />
        <Button type="text" disabled={page >= numPages} onClick={() => goTo(page + 1)}>▶</Button>
        <span style={{ fontSize: 11, color: '#c0c4cc', minWidth: 36 }}>{numPages > 0 ? Math.round(page / numPages * 100) + '%' : ''}</span>
      </div>
    </>
  )
}
