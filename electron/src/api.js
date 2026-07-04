const API_BASE = 'http://127.0.0.1:5001'

async function req(method, path, body) {
  const opts = { method, headers: {} }
  if (body) {
    if (body instanceof FormData) { opts.body = body }
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  }
  const r = await fetch(`${API_BASE}${path}`, opts)
  return r.json()
}

export const api = {
  base: API_BASE,

  // Health
  checkHealth: () => req('GET', '/api/health'),

  // Books
  listBooks: () => req('GET', '/api/books'),
  getBook: (id) => req('GET', `/api/books/${id}`),
  deleteBook: (id) => req('DELETE', `/api/books/${id}`),
  getPageContent: (bid, pn) => req('GET', `/api/books/${bid}/page/${pn}`),
  getCoverUrl: (bid) => `${API_BASE}/api/books/${bid}/cover`,
  importBookByPath: (path) => req('POST', '/api/books/import_by_path', { path }),
  getBookFile: (bid) => `${API_BASE}/api/books/${bid}/file`,

  // Progress
  getProgress: (bid) => req('GET', `/api/progress/${bid}`),
  updateProgress: (bid, data) => req('PUT', `/api/progress/${bid}`, data),

  // Notes
  getNotes: (bid) => req('GET', `/api/books/${bid}/notes`),
  addNote: (bid, data) => req('POST', `/api/books/${bid}/notes`, data),
  deleteNote: (nid) => req('DELETE', `/api/notes/${nid}`),

  // Bookmarks
  getBookmarks: (bid) => req('GET', `/api/books/${bid}/bookmarks`),
  addBookmark: (bid, data) => req('POST', `/api/books/${bid}/bookmarks`, data),
  deleteBookmark: (bid) => req('DELETE', `/api/bookmarks/${bid}`),

  // Translate
  translate: (data) => req('POST', '/api/translate', data),
  translateFull: (data) => req('POST', '/api/translate/full', data),
  getTranslationStatus: (bid) => req('GET', `/api/translate/status/${bid}`),

  // Knowledge
  getKnowledgeGraph: (bid) => req('GET', `/api/knowledge/graph/${bid}`),
  extractKnowledge: (bid) => req('POST', `/api/knowledge/extract/${bid}`),

  // Search
  search: (bid, kw) => req('GET', `/api/search/${bid}?q=${encodeURIComponent(kw)}`),

  // Backup
  backup: () => req('POST', '/api/backup'),
  clearAllData: () => req('POST', '/api/data/clear'),
}
