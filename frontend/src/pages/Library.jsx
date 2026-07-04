import React, { useState, useEffect } from 'react'
import { api } from '../api'
import { Input, Button, message, Modal, Spin } from 'antd'
import { CloudUploadOutlined } from '@ant-design/icons'

export default function Library({ onOpenBook }) {
  const [books, setBooks] = useState([])
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => { loadBooks() }, [])

  const loadBooks = async () => {
    try { const r = await api.listBooks(); setBooks(r.books || []) } catch {}
  }

  const filtered = search ? books.filter(b => b.title.toLowerCase().includes(search.toLowerCase())) : books

  const handleImport = async () => {
    if (importing) return
    setImporting(true)
    try {
      const result = await window.electronAPI.openFileDialog({})
      if (result.canceled || !result.filePaths.length) { setImporting(false); return }
      const hide = message.loading('正在导入...', 0)
      let success = 0, fail = 0
      for (const fp of result.filePaths) {
        try {
          const r = await api.importBookByPath(fp)
          if (r.error) fail++; else success++
        } catch { fail++ }
      }
      hide()
      if (success) message.success(`导入成功 ${success} 本`)
      if (fail) message.warning(`${fail} 本失败`)
      await loadBooks()
    } catch { message.error('导入异常') }
    setImporting(false)
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
      {filtered.length > 0 ? (
        <div className="book-grid">
          {filtered.map(b => (
            <div key={b.id} className="book-card" onClick={() => onOpenBook(b)}>
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
          <p>点击「导入书籍」添加电子书</p>
        </div>
      )}
    </>
  )
}
