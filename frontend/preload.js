/**
 * AI智慧阅读 - Preload 脚本
 * 安全桥接 Electron API 到渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

// 后端 API 基础地址
const API_BASE = 'http://127.0.0.1:5001';

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── 文件操作 ───
  openFileDialog: (options) => ipcRenderer.invoke('dialog:openFile', options),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, data) => ipcRenderer.invoke('file:write', path, data),
  getFileInfo: (path) => ipcRenderer.invoke('file:stat', path),
  copyToBooks: (sourcePath) => ipcRenderer.invoke('file:copyToBooks', sourcePath),
  getBooksDir: () => ipcRenderer.invoke('app:getBooksDir'),
  getDataDir: () => ipcRenderer.invoke('app:getDataDir'),

  // ─── 后端 API 代理 ───
  api: {
    // 健康检查
    health: () => fetch(`${API_BASE}/api/health`).then(r => r.json()),

    // 书籍管理
    importBook: async (filePath) => {
      const formData = new FormData();
      const response = await fetch(`file://${filePath}`);
      const blob = await response.blob();
      const file = new File([blob], filePath.split('/').pop() || filePath.split('\\').pop());
      formData.append('file', file);
      return fetch(`${API_BASE}/api/books/import`, {
        method: 'POST',
        body: formData
      }).then(r => r.json());
    },

    importBookFromBuffer: async (fileBuffer, fileName) => {
      const formData = new FormData();
      const blob = new Blob([fileBuffer]);
      const file = new File([blob], fileName);
      formData.append('file', file);
      return fetch(`${API_BASE}/api/books/import`, {
        method: 'POST',
        body: formData
      }).then(r => r.json());
    },

    listBooks: () => fetch(`${API_BASE}/api/books`).then(r => r.json()),
    getBook: (id) => fetch(`${API_BASE}/api/books/${id}`).then(r => r.json()),
    deleteBook: (id) => fetch(`${API_BASE}/api/books/${id}`, { method: 'DELETE' }).then(r => r.json()),
    getPageContent: (bookId, pageNum) => fetch(`${API_BASE}/api/books/${bookId}/page/${pageNum}`).then(r => r.json()),

    // 阅读进度
    getProgress: (bookId) => fetch(`${API_BASE}/api/progress/${bookId}`).then(r => r.json()),
    updateProgress: (bookId, data) => fetch(`${API_BASE}/api/progress/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    // 笔记
    getNotes: (bookId) => fetch(`${API_BASE}/api/books/${bookId}/notes`).then(r => r.json()),
    addNote: (bookId, data) => fetch(`${API_BASE}/api/books/${bookId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteNote: (noteId) => fetch(`${API_BASE}/api/notes/${noteId}`, { method: 'DELETE' }).then(r => r.json()),

    // 书签
    getBookmarks: (bookId) => fetch(`${API_BASE}/api/books/${bookId}/bookmarks`).then(r => r.json()),
    addBookmark: (bookId, data) => fetch(`${API_BASE}/api/books/${bookId}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
    deleteBookmark: (bookmarkId) => fetch(`${API_BASE}/api/bookmarks/${bookmarkId}`, { method: 'DELETE' }).then(r => r.json()),

    // 翻译
    translate: (data) => fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    translateFull: (data) => fetch(`${API_BASE}/api/translate/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    getTranslationStatus: (bookId) => fetch(`${API_BASE}/api/translate/status/${bookId}`).then(r => r.json()),

    // 生词/摘录
    saveWord: (data) => fetch(`${API_BASE}/api/translate/words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
    getWords: (bookId) => fetch(`${API_BASE}/api/translate/words/${bookId}`).then(r => r.json()),

    // 知识抽取
    extractKnowledge: (bookId) => fetch(`${API_BASE}/api/knowledge/extract/${bookId}`, { method: 'POST' }).then(r => r.json()),
    getKnowledgeGraph: (bookId) => fetch(`${API_BASE}/api/knowledge/graph/${bookId}`).then(r => r.json()),
    updateKnowledgeGraph: (bookId, data) => fetch(`${API_BASE}/api/knowledge/graph/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),

    exportKnowledge: (bookId, format) => fetch(`${API_BASE}/api/knowledge/export/${bookId}?format=${format}`).then(r => r.blob()),

    // 搜索
    search: (bookId, keyword) => fetch(`${API_BASE}/api/search/${bookId}?q=${encodeURIComponent(keyword)}`).then(r => r.json()),

    // 数据管理
    backup: () => fetch(`${API_BASE}/api/backup`, { method: 'POST' }).then(r => r.json()),
    clearAllData: () => fetch(`${API_BASE}/api/data/clear`, { method: 'POST' }).then(r => r.json()),
  }
});
