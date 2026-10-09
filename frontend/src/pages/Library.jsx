import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { useI18n } from '../i18n'
import { Input, Button, message, Modal, Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { CloudUploadOutlined } from '@ant-design/icons'

export default function Library({ onOpenBook }) {
  const { t } = useI18n()
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
      // 以前传的是空对象，对话框的标题和过滤器名全部吃 main.js 里的
      // 写死中文 —— 英文界面下就露馅了。这里把 options 传全。
      const result = await window.electronAPI.openFileDialog({
        title: t('library.dialogTitle'),
        filters: [
          { name: t('library.filterDocs'), extensions: ['pdf', 'docx', 'txt', 'md', 'markdown', 'html', 'htm'] },
          { name: 'PDF', extensions: ['pdf'] },
          { name: 'Word', extensions: ['docx'] },
          { name: 'Text / Markdown', extensions: ['txt', 'md', 'markdown'] },
          { name: 'HTML', extensions: ['html', 'htm'] },
          { name: t('library.dialogAll'), extensions: ['*'] },
        ],
      })
      if (result.canceled || !result.filePaths.length) return

      const hide = message.loading(t('library.importing'), 0)
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
      if (success) message.success(t('library.importedOk', { count: success }))
      if (fail) message.warning(t('library.importedFail', { count: fail }))
      await loadBooks()

      if (dupes.length) askAboutDuplicates(dupes)
    } catch {
      message.error(t('library.importError'))
    } finally {
      setImporting(false)
    }
  }

  // 同名文档由用户决定是否仍然导入
  const askAboutDuplicates = (dupes) => {
    Modal.confirm({
      title: t('library.dupTitle', { count: dupes.length }),
      width: 460,
      content: (
        <div style={{ fontSize: 12, lineHeight: 1.9 }}>
          <div style={{ color: '#909399', marginBottom: 6 }}>{t('library.dupIntro')}</div>
          {dupes.map(d => (
            <div key={d.fp} style={{ wordBreak: 'break-all' }}>
              • {d.name}
              <span style={{ color: '#909399' }}>{t('library.dupExisting', { title: d.title })}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, color: '#fa8c16' }}>
            {t('library.dupWarn')}
          </div>
        </div>
      ),
      okText: t('library.dupOk'), cancelText: t('library.dupSkip'),
      onOk: async () => {
        const hide = message.loading(t('library.importing'), 0)
        let ok = 0
        for (const d of dupes) {
          try { const r = await api.importBookByPath(d.fp, true); if (!r.error) ok++ } catch {}
        }
        hide()
        if (ok) message.success(t('library.importedMore', { count: ok }))
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
    try { await api.reorderBooks(books.map(b => b.id)) } catch { message.error(t('library.reorderFailed')) }
  }

  const handleDelete = (id, title) => {
    Modal.confirm({
      title: t('library.deleteTitle', { title }),
      content: t('library.deleteBody'),
      okText: t('common.ok'), cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteBook(id)
        message.success(t('library.deleted'))
        await loadBooks()
      }
    })
  }

  return (
    <>
      <div className="lib-header">
        <h2>{t('library.title')}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input.Search placeholder={t('library.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} size="small" />
          <Button type="primary" size="small" icon={<CloudUploadOutlined />} onClick={handleImport} loading={importing}>{t('library.import')}</Button>
        </div>
      </div>
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#909399', flexDirection: 'column', gap: 8 }}>
          <Spin size="large" />
          <p style={{ marginTop: 12 }}>{t('library.loading')}</p>
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
                <div className="book-meta">{b.file_type.toUpperCase()} · {t('library.pages', { count: b.total_pages || 0 })}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#909399', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 48 }}>📚</div>
          <p>{t('library.empty')}</p>
        </div>
      )}
    </>
  )
}
