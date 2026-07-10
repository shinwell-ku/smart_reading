import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Select, Button, Input, message, notification } from 'antd'
import { DeleteOutlined, ApartmentOutlined, StarOutlined, SearchOutlined } from '@ant-design/icons'

function cleanText(text) {
  if (!text) return ''
  let t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  t = t.replace(/\n{3,}/g, '\n\n')
  t = t.replace(/([^\n])\n(?=[^\n])/g, '$1 ')
  t = t.replace(/[ \t]+/g, ' ')
  t = t.replace(/[-￰-￿​-‍﻿◀▶▲▼←→↑↓↔↕♦♥♣♠•●○◆◇■□▬▲△▼▽◆◇○◎●◐◑★☆☛☚✔✗✘‰‼‽‽]/g, '')
  // 去掉页眉页脚：页码、页数等信息
  t = t.replace(/第\s*\d+\s*\/\s*\d+\s*页.*?(?:\n|$)/g, '\n')
  t = t.replace(/^\s*\d+\s*\n/gm, '')
  t = t.split('\n').map(l => l.trim()).join('\n').trim()
  return t
}

const TABS = [
  { key: 'translate', label: '翻译', icon: '🌐' },
  { key: 'notes', label: '笔记', icon: '📝' },
  { key: 'bookmarks', label: '书签', icon: <StarOutlined /> },
  { key: 'search', label: '搜索', icon: <SearchOutlined /> },
  { key: 'knowledge', label: '图谱', icon: <ApartmentOutlined /> },
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
  const [editingBmId, setEditingBmId] = useState(null)
  const [editingBmTitle, setEditingBmTitle] = useState('')
  const [graphExists, setGraphExists] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [graphData, setGraphData] = useState(null)
  const [graphLayout, setGraphLayout] = useState('force')
  const [graphLabels, setGraphLabels] = useState('auto')
  const [graphEdges, setGraphEdges] = useState('all')
  const [graphRepulsion, setGraphRepulsion] = useState(400)
  const graphRef = useRef(null)
  const chartRef = useRef(null)
  const resizeObserverRef = useRef(null)
  const pollRef = useRef(null)

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

  // 切到图谱标签时自动加载（数据可能已在后台生成完毕）
  useEffect(() => {
    if (activeTab === 'knowledge' && book) loadGraph(book.id)
  }, [activeTab, book])

  // 组件卸载时清理后台轮询
  useEffect(() => {
    return () => { if (pollRef.current && typeof pollRef.current === 'number') clearInterval(pollRef.current); pollRef.current = null }
  }, [])

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
                color: ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1'][n.level] || '#bfbfbf',
                borderColor: '#fff', borderWidth: 2,
              },
              label: { show: showLabel !== undefined ? showLabel : n.level <= 2, fontSize: 11, fontWeight: n.level <= 1 ? 600 : 400 },
              description: n.description,
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
            force: { repulsion: r, edgeLength: [80, 200], gravity: layout === 'radial' ? 0.15 : 0.05 },
            label: { show: showLabel !== undefined ? showLabel : true, position: 'right', fontSize: 10, color: '#303133' },
            lineStyle: { color: '#e0e0e0' },
            emphasis: { focus: 'adjacency', lineStyle: { width: 2 } },
          }]
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
    { value: 'auto', label: '自动检测' }, { value: 'zh', label: '中文' },
    { value: 'en', label: 'English (英语)' }, { value: 'ja', label: '日本語 (日语)' },
    { value: 'ko', label: '한국어 (韩语)' }, { value: 'fr', label: 'Français (法语)' },
    { value: 'de', label: 'Deutsch (德语)' }, { value: 'es', label: 'Español (西班牙语)' },
    { value: 'ru', label: 'Русский (俄语)' }, { value: 'pt', label: 'Português (葡萄牙语)' },
    { value: 'it', label: 'Italiano (意大利语)' }, { value: 'nl', label: 'Nederlands (荷兰语)' },
    { value: 'pl', label: 'Polski (波兰语)' }, { value: 'tr', label: 'Türkçe (土耳其语)' },
    { value: 'vi', label: 'Tiếng Việt (越南语)' }, { value: 'th', label: 'ไทย (泰语)' },
    { value: 'ar', label: 'العربية (阿拉伯语)' }, { value: 'hi', label: 'हिन्दी (印地语)' },
    { value: 'mn', label: 'Монгол (蒙古语)' },
  ]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 面板内容（左侧） */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'translate' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <div className="panel-controls">
              <Select value={sourceLang} onChange={setSourceLang} size="small" style={{ width: 140 }} options={langOpts} />
              <Button size="small" onClick={() => { const s = sourceLang; const t = targetLang === 'auto' ? 'en' : targetLang; setSourceLang(t); setTargetLang(s === 'auto' ? 'en' : s) }}>⇄</Button>
              <Select value={targetLang} onChange={setTargetLang} size="small" style={{ width: 140 }} options={langOpts.filter(o => o.value !== 'auto')} />
              <Button type="primary" size="small" onClick={translate} loading={translating}>翻译</Button>
              <Button size="small" onClick={fillPageText}>当前页</Button>
              <Button size="small" onClick={() => { setSourceText(''); setResultText('') }}>清除</Button>
            </div>
            <Input.TextArea className="panel-textarea" value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder="选中文本后自动填充或点当前页" />
            <Input.TextArea className="panel-textarea" value={resultText} readOnly placeholder="翻译结果" />
          </div>
        )}
        {activeTab === 'notes' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <Input.TextArea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder="输入笔记..." />
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
                  onClick={() => { if (editingBmId !== b.id) window.dispatchEvent(new CustomEvent('go-to-page', { detail: b.page_num })) }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }} onClick={e => e.stopPropagation()}>
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
                      <span onClick={() => { setEditingBmId(b.id); setEditingBmTitle(b.title || `第${b.page_num}页`) }} style={{ color: '#303133' }}>{b.title || `第${b.page_num}页`}</span>
                    )}
                  </div>
                  <span style={{ color: '#909399', flexShrink: 0, fontSize: 11, marginRight: 4 }}>第{b.page_num}页</span>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={async (e) => { e.stopPropagation(); await api.deleteBookmark(b.id); const r = await api.getBookmarks(book.id); setBookmarks(r.bookmarks || []) }} />
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'search' && (
          <div className="panel-body" style={{ flex: 1 }}>
            <Input.Search
              placeholder="搜索当前文档..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              loading={searching}
              onSearch={async (val) => {
                if (!book || !val.trim()) return
                setSearching(true)
                try {
                  const r = await api.search(book.id, val.trim())
                  setSearchResults(r.results || [])
                } catch { message.error('搜索失败') }
                setSearching(false)
              }}
            />
            <div className="panel-scroll" style={{ flex: 1, overflowY: 'auto', marginTop: 8 }}>
              {searchResults.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 20, fontSize: 12 }}>输入关键词搜索全文</div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: '#909399', marginBottom: 6 }}>共 {searchResults.length} 条结果</div>
                  {searchResults.map((r, i) => {
                    const page = Math.ceil((r.line || i) / 40) || 1
                    return (
                      <div key={i} style={{ padding: 8, marginBottom: 6, borderRadius: 4, border: '1px solid #e4e7ed', fontSize: 12, cursor: 'pointer', background: '#fafafa' }}
                        onClick={() => window.dispatchEvent(new CustomEvent('go-to-page', { detail: page }))}>
                        <div style={{ color: '#1677ff', marginBottom: 4 }}>第{page}页 · 行{r.line || i + 1}</div>
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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingBottom: 6, flexShrink: 0 }}>
                <Select size="small" value={graphLayout} onChange={setGraphLayout}
                  style={{ width: 88 }}
                  options={[
                    { value: 'force', label: '力导向' },
                    { value: 'circular', label: '环形' },
                    { value: 'radial', label: '辐射' },
                  ]} />
                <Select size="small" value={graphLabels} onChange={setGraphLabels}
                  style={{ width: 88 }}
                  options={[
                    { value: 'auto', label: '标签少' },
                    { value: 'all', label: '标签全' },
                    { value: 'none', label: '标签隐' },
                  ]} />
                <Select size="small" value={graphEdges} onChange={setGraphEdges}
                  style={{ width: 100 }}
                  options={[
                    { value: 'all', label: '全部连线' },
                    { value: 'hierarchy', label: '仅层级' },
                    { value: 'relation', label: '仅关系' },
                  ]} />
                {graphLayout !== 'circular' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#909399' }}>疏</span>
                    <input type="range" min={100} max={800} step={50} value={graphRepulsion}
                      onChange={e => setGraphRepulsion(Number(e.target.value))}
                      style={{ width: 60, margin: 0 }} />
                    <span style={{ fontSize: 11, color: '#909399' }}>密</span>
                  </div>
                )}
                <Button size="small" danger onClick={async () => {
                  if (!book || !graphExists) return
                  await api.deleteKnowledgeGraph(book.id)
                  setGraphExists(false)
                  setGraphData(null)
                  if (chartRef.current) { chartRef.current.dispose(); chartRef.current = null }
                }}>清除</Button>
              </div>
            )}
            <div ref={graphRef} className="panel-graph" style={{ flex: 1, minHeight: 150 }}>
              {!graphExists && !pollRef.current && (
                <div style={{ textAlign: 'center', color: '#c0c4cc', padding: 40, fontSize: 13 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
                  暂无图谱数据，点击下方按钮生成
                </div>
              )}
              {pollRef.current && (
                <div style={{ textAlign: 'center', color: '#909399', padding: 40, fontSize: 13 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
                  知识抽取中，完成后右下角会通知您
                </div>
              )}
            </div>
            <Button size="small" type={pollRef.current ? 'default' : 'primary'}
              disabled={pollRef.current !== null}
              style={pollRef.current ? { color: '#c0c4cc', borderColor: '#e4e7ed' } : {}}
              onClick={() => {
                if (!book || pollRef.current) return
                pollRef.current = 'lock'
                const bid = book.id
                api.extractKnowledge(bid).then(r => {
                  message.success(r.message || '知识抽取已启动')
                  if (!pollRef.current) return
                  let attempts = 0
                  pollRef.current = setInterval(async () => {
                    attempts++
                    try {
                      const data = await api.getKnowledgeGraph(bid)
                      if (data.nodes && data.nodes.length) {
                        clearInterval(pollRef.current)
                        pollRef.current = null
                        setGraphExists(true)
                        notification.info({
                          message: '知识图谱',
                          description: '知识抽取已完成',
                          placement: 'bottomRight',
                          duration: 6,
                        })
                        if (activeTab === 'knowledge') loadGraph(bid)
                      }
                    } catch {}
                    if (attempts > 180) { clearInterval(pollRef.current); pollRef.current = null }
                  }, 10000)
                })
              }}>
              {pollRef.current ? '生成中...' : '生成图谱'}
            </Button>
          </div>
        )}
      </div>
      {/* 右侧竖排 tab 标签 */}
      <div style={{ width: 56, display: 'flex', flexDirection: 'column', background: '#fff', borderLeft: '1px solid #e4e7ed', flexShrink: 0, alignItems: 'center' }}>
        {TABS.map(tab => (
          <div key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{ padding: '12px 0 8px', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #e4e7ed', color: tab.key === activeTab ? '#1677ff' : '#909399', width: '100%', background: tab.key === activeTab ? '#e6f4ff' : 'transparent', borderLeft: `3px solid ${tab.key === activeTab ? '#1677ff' : 'transparent'}`, transition: 'all 0.15s' }}>
            <div style={{ fontSize: 20 }}>{tab.icon}</div>
            <div style={{ fontSize: 10, marginTop: 2, fontWeight: tab.key === activeTab ? 600 : 400 }}>{tab.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
