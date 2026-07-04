import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from 'antd'
import { api } from './api'
import Library from './pages/Library'
import Reader from './pages/Reader'
import SidePanel from './components/SidePanel'
import Settings from './pages/Settings'
import About from './pages/About'

const TABS = { library: 'library', reader: 'reader', settings: 'settings', about: 'about' }

export default function App() {
  const [activeTab, setActiveTab] = useState('library')
  const [currentBook, setCurrentBook] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [backendOnline, setBackendOnline] = useState(false)
  const [sideTab, setSideTab] = useState('translate')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [panelWidth, setPanelWidth] = useState(520)
  const panelRef = useRef(null)
  const dragRef = useRef(null)

  useEffect(() => {
    const check = () => {
      api.checkHealth().then(r => setBackendOnline(r.status === 'ok')).catch(() => setBackendOnline(false))
    }
    check()
    const timer = setInterval(check, 5000)
    const keydown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); location.reload() } }
    const togglePanel = () => setPanelCollapsed(v => !v)
    document.addEventListener('keydown', keydown)
    window.addEventListener('toggle-panel', togglePanel)
    return () => { clearInterval(timer); document.removeEventListener('keydown', keydown); window.removeEventListener('toggle-panel', togglePanel) }
  }, [])

  const openBook = useCallback((book) => {
    setCurrentBook(book)
    setCurrentPage(1)
    setSideTab('translate')
    setActiveTab('reader')
  }, [])

  const goBack = useCallback(() => {
    setCurrentBook(null)
    setActiveTab('library')
  }, [])

  const handleMenu = (tab) => {
    if (tab === 'reader' && !currentBook) return
    if (['translate', 'notes', 'bookmarks', 'knowledge'].includes(tab)) {
      if (!currentBook) return
      setActiveTab('reader')
      setSideTab(tab)
      return
    }
    if (tab === 'library') setCurrentBook(null)
    setActiveTab(tab)
  }

  const handlePageChange = useCallback((pn) => {
    setCurrentPage(pn)
  }, [])

  return (
    <div className="app">
      {/* TopBar */}
      <div className="topbar">
        <div className="topbar-logo">
          <img src="./logo.png" alt="" /> AI智慧阅读
        </div>
        <button className={`topbar-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => handleMenu('library')}>📚 书库</button>
        <button className={`topbar-btn ${activeTab === 'reader' ? 'active' : ''}`} disabled={!currentBook} onClick={() => handleMenu('reader')}>📖 阅读</button>
        <button className="topbar-btn" onClick={() => handleMenu('settings')}>⚙️ 设置</button>
        <button className="topbar-btn" onClick={() => handleMenu('about')}>ℹ️ 关于</button>
        <div className="topbar-spacer" />
        <div className="topbar-status">
          <span className={`status-dot ${backendOnline ? 'online' : 'offline'}`} />
          {backendOnline ? '服务已就绪' : '服务离线'}
        </div>
      </div>

      {/* Main */}
      <div className="main">
        {/* Library */}
        {activeTab === 'library' && (
          <div className="full-view">
            <Library onOpenBook={openBook} />
          </div>
        )}

        {/* Reader + SidePanel */}
        {(activeTab === 'reader') && currentBook && (
          <div className="split-view">
            <div className="split-left" style={{ width: panelCollapsed ? 'calc(100% - 56px)' : `calc(100% - ${panelWidth}px)` }}>
              <Reader book={currentBook} onPageChange={handlePageChange} onBack={goBack} />
            </div>
            {!panelCollapsed && (
              <div className="split-handle"
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startW = panelWidth;
                  const onMove = (ev) => {
                    const newW = startW - (ev.clientX - startX);
                    const maxW = window.innerWidth / 2;
                    setPanelWidth(Math.max(280, Math.min(maxW, newW)));
                  };
                  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              />
            )}
            <div className={'split-right' + (panelCollapsed ? ' collapsed' : '')} style={{ width: panelCollapsed ? 0 : panelWidth, position: 'relative', background: '#fff' }}>
              {!panelCollapsed && (
                <div className="reader-toolbar" style={{ justifyContent: 'space-between' }}>
                  <span className="reader-title">工具</span>
                  <Button type="text" onClick={() => setPanelCollapsed(true)} title="折叠右侧面板">»</Button>
                </div>
              )}
              <SidePanel ref={panelRef} book={currentBook} page={currentPage} activeTab={sideTab} onTabChange={setSideTab} />
            </div>
            {/* 折叠时：独立工具栏 + 下方标签 */}
            {panelCollapsed && (
              <div style={{ width: 56, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e4e7ed', background: '#fff' }}>
                <div className="reader-toolbar" style={{ justifyContent: 'center', borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
                  <Button type="text" onClick={() => setPanelCollapsed(false)} title="展开" style={{ color: '#909399' }}>«</Button>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {[
                    { key: 'translate', label: '翻译', icon: '🌐' },
                    { key: 'notes', label: '笔记', icon: '📝' },
                    { key: 'bookmarks', label: '书签', icon: '🔖' },
                    { key: 'knowledge', label: '图谱', icon: '🧠' },
                  ].map(tab => (
                    <div key={tab.key}
                      onClick={() => { setSideTab(tab.key); setPanelCollapsed(false) }}
                      style={{ padding: '8px 0', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #e4e7ed', color: tab.key === sideTab ? '#409eff' : '#909399', width: '100%' }}>
                      <div style={{ fontSize: 16 }}>{tab.icon}</div>
                      <div style={{ fontSize: 10 }}>{tab.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="full-view">
            <Settings />
          </div>
        )}

        {/* About */}
        {activeTab === 'about' && (
          <div className="full-view">
            <About />
          </div>
        )}
      </div>
    </div>
  )
}
