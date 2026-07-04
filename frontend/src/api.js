const API_BASE = 'http://127.0.0.1:5001'

async function req(method, path, body, timeoutMs) {
  const opts = { method, headers: {} }
  if (body) {
    if (body instanceof FormData) opts.body = body
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  }
  const fetchPromise = fetch(`${API_BASE}${path}`, opts).then(r => r.json())
  if (timeoutMs) {
    return Promise.race([fetchPromise, new Promise((_, rj) => setTimeout(() => rj(new Error('超时')), timeoutMs))])
  }
  return fetchPromise
}

export const api = {
  base: API_BASE,
  checkHealth: () => req('GET', '/api/health'),
  listBooks: () => req('GET', '/api/books'),
  getBook: (id) => req('GET', `/api/books/${id}`),
  deleteBook: (id) => req('DELETE', `/api/books/${id}`),
  getPageContent: (bid, pn) => req('GET', `/api/books/${bid}/page/${pn}`),
  getCoverUrl: (bid) => `${API_BASE}/api/books/${bid}/cover`,
  importBookByPath: (path) => req('POST', '/api/books/import_by_path', { path }),
  getProgress: (bid) => req('GET', `/api/progress/${bid}`),
  updateProgress: (bid, data) => req('PUT', `/api/progress/${bid}`, data),
  getNotes: (bid) => req('GET', `/api/books/${bid}/notes`),
  addNote: (bid, data) => req('POST', `/api/books/${bid}/notes`, data),
  deleteNote: (nid) => req('DELETE', `/api/notes/${nid}`),
  getBookmarks: (bid) => req('GET', `/api/books/${bid}/bookmarks`),
  addBookmark: (bid, data) => req('POST', `/api/books/${bid}/bookmarks`, data),
  deleteBookmark: (bid) => req('DELETE', `/api/bookmarks/${bid}`),
  updateBookmark: (bid, data) => req('PUT', `/api/bookmarks/${bid}`, data),
  translate: (data) => req('POST', '/api/translate', data, 300000),
  translateFull: (data) => req('POST', '/api/translate/full', data),
  getTranslationStatus: (bid) => req('GET', `/api/translate/status/${bid}`),
  getKnowledgeGraph: (bid) => req('GET', `/api/knowledge/graph/${bid}`),
  extractKnowledge: (bid) => req('POST', `/api/knowledge/extract/${bid}`),
  search: (bid, kw) => req('GET', `/api/search/${bid}?q=${encodeURIComponent(kw)}`),
  backup: () => req('POST', '/api/backup'),
  clearAllData: () => req('POST', '/api/data/clear'),
  getTranslatorConfig: () => req('GET', '/api/settings/translator'),
  updateTranslatorConfig: (data) => req('PUT', '/api/settings/translator', data),
  getProviderPresets: () => req('GET', '/api/settings/translator/presets'),
}
