import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button, Modal } from 'antd'
import { api } from './api'
import Library from './pages/Library'
import Reader from './pages/Reader'
import SidePanel from './components/SidePanel'
import Settings from './pages/Settings'
import AboutModal from './pages/About'
import { SIDE_TABS, SIDE_TAB_KEYS } from './sideTabs'
import { useI18n } from './i18n'

export default function App() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState('library')
  const [currentBook, setCurrentBook] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [backendOnline, setBackendOnline] = useState(false)
  const [sideTab, setSideTab] = useState('translate')
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState(520)
  const panelRef = useRef(null)
  const dragRef = useRef(null)

  // 护眼模式：启动时按上次设置恢复（设置页切换时会直接改 body class）
  useEffect(() => {
    document.body.classList.toggle('eye-care', localStorage.getItem('sr_eyeCare') === 'true')
  }, [])

  useEffect(() => {
    const check = () => {
      api.checkHealth().then(r => setBackendOnline(r.status === 'ok')).catch(() => setBackendOnline(false))
    }
    check()
    const timer = setInterval(check, 5000)
    const keydown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); location.reload() } }
    const togglePanel = () => setPanelCollapsed(v => !v)
    const onBackendReady = () => { setTimeout(check, 500) } // 后端就绪后立即检测
    const openSettings = () => setSettingsOpen(true)        // 侧边栏「去设置」入口
    document.addEventListener('keydown', keydown)
    window.addEventListener('toggle-panel', togglePanel)
    window.addEventListener('backend-ready', onBackendReady)
    window.addEventListener('open-settings', openSettings)
    return () => { clearInterval(timer); document.removeEventListener('keydown', keydown); window.removeEventListener('toggle-panel', togglePanel); window.removeEventListener('backend-ready', onBackendReady); window.removeEventListener('open-settings', openSettings) }
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
    if (SIDE_TAB_KEYS.includes(tab)) {
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
          <img src="./logo.png" alt="" /> {t('app.title')}
        </div>
        <Button className={`topbar-btn ${activeTab === 'library' ? 'active' : ''}`} onClick={() => handleMenu('library')}>📚 {t('app.menu.library')}</Button>
        <Button className={`topbar-btn ${activeTab === 'reader' ? 'active' : ''}`} disabled={!currentBook} onClick={() => handleMenu('reader')}>📖 {t('app.menu.reader')}</Button>
        <Button className="topbar-btn" onClick={() => setSettingsOpen(true)}>⚙️ {t('app.menu.settings')}</Button>
        <Button className="topbar-btn" onClick={() => setAboutOpen(true)}>ℹ️ {t('app.menu.about')}</Button>
        <div className="topbar-spacer" />
        <div className="topbar-status">
          <span className={`status-dot ${backendOnline ? 'online' : 'offline'}`} />
          {backendOnline ? t('app.status.online') : t('app.status.offline')}
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
            <div className={'split-right' + (panelCollapsed ? ' collapsed' : '')} style={{ width: panelCollapsed ? 0 : panelWidth, position: 'relative' }}>
              {!panelCollapsed && (
                <div className="reader-toolbar" style={{ justifyContent: 'space-between' }}>
                  <span className="reader-title">{t('app.panel.tools')}</span>
                  <Button type="text" onClick={() => setPanelCollapsed(true)} title={t('app.panel.collapse')}>»</Button>
                </div>
              )}
              <SidePanel ref={panelRef} book={currentBook} page={currentPage} activeTab={sideTab} onTabChange={setSideTab} />
            </div>
            {/* 折叠时：独立工具栏 + 下方标签 */}
            {panelCollapsed && (
              <div className="tab-rail" style={{ width: 56, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e4e7ed' }}>
                <div className="reader-toolbar" style={{ justifyContent: 'center', borderBottom: '1px solid #e4e7ed', flexShrink: 0 }}>
                  <Button type="text" onClick={() => setPanelCollapsed(false)} title={t('app.panel.expand')} style={{ color: '#909399' }}>«</Button>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {SIDE_TABS.map(tab => (
                    <div key={tab.key}
                      onClick={() => { setSideTab(tab.key); setPanelCollapsed(false) }}
                      style={{ padding: '10px 0 8px', textAlign: 'center', cursor: 'pointer', borderBottom: '1px solid #e4e7ed', color: tab.key === sideTab ? '#1677ff' : '#909399', width: '100%', background: tab.key === sideTab ? '#e6f4ff' : 'transparent', borderLeft: `3px solid ${tab.key === sideTab ? '#1677ff' : 'transparent'}`, transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 20 }}>{tab.icon}</div>
                      <div style={{ fontSize: 10, marginTop: 2, fontWeight: tab.key === sideTab ? 600 : 400 }}>{t(tab.i18n)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* About Modal */}
        <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
        {/* Settings Modal */}
        <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </div>
  )
}
