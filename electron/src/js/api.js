/**
 * AI智慧阅读 - API 客户端层
 * 封装对 Python 后端的所有 HTTP 调用
 */

const API_BASE = 'http://127.0.0.1:5001';

const api = {
  // ─── 健康检查 ───
  async checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (!res.ok) return { status: 'error' };
      return await res.json();
    } catch {
      return { status: 'error' };
    }
  },

  // ─── 书籍管理 ───
  async importBook(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/books/import`, {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async listBooks() {
    const res = await fetch(`${API_BASE}/api/books`);
    return res.json();
  },

  async getBook(bookId) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`);
    return res.json();
  },

  async deleteBook(bookId) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}`, { method: 'DELETE' });
    return res.json();
  },

  getCoverUrl(bookId) {
    return `${API_BASE}/api/books/${bookId}/cover`;
  },

  async importBookByPath(filePath) {
    const res = await fetch(`${API_BASE}/api/books/import_by_path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath })
    });
    return res.json();
  },

  async getPageContent(bookId, pageNum) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}/page/${pageNum}`);
    return res.json();
  },

  // ─── 阅读进度 ───
  async getProgress(bookId) {
    const res = await fetch(`${API_BASE}/api/progress/${bookId}`);
    return res.json();
  },

  async updateProgress(bookId, data) {
    const res = await fetch(`${API_BASE}/api/progress/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // ─── 笔记 ───
  async getNotes(bookId) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}/notes`);
    return res.json();
  },

  async addNote(bookId, data) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteNote(noteId) {
    const res = await fetch(`${API_BASE}/api/notes/${noteId}`, { method: 'DELETE' });
    return res.json();
  },

  // ─── 书签 ───
  async getBookmarks(bookId) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}/bookmarks`);
    return res.json();
  },

  async addBookmark(bookId, data) {
    const res = await fetch(`${API_BASE}/api/books/${bookId}/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteBookmark(bookmarkId) {
    const res = await fetch(`${API_BASE}/api/bookmarks/${bookmarkId}`, { method: 'DELETE' });
    return res.json();
  },

  // ─── 翻译 ───
  async translate(data) {
    const res = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async translateFull(data) {
    const res = await fetch(`${API_BASE}/api/translate/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async getTranslationStatus(bookId) {
    const res = await fetch(`${API_BASE}/api/translate/status/${bookId}`);
    return res.json();
  },

  // ─── 生词 ───
  async saveWord(data) {
    const res = await fetch(`${API_BASE}/api/translate/words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async getWords(bookId) {
    const res = await fetch(`${API_BASE}/api/translate/words/${bookId}`);
    return res.json();
  },

  // ─── 知识抽取 ───
  async extractKnowledge(bookId) {
    const res = await fetch(`${API_BASE}/api/knowledge/extract/${bookId}`, {
      method: 'POST'
    });
    return res.json();
  },

  async getKnowledgeGraph(bookId) {
    const res = await fetch(`${API_BASE}/api/knowledge/graph/${bookId}`);
    return res.json();
  },

  async updateKnowledgeGraph(bookId, data) {
    const res = await fetch(`${API_BASE}/api/knowledge/graph/${bookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async exportKnowledge(bookId, format) {
    const res = await fetch(`${API_BASE}/api/knowledge/export/${bookId}?format=${format}`);
    return res.blob();
  },

  // ─── 搜索 ───
  async search(bookId, keyword) {
    const res = await fetch(`${API_BASE}/api/search/${bookId}?q=${encodeURIComponent(keyword)}`);
    return res.json();
  },

  // ─── 数据管理 ───
  async backup() {
    const res = await fetch(`${API_BASE}/api/backup`, { method: 'POST' });
    return res.json();
  },

  async clearAllData() {
    const res = await fetch(`${API_BASE}/api/data/clear`, { method: 'POST' });
    return res.json();
  }
};
