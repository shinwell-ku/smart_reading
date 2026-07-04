import React, { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { Button, Slider, message } from 'antd'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/TextLayer.css'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export default function Reader({ book, onPageChange, onBack }) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [docxFontSize, setDocxFontSize] = useState(15)
  const [loading, setLoading] = useState(true)
  const [pdfData, setPdfData] = useState(null)
  const [docxContent, setDocxContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)
  const viewerRef = useRef(null)
  const pageRef = useRef(page)
  pageRef.current = page
  const pdfRef = useRef(null)

  const isDocx = book?.file_type === 'docx'
  const chapters = book?.chapters || []
  const [outlineOpen, setOutlineOpen] = useState(false)

  // Load document
  useEffect(() => {
    if (!book) return
    setLoading(true)
    setPdfData(null)
    setDocxContent('')
    setPage(1)
    setNumPages(0)

    if (isDocx) {
      // DOCX: 从 API 获取分页数据
      ;(async () => {
        try {
          // 恢复进度
          let restoredPage = 1
          try { const p = await api.getProgress(book.id); if (p?.current_page > 1) restoredPage = p.current_page } catch {}
          setPage(restoredPage)
          onPageChange(restoredPage)
          setNumPages(book.total_pages || 0)
          setLoading(false)
          // 加载第一页内容
          await loadDocxContent(restoredPage)
        } catch (e) {
          console.error('DOCX load error:', e)
          message.error('文档加载失败')
          setLoading(false)
        }
      })()
    } else {
      // PDF: 通过 fetch 获取
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

  const loadDocxContent = async (pageNum) => {
    if (!book) return
    setLoadingContent(true)
    try {
      const r = await api.getPageContent(book.id, pageNum)
      setDocxContent(r.content || '')
    } catch (e) {
      console.error('Page content load error:', e)
      setDocxContent('')
    }
    setLoadingContent(false)
  }

  const fitToWidth = useCallback(async () => {
    const pdf = pdfRef.current
    if (!pdf || !viewerRef.current) return
    try {
      const pageObj = await pdf.getPage(1)
      const vp = pageObj.getViewport({ scale: 1 })
      const containerW = viewerRef.current.clientWidth - 48
      if (containerW < 100) return
      const fitScale = containerW / vp.width
      setScale(Math.max(0.5, Math.min(2, parseFloat(fitScale.toFixed(2)))))
    } catch {}
  }, [])

  const onLoadSuccess = useCallback((pdf) => {
    setNumPages(pdf.numPages)
    pdfRef.current = pdf
    fitToWidth()
    if (viewerRef.current && !viewerRef.current._resizeObs) {
      const obs = new ResizeObserver(() => fitToWidth())
      obs.observe(viewerRef.current)
      viewerRef.current._resizeObs = obs
    }
  }, [fitToWidth])

  // 选中文本 → 广播（PDF 和 DOCX 共用）
  const handleSelect = useCallback(() => {
    setTimeout(() => {
      const sel = window.getSelection()
      const text = sel?.toString()?.trim()
      if (text) {
        window.dispatchEvent(new CustomEvent('pdf-selection', { detail: text.slice(0, 3000) }))
      }
    }, 50)
  }, [])

  // 翻页
  const goTo = useCallback((n) => {
    const p = Math.max(1, Math.min(n, numPages))
    setPage(p)
    onPageChange(p)
    saveProgress(p)
    if (isDocx) {
      loadDocxContent(p)
    }
  }, [numPages, onPageChange, isDocx, book])

  const prevPage = useCallback(() => goTo(page - 1), [page, goTo])
  const nextPage = useCallback(() => goTo(page + 1), [page, goTo, numPages])

  // 滚轮翻页（防抖 500ms）
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    let lastWheel = 0
    const handler = (e) => {
      if (!numPages) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (isDocx) {
          setDocxFontSize(s => Math.max(9, Math.min(36, s + (e.deltaY > 0 ? -2 : 2))))
        } else {
          setScale(s => Math.max(0.5, Math.min(3, s + (e.deltaY > 0 ? -0.15 : 0.15))))
        }
        return
      }
      const now = Date.now()
      if (now - lastWheel < 500) return
      lastWheel = now
      if (e.deltaY > 0 && pageRef.current < numPages) { e.preventDefault(); goTo(pageRef.current + 1) }
      else if (e.deltaY < 0 && pageRef.current > 1) { e.preventDefault(); goTo(pageRef.current - 1) }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [numPages, goTo, isDocx])

  // 监听书签跳转事件
  useEffect(() => {
    const h = (e) => { if (e.detail) goTo(e.detail) }
    window.addEventListener('go-to-page', h)
    return () => window.removeEventListener('go-to-page', h)
  }, [goTo])

  // 键盘
  useEffect(() => {
    const handler = (e) => {
      if (!numPages) return
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(pageRef.current - 1) }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(pageRef.current + 1) }
      else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        if (isDocx) setDocxFontSize(s => Math.min(36, s + 2))
        else setScale(s => Math.min(3, s + 0.2))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [numPages, goTo, isDocx])

  // 递归渲染章节树
  const renderChapters = (items, indent, curPage, onGo) => {
    return items.map((ch, i) => (
      <div key={i}>
        <div className={`outline-item ${ch.page === curPage ? 'active' : ''}`}
          style={{ paddingLeft: 12 + indent * 16 }}
          onClick={() => { setOutlineOpen(false); onGo(ch.page) }}>
          <span style={{ fontSize: 11, color: '#909399', marginRight: 4 }}>第{ch.page}页</span>
          <span>{ch.title}</span>
        </div>
        {ch.children && ch.children.length > 0 && renderChapters(ch.children, indent + 1, curPage, onGo)}
      </div>
    ))
  }

  let _saveTimer = null
  const saveProgress = (p) => {
    if (!book) return
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = setTimeout(async () => {
      try { await api.updateProgress(book.id, { current_page: p, total_pages: numPages, percentage: numPages > 0 ? p / numPages : 0, scroll_position: 0 }) } catch {}
    }, 500)
  }

  return (
    <>
      <div className="reader-toolbar">
        <Button type="text" onClick={onBack}>←</Button>
        <span className="reader-title">{book?.title || ''}</span>
        <Button type="text" disabled={!chapters.length} onClick={() => setOutlineOpen(v => !v)} style={{ color: outlineOpen ? '#409eff' : undefined }}>📑</Button>
        <Button type="text" disabled={!numPages} onClick={() => {
          if (isDocx) setDocxFontSize(s => Math.max(9, s - 2))
          else setScale(s => Math.max(0.5, s - 0.2))
        }}>−</Button>
        <span style={{ fontSize: 12, color: '#909399', minWidth: 36, textAlign: 'center' }}>
          {isDocx ? Math.round(docxFontSize / 15 * 100) + '%' : Math.round(scale * 100) + '%'}
        </span>
        <Button type="text" disabled={!numPages} onClick={() => {
          if (isDocx) setDocxFontSize(s => Math.min(36, s + 2))
          else setScale(s => Math.min(3, s + 0.2))
        }}>+</Button>
        <Button type="text" disabled={!numPages} onClick={async () => { if (!book) return; await api.addBookmark(book.id, { page_num: page }); message.success('书签已添加: 第' + page + '页'); window.dispatchEvent(new CustomEvent('refresh-bookmarks')) }}>🔖</Button>
        <Button type="text" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen() }}>⛶</Button>
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
      <div className="pdf-container" ref={viewerRef} onMouseUp={handleSelect}>
        {loading && <div style={{ padding: 60, color: '#909399', textAlign: 'center' }}>📖 加载中...</div>}
        {!loading && isDocx && (
          <div className="docx-viewer" style={{ background: '#fff', boxShadow: '0 2px 16px rgba(0,0,0,0.12)', borderRadius: 2, padding: '40px 56px', maxWidth: 800, width: '100%', margin: '0 auto', lineHeight: 1.9, fontSize: docxFontSize, color: '#000', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {loadingContent ? (
              <div style={{ padding: 60, color: '#909399', textAlign: 'center' }}>📖 加载中...</div>
            ) : (
              docxContent || <div style={{ padding: 60, color: '#c0c4cc', textAlign: 'center' }}>暂无内容</div>
            )}
          </div>
        )}
        {!loading && !isDocx && pdfData && (
          <Document
            file={pdfData}
            onLoadSuccess={onLoadSuccess}
            onLoadError={(e) => { console.error('PDF error:', e); message.error(`PDF加载失败`) }}
          >
            <Page
              pageNumber={page}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={false}
            />
          </Document>
        )}
      </div>
      </div>
      <div className="reader-footer">
        <Button type="text" disabled={page <= 1} onClick={prevPage}>◀</Button>
        <span style={{ fontSize: 12, color: '#606266', minWidth: 90, textAlign: 'center' }}>第 {page}/{numPages} 页</span>
        <Slider min={1} max={numPages || 1} value={page} onChange={goTo} style={{ flex: 1, maxWidth: 300, margin: '0 8px' }} />
        <Button type="text" disabled={page >= numPages} onClick={nextPage}>▶</Button>
        <span style={{ fontSize: 11, color: '#c0c4cc', minWidth: 36 }}>{numPages > 0 ? Math.round(page / numPages * 100) + '%' : ''}</span>
      </div>
    </>
  )
}
