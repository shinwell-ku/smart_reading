import React, { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { Button, Slider, message, Tooltip } from 'antd'
import { BarsOutlined, StarOutlined } from '@ant-design/icons'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/TextLayer.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export default function Reader({ book, onPageChange, onBack }) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)       // 当前可见页
  const [scale, setScale] = useState(1)
  const [docxFontSize, setDocxFontSize] = useState(15)
  const [loading, setLoading] = useState(true)
  const [pdfData, setPdfData] = useState(null)
  const [docxContent, setDocxContent] = useState('')
  const [docxAllText, setDocxAllText] = useState('')  // DOCX 全文
  const [pageOffsets, setPageOffsets] = useState([])   // PDF 各页偏移量
  const scrollRef = useRef(null)
  const pageRef = useRef(page)
  pageRef.current = page
  const pdfRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const isDocx = book?.file_type === 'docx'
  const chapters = book?.chapters || []
  const [outlineOpen, setOutlineOpen] = useState(false)
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
    setPageOffsets([])

    if (isDocx) {
      ;(async () => {
        try {
          let restoredPage = 1
          try { const p = await api.getProgress(book.id); if (p?.current_page > 1) restoredPage = p.current_page } catch {}
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

  // DOCX: 加载全部文本
  const loadDocxAll = async (bid) => {
    try {
      // 尝试获取全文（后端缓存了 book_{id}_text.txt）
      const resp = await fetch(`http://127.0.0.1:5001/api/books/${bid}/full_text`)
      if (resp.ok) {
        const text = await resp.text()
        setDocxAllText(text)
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
    setDocxAllText(parts.join('\n\n---\n\n'))
  }

  // 监听容器宽度变化（面板拖拽时重算页高）
  useEffect(() => {
    if (!scrollRef.current) return
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width - 48
        if (w > 100) setContainerWidth(w)
      }
    })
    obs.observe(scrollRef.current)
    return () => obs.disconnect()
  }, [])

  // PDF 加载完成
  const onLoadSuccess = useCallback(async (pdf) => {
    setNumPages(pdf.numPages)
    pdfRef.current = pdf
    // 计算容器宽度
    if (scrollRef.current) {
      const w = scrollRef.current.clientWidth - 48
      if (w > 100) setContainerWidth(w)
    }
    // 首次自适应缩放
    if (pdf.numPages > 0) {
      try {
        const pageObj = await pdf.getPage(1)
        const vp = pageObj.getViewport({ scale: 1 })
        const containerW = scrollRef.current?.clientWidth - 48 || 800
        if (containerW > 100) {
          setScale(Math.max(0.5, Math.min(2, parseFloat((containerW / vp.width).toFixed(2)))))
        }
      } catch {}
    }
  }, [])

  // 测量各页高度（基于实际渲染宽度计算，而非 scale）
  useEffect(() => {
    if (!pdfRef.current || !numPages || !scrollRef.current) return
    const renderWidth = scrollRef.current.clientWidth - 48
    if (renderWidth < 100) return
    let cancelled = false
    ;(async () => {
      const heights = []
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return
        try {
          const p = await pdfRef.current.getPage(i)
          const vp = p.getViewport({ scale: 1 })
          // 实际渲染高度 = 页面自然比例 × 渲染宽度
          const pageHeight = vp.height * (renderWidth / vp.width)
          heights.push(pageHeight)
        } catch { heights.push(600) }
      }
      if (cancelled) return
      let accum = 8
      const offsets = heights.map(h => {
        const o = accum
        accum += h + 5  // 页间距
        return o
      })
      setPageOffsets(offsets)
    })()
    return () => { cancelled = true }
  }, [numPages, containerWidth])

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
    const offset = pageOffsets[pageNum - 1]
    if (offset !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ top: offset, behavior: 'smooth' })
    }
  }, [pageOffsets])

  // 滚动处理
  let _scrollTimer = null
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !pageOffsets.length) return
    const scrollTop = scrollRef.current.scrollTop
    setScrollPos(scrollTop)  // 触发虚拟滚动重渲染
    const currentPage = findPageFromScroll(scrollTop)
    if (currentPage !== pageRef.current) {
      pageRef.current = currentPage
      setPage(currentPage)
      onPageChange(currentPage)
      // 防抖保存进度
      if (_scrollTimer) clearTimeout(_scrollTimer)
      _scrollTimer = setTimeout(() => saveProgress(currentPage), 500)
    }
  }, [pageOffsets, onPageChange])

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
        if (isDocx) setDocxFontSize(s => Math.min(36, s + 2))
        else setScale(s => Math.min(3, s + 0.2))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [numPages, isDocx])

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
    const st = scrollRef.current.scrollTop
    const vh = scrollRef.current.clientHeight
    const start = Math.max(1, findPageFromScroll(Math.max(0, st - 600)) - 1)
    const end = Math.min(numPages, findPageFromScroll(st + vh + 600) + 1)
    const pages = []
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  })(scrollPos)  // eslint-disable-line no-unused-expressions

  // 最后一项偏移 + 页高度 + 底部边距 = 总滚动高度
  const totalHeight = (() => {
    if (!pageOffsets.length || !pdfRef.current || !scrollRef.current) return 0
    const lastH = scrollRef.current.clientHeight  // 至少一屏高
    return pageOffsets[pageOffsets.length - 1] + lastH
  })()

  const renderChapters = (items, indent, curPage, onGo) => {
    return items.map((ch, i) => (
      <div key={i}>
        <div className={`outline-item ${ch.page === curPage ? 'active' : ''}`}
          style={{ paddingLeft: 12 + indent * 16 }}
          onClick={() => onGo(ch.page)}>
          <span style={{ fontSize: 11, color: '#909399', marginRight: 4 }}>第{ch.page}页</span>
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
        <Tooltip title="缩小"><Button type="text" disabled={!numPages} onClick={() => {
          if (isDocx) setDocxFontSize(s => Math.max(9, s - 2))
          else setScale(s => Math.max(0.5, s - 0.2))
        }}>−</Button></Tooltip>
        <span style={{ fontSize: 12, color: '#909399', minWidth: 36, textAlign: 'center' }}>
          {isDocx ? Math.round(docxFontSize / 15 * 100) + '%' : Math.round(scale * 100) + '%'}
        </span>
        <Tooltip title="放大"><Button type="text" disabled={!numPages} onClick={() => {
          if (isDocx) setDocxFontSize(s => Math.min(36, s + 2))
          else setScale(s => Math.min(3, s + 0.2))
        }}>+</Button></Tooltip>
        <Tooltip title="添加书签"><Button type="text" disabled={!numPages} icon={<StarOutlined />} onClick={async () => { if (!book) return; await api.addBookmark(book.id, { page_num: page }); message.success('书签已添加: 第' + page + '页'); window.dispatchEvent(new CustomEvent('refresh-bookmarks')) }} /></Tooltip>
        <Tooltip title="全屏"><Button type="text" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen() }}>⛶</Button></Tooltip>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {outlineOpen && chapters.length > 0 && (
          <div className="reader-outline">
            <div style={{ padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#606266', borderBottom: '1px solid #e4e7ed' }}>目录</div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {renderChapters(chapters, 0, page, goTo)}
            </div>
          </div>
        )}
        {/* 滚动容器 */}
        <div className="pdf-container" ref={scrollRef} onScroll={handleScroll} onMouseUp={handleSelect}>
          {loading && <div style={{ padding: 60, color: '#909399', textAlign: 'center' }}>📖 加载中...</div>}
          {!loading && isDocx && (
            <div className="docx-viewer" style={{ background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.12)', borderRadius: 2, padding: '40px 56px', maxWidth: 800, width: '100%', margin: '0 auto', lineHeight: 1.9, fontSize: docxFontSize, color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {docxAllText ? docxAllText : (docxContent || <div style={{ padding: 60, color: '#c0c4cc', textAlign: 'center' }}>暂无内容</div>)}
            </div>
          )}
          {!loading && !isDocx && pdfData && (
            <Document
              file={pdfData}
              onLoadSuccess={onLoadSuccess}
              onLoadError={(e) => { console.error('PDF error:', e); message.error(`PDF加载失败`) }}
            >
              {/* 虚拟滚动：只渲染可见页 */}
              <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
                {visiblePages.map(p => (
                  <div key={p} style={{ position: 'absolute', top: pageOffsets[p - 1], left: '50%', transform: 'translateX(-50%)' }}>
                    <Page
                      pageNumber={p}
                      scale={scale}
                      width={containerWidth || undefined}
                      renderTextLayer={true}
                      renderAnnotationLayer={false}
                    />
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
