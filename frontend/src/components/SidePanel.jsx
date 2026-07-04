import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Select, Button, Input, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'

function cleanText(text) {
  if (!text) return ''
  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  t = t.replace(/\n{3,}/g, '\n\n')
  t = t.replace(/([^\n])\n(?=[^\n])/g, '$1 ')
  t = t.replace(/[ \t]+/g, ' ')
  t = t.replace(/[-￰-￿​-‍﻿◀▶▲▼←→↑↓↔↕♦♥♣♠•●○◆◇■□▬▲△▼▽◆◇○◎●◐◑★☆☛☚✔✗✘‰‼‽‽]/g, '')
  t = t.split('\n').map(l => l.trim()).join('\n').trim()
  return t
}

const TABS = [
  { key: 'translate', label: '翻译', icon: '🌐' },
  { key: 'notes', label: '笔记', icon: '📝' },
  { key: 'bookmarks', label: '书签', icon: '🔖' },
  { key: 'knowledge', label: '图谱', icon: '🧠' },
]

export default function SidePanel({ book, page, activeTab, onTabChange }) {
  const [sourceText, setSourceText] = useState('')
  const [resultText, setResultText] = useState('')
  const [translating, setTranslating] = useState(false)
  const [sourceLang, setSourceLang] = useState('auto')
  const [targetLang, setTargetLang] = useState('zh')
  const [notes, setNotes] = useState([])
  const [noteText, setNoteText] = useState('')
  const [noteColor, setNoteColor] = useState('#FFD700')
  const [bookmarks, setBookmarks] = useState([])
  const graphRef = useRef(null)

  useEffect(() => {
    const h = (e) => { if (e.detail) setSourceText(cleanText(e.detail.slice(0, 5000))) }
    window.addEventListener('pdf-selection', h)
    return () => window.removeEventListener('pdf-selection', h)
  }, [])

  useEffect(() => {
    if (!book) return
    api.getNotes(book.id).then(r => setNotes(r.notes || [])).catch(() => {})
    api.getBookmarks(book.id).then(r => setBookmarks(r.bookmarks || [])).catch(() => {})
    loadGraph(book.id)
  }, [book])

  useEffect(() => {
    const h = () => { if (book) api.getBookmarks(book.id).then(r => setBookmarks(r.bookmarks || [])).catch(() => {}) }
    window.addEventListener('refresh-bookmarks', h)
    return () => window.removeEventListener('refresh-bookmarks', h)
  }, [book])

  const translate = async () => {
    const t = sourceText.trim()
    if (!t) { message.info('请输入文本'); return }
    setTranslating(true)
    setResultText('⏳ 翻译中...')
    try {
      const r = await api.translate({ text: t, source_lang: sourceLang, target_lang: targetLang })
      if (r.error) { setResultText('翻译失败: ' + r.error); return }
      setResultText(r.translated_text || '翻译失败')
    } catch (e) { setResultText('翻译失败: ' + (e.message || '')) }
    setTranslating(false)
  }

  const fillPageText = async () => {
    if (!book) return
    try {
      const r = await api.getPageContent(book.id, page)
      if (r.content) setSourceText(cleanText(r.content.slice(0, 3000)))
    } catch {}
  }

  const fullTranslate = async () => {
    if (!book) return
    await api.translateFull({ book_id: book.id, target_lang: targetLang })
    message.success('全文翻译已启动')
  }

  const addNote = async () => {
    if (!book || !noteText.trim()) return
    await api.addNote(book.id, { page_num: page, content: noteText, color: noteColor })
    message.success('笔记已添加')
    setNoteText('')
    const r = await api.getNotes(book.id)
    setNotes(r.notes || [])
  }

  const deleteNote = async (id) => {
    await api.deleteNote(id)
    const r = await api.getNotes(book.id)
    setNotes(r.notes || [])
  }

  const loadGraph = async (bid) => {
    try {
      const data = await api.getKnowledgeGraph(bid)
      if (!data.nodes || !data.nodes.length) return
      const echarts = (await import('echarts')).default
      setTimeout(() => {
        if (!graphRef.current) return
        const chart = echarts.init(graphRef.current)
        chart.setOption({
          tooltip: { formatter: (p) => p.dataType === 'node' ? p.name : '' },
          series: [{ type: 'graph', layout: 'force', roam: true, draggable: true,
            data: data.nodes.map(n => ({ id: n.id, name: n.label, symbolSize: Math.max(8, 20 - n.level * 3), itemStyle: { color: ['#4263eb', '#51cf66', '#ffd43b', '#ff6b6b'][n.level] || '#748ffc' } })),
            edges: data.edges.map(e => ({ source: e.source, target: e.target, label: { show: true, formatter: e.label || '', fontSize: 9 }, lineStyle: { color: '#adb5bd', width: 1, curveness: 0.2 } })),
            force: { repulsion: 300, edgeLength: [60, 150] }, label: { show: true, position: 'right', fontSize: 10 },
          }]
        })
      }, 200)
    } catch {}
  }

  // Language options
  const langOpts = [
    { value: 'auto', label: '自动检测' }, { value: 'zh', label: '中文' }, { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' }, { value: 'ko', label: '한국어' }, { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' }, { value: 'es', label: 'Español' }, { value: 'ru', label: 'Русский' },
  ]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 面板内容（左侧） */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'translate' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div className="panel-controls">
              <Select value={sourceLang} onChange={setSourceLang} size="small" style={{ width: 100 }} options={langOpts} />
              <Button size="small" onClick={() => { const s = sourceLang; setSourceLang(targetLang); setTargetLang(s) }}>⇄</Button>
              <Select value={targetLang} onChange={setTargetLang} size="small" style={{ width: 100 }} options={langOpts.filter(o => o.value !== 'auto')} />
              <Button type="primary" size="small" onClick={translate} loading={translating}>翻译</Button>
              <Button size="small" onClick={fillPageText}>当前页</Button>
            </div>
            <Input.TextArea className="panel-textarea" value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder="选中文本后自动填充或点当前页" />
            <Input.TextArea className="panel-textarea" value={resultText} readOnly placeholder="翻译结果" />
            <Button size="small" block onClick={fullTranslate}>全文翻译</Button>
          </div>
        )}
        {activeTab === 'notes' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <Input.TextArea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="输入笔记..." />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {['#FFD700', '#FF6B6B', '#51CF66', '#339AF0', '#CC66FF'].map(c => (
                <div key={c} onClick={() => setNoteColor(c)} style={{ width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', border: noteColor === c ? '2px solid #303133' : '2px solid transparent', flexShrink: 0 }} />
              ))}
              <Button type="primary" size="small" onClick={addNote}>添加笔记</Button>
            </div>
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
              {notes.length === 0 ? <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20 }}>暂无笔记</div> : notes.map(n => (
                <div key={n.id} style={{ padding: 8, marginBottom: 6, borderRadius: 4, borderLeft: '3px solid ' + (n.color || '#ffd43b'), background: '#f5f7fa', fontSize: 12 }}>
                  <div>{n.content}</div>
                  <div style={{ fontSize: 11, color: '#909399' }}>第{n.page_num}页</div>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => deleteNote(n.id)} />
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'bookmarks' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto' }}>
              {bookmarks.length === 0 ? <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20 }}>暂无书签</div> : bookmarks.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', fontSize: 12, borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                  onClick={() => window.dispatchEvent(new CustomEvent('go-to-page', { detail: b.page_num }))}>
                  <span>第{b.page_num}页</span>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={async (e) => { e.stopPropagation(); await api.deleteBookmark(b.id); const r = await api.getBookmarks(book.id); setBookmarks(r.bookmarks || []) }} />
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'knowledge' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div ref={graphRef} className="panel-graph" style={{ flex: 1, minHeight: 150 }} />
            <Button size="small" type="primary" onClick={async () => { if (!book) return; await api.extractKnowledge(book.id); message.success('知识抽取已启动'); setTimeout(() => loadGraph(book.id), 3000) }}>生成图谱</Button>
          </div>
        )}
      </div>
      {/* 右侧竖排 tab 标签 */}
      <div style={{ width: 56, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #e4e7ed', flexShrink: 0, alignItems: 'center' }}>
        {TABS.map(tab => (
          <div key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{ padding: '10px 0', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #e4e7ed', color: tab.key === activeTab ? '#409eff' : '#909399', width: '100%', background: tab.key === activeTab ? '#f0f7ff' : 'transparent' }}>
            <div style={{ fontSize: 16 }}>{tab.icon}</div>
            <div style={{ fontSize: 10, marginTop: 2 }}>{tab.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
