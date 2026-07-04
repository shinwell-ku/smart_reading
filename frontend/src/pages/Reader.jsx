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
  const [loading, setLoading] = useState(true)
  const [pdfData, setPdfData] = useState(null)
  const viewerRef = useRef(null)
  const pageRef = useRef(page)
  pageRef.current = page
  const pdfRef = useRef(null)

  // Load PDF
  useEffect(() => {
    if (!book || book.file_type !== 'pdf') return
    setLoading(true)
    setPdfData(null)
    setPage(1)
    setNumPages(0)

    ;(async () => {
      try {
        // 恢复进度
        let restoredPage = 1
        try { const p = await api.getProgress(book.id); if (p?.current_page > 1) restoredPage = p.current_page } catch {}
        setPage(restoredPage)
        onPageChange(restoredPage)

        // 通过 fetch 获取 PDF（Uint8Array 格式）
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
  }, [book])

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
    // 监听容器尺寸变化（拖拽面板时自动缩放）
    if (viewerRef.current && !viewerRef.current._resizeObs) {
      const obs = new ResizeObserver(() => fitToWidth())
      obs.observe(viewerRef.current)
      viewerRef.current._resizeObs = obs
    }
  }, [fitToWidth])

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

  // 翻页
  const goTo = useCallback((n) => {
    const p = Math.max(1, Math.min(n, numPages))
    setPage(p)
    onPageChange(p)
    saveProgress(p)
  }, [numPages, onPageChange])

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
        setScale(s => Math.max(0.5, Math.min(3, s + (e.deltaY > 0 ? -0.15 : 0.15))))
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
  }, [numPages, goTo])

  // 键盘
  useEffect(() => {
    const handler = (e) => {
      if (!numPages) return
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goTo(pageRef.current - 1) }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(pageRef.current + 1) }
      else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setScale(s => Math.min(3, s + 0.2)) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [numPages, goTo])

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
        <Button type="text" disabled={!numPages} onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>−</Button>
        <span style={{ fontSize: 12, color: '#909399', minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <Button type="text" disabled={!numPages} onClick={() => setScale(s => Math.min(3, s + 0.2))}>+</Button>
        <Button type="text" disabled={!numPages} onClick={async () => { if (!book) return; await api.addBookmark(book.id, { page_num: page }); message.success('书签已添加: 第' + page + '页'); window.dispatchEvent(new CustomEvent('refresh-bookmarks')) }}>🔖</Button>
        <Button type="text" onClick={() => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen() }}>⛶</Button>
        </div>
      <div className="pdf-container" ref={viewerRef} onMouseUp={handleSelect}>
        {loading && <div style={{ padding: 60, color: '#909399', textAlign: 'center' }}>📖 加载中...</div>}
        {pdfData && (
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
