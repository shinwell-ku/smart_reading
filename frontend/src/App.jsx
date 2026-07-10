import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Modal } from 'antd'
import { ApartmentOutlined, StarOutlined } from '@ant-design/icons'
import { api } from './api'
import Library from './pages/Library'
import Reader from './pages/Reader'
import SidePanel from './components/SidePanel'
import Settings from './pages/Settings'
import AboutModal from './pages/About'

export default function App() {
  const [activeTab, setActiveTab] = useState('library')
  const [currentBook, setCurrentBook] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [backendOnline, setBackendOnline] = useState(false)
  const [sideTab, setSideTab] = useState('translate')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
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
    const onBackendReady = () => { setTimeout(check, 500) } // 后端就绪后立即检测
    document.addEventListener('keydown', keydown)
    window.addEventListener('toggle-panel', togglePanel)
    window.addEventListener('backend-ready', onBackendReady)
    return () => { clearInterval(timer); document.removeEventListener('keydown', keydown); window.removeEventListener('toggle-panel', togglePanel); window.removeEventListener('backend-ready', onBackendReady) }
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
        <Button className={`topbar-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => handleMenu('library')}>📚 书库</Button>
        <Button className={`topbar-btn ${activeTab === 'reader' ? 'active' : ''}`} disabled={!currentBook} onClick={() => handleMenu('reader')}>📖 阅读</Button>
        <Button className="topbar-btn" onClick={() => handleMenu('settings')}>⚙️ 设置</Button>
        <Button className="topbar-btn" onClick={() => setAboutOpen(true)}>ℹ️ 关于</Button>
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
                    setPanelWidth(Math.max(520, Math.min(maxW, newW)));
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
                    { key: 'bookmarks', label: '书签', icon: <StarOutlined /> },
                    { key: 'knowledge', label: '图谱', icon: <ApartmentOutlined /> },
                  ].map(tab => (
                    <div key={tab.key}
                      onClick={() => { setSideTab(tab.key); setPanelCollapsed(false) }}
                      style={{ padding: '10px 0 8px', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #e4e7ed', color: tab.key === sideTab ? '#1677ff' : '#909399', width: '100%', background: tab.key === sideTab ? '#e6f4ff' : 'transparent', borderLeft: `3px solid ${tab.key === sideTab ? '#1677ff' : 'transparent'}`, transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 20 }}>{tab.icon}</div>
                      <div style={{ fontSize: 10, marginTop: 2, fontWeight: tab.key === sideTab ? 600 : 400 }}>{tab.label}</div>
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

        {/* About Modal */}
        <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </div>
    </div>
  )
}
