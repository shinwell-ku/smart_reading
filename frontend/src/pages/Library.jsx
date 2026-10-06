import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Input, Button, message, Modal, Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { CloudUploadOutlined } from '@ant-design/icons'

export default function Library({ onOpenBook }) {
  const [books, setBooks] = useState([])
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 此时后端已就绪（主进程等待后端启动后才加载界面）
    setLoading(true)
    api.listBooks().then(r => {
      setBooks(r.books || [])
      setLoading(false)
    }).catch(() => setLoading(false))
    // 后端就绪事件触发刷新（兜底）
    const onReady = () => { api.listBooks().then(r => setBooks(r.books || [])).catch(() => {}) }
    window.addEventListener('backend-ready', onReady)
    return () => window.removeEventListener('backend-ready', onReady)
  }, [])

  const loadBooks = async () => {
    try { const r = await api.listBooks(); setBooks(r.books || []) } catch {}
  }

  const filtered = search ? books.filter(b => b.title.toLowerCase().includes(search.toLowerCase())) : books
  const canReorder = !search && filtered.length > 1

  const handleImport = async () => {
    if (importing) return
    setImporting(true)
    try {
      const result = await window.electronAPI.openFileDialog({})
      if (result.canceled || !result.filePaths.length) return

      const hide = message.loading('正在导入...', 0)
      let success = 0, fail = 0
      const dupes = []        // 同名文档，先攒着，回头统一问用户

      for (const fp of result.filePaths) {
        try {
          const r = await api.importBookByPath(fp)
          if (r.code === 'DUPLICATE_NAME') {
            dupes.push({ fp, name: fp.split(/[\\/]/).pop(), title: r.existing_title })
          } else if (r.error) fail++
          else success++
        } catch { fail++ }
      }
      hide()
      if (success) message.success(`导入成功 ${success} 本`)
      if (fail) message.warning(`${fail} 本失败`)
      await loadBooks()

      if (dupes.length) askAboutDuplicates(dupes)
    } catch {
      message.error('导入异常')
    } finally {
      setImporting(false)
    }
  }

  // 同名文档由用户决定是否仍然导入
  const askAboutDuplicates = (dupes) => {
    Modal.confirm({
      title: `有 ${dupes.length} 个同名文档`,
      width: 460,
      content: (
        <div style={{ fontSize: 12, lineHeight: 1.9 }}>
          <div style={{ color: '#909399', marginBottom: 6 }}>书库中已存在以下文档：</div>
          {dupes.map(d => (
            <div key={d.fp} style={{ wordBreak: 'break-all' }}>
              • {d.name}
              <span style={{ color: '#909399' }}>（已有《{d.title}》）</span>
            </div>
          ))}
          <div style={{ marginTop: 8, color: '#fa8c16' }}>
            仍然导入会在书库中多出一条重复记录，并多占一份磁盘空间。
          </div>
        </div>
      ),
      okText: '仍然导入', cancelText: '跳过',
      onOk: async () => {
        const hide = message.loading('正在导入...', 0)
        let ok = 0
        for (const d of dupes) {
          try { const r = await api.importBookByPath(d.fp, true); if (!r.error) ok++ } catch {}
        }
        hide()
        if (ok) message.success(`又导入 ${ok} 本`)
        await loadBooks()
      },
    })
  }

  // ─── 拖动排序 ───
  const dragFrom = useRef(null)
  const [draggingId, setDraggingId] = useState(null)

  const onDragStart = (e, index, id) => {
    dragFrom.current = index
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))   // Firefox 需要有数据才会触发 drag
  }

  const onDragOver = (e, index) => {
    e.preventDefault()
    const from = dragFrom.current
    if (from === null || from === index) return
    // 实时交换，拖动过程中就能看到最终位置
    const next = [...books]
    const [moved] = next.splice(from, 1)
    next.splice(index, 0, moved)
    dragFrom.current = index
    setBooks(next)
  }

  const onDragEnd = async () => {
    setDraggingId(null)
    if (dragFrom.current === null) return
    dragFrom.current = null
    try { await api.reorderBooks(books.map(b => b.id)) } catch { message.error('排序保存失败') }
  }

  const handleDelete = (id, title) => {
    Modal.confirm({
      title: `确定删除《${title}》？`,
      content: '所有笔记和进度也将被删除',
      okText: '确定', cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteBook(id)
        message.success('已删除')
        await loadBooks()
      }
    })
  }

  return (
    <>
      <div className="lib-header">
        <h2>我的书库</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input.Search placeholder="搜索书籍..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} size="small" />
          <Button type="primary" size="small" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing}>导入书籍</Button>
        </div>
      </div>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#909399', flexDirection: 'column', gap: 8 }}>
          <Spin size="large" />
          <p style={{ marginTop: 12 }}>正在加载书库...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="book-grid">
          {filtered.map((b, index) => (
            <div key={b.id}
              className={'book-card' + (draggingId === b.id ? ' dragging' : '')}
              onClick={() => onOpenBook(b)}
              // 搜索时列表是子集，拖动排序会错位，所以只在完整列表下允许拖
              draggable={canReorder}
              onDragStart={canReorder ? (e) => onDragStart(e, index, b.id) : undefined}
              onDragOver={canReorder ? (e) => onDragOver(e, index) : undefined}
              onDragEnd={canReorder ? onDragEnd : undefined}
              onDrop={e => e.preventDefault()}
            >
              <div className={`book-cover ${b.file_type}`}>
                <img src={api.getCoverUrl(b.id)} className="cover-img" alt="" onError={e => e.target.style.display = 'none'} />
              </div>
              <div className="book-del-btn">
                <Button type="text" size="small" danger onClick={e => { e.stopPropagation(); handleDelete(b.id, b.title) }}>✕</Button>
              </div>
              <div className="book-info">
                <div className="book-title" title={b.title}>{b.title}</div>
                <div className="book-meta">{b.file_type.toUpperCase()} · {b.total_pages || 0}页</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#909399', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 48 }}>📚</div>
          <p>点击「导入书籍」添加 PDF / Word / Markdown 等文档</p>
        </div>
      )}
    </>
  )
}
