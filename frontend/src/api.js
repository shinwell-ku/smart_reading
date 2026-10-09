import { t, errText } from './i18n'

const API_BASE = 'http://127.0.0.1:5001'

// 后端的错误码 → 当前语言的文案，在这里统一翻译。
//
// 为什么不放在各个调用点：全库 50+ 个调用点都是 `if (r.error)` 当布尔量判断、
// 然后直接把 r.error 显示出去，在这里换掉它，调用点一行都不用改，也不会漏。
// code 未知（比如后端版本对不上）时 errText 会兜住后端原文，不会显示 err.XXX。
function localizeError(r) {
  if (r && r.error && r.code) r.error = errText(r)
  return r
}

// fetch 自己抛的是 "Failed to fetch" / "Load failed" 这类浏览器文案，
// 中文用户看到就是英文。统一换成本地化过的错误。
function netError(code) {
  const e = new Error(t('err.' + code))
  e.code = code
  return e
}

async function req(method, path, body, timeoutMs) {
  const opts = { method, headers: {} }
  if (body) {
    if (body instanceof FormData) opts.body = body
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  }
  const fetchPromise = fetch(`${API_BASE}${path}`, opts)
    .then(r => r.json())
    .then(localizeError)
    .catch(e => { throw e.code ? e : netError('NETWORK') })
  if (timeoutMs) {
    return Promise.race([fetchPromise, new Promise((_, rj) => setTimeout(() => rj(netError('TIMEOUT')), timeoutMs))])
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
  importBookByPath: (path, allowDuplicate) =>
    req('POST', '/api/books/import_by_path', { path, allow_duplicate: !!allowDuplicate }),
  reorderBooks: (ids) => req('PUT', '/api/books/order', { ids }),
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
  saveWord: (data) => req('POST', '/api/translate/words', data),
  getWords: (bid) => req('GET', `/api/translate/words/${bid}`),
  deleteWord: (wid) => req('DELETE', `/api/translate/words/${wid}`),
  getKnowledgeGraph: (bid) => req('GET', `/api/knowledge/graph/${bid}`),
  getKnowledgeProgress: (bid) => req('GET', `/api/knowledge/progress/${bid}`),
  extractKnowledge: (bid) => req('POST', `/api/knowledge/extract/${bid}`),
  deleteKnowledgeGraph: (bid) => req('DELETE', `/api/knowledge/graph/${bid}`),
  search: (bid, kw) => req('GET', `/api/search/${bid}?q=${encodeURIComponent(kw)}`),
  backup: (destPath) => req('POST', '/api/backup', { dest_path: destPath }, 600000),
  restoreBackup: (path) => req('POST', '/api/restore', { path }, 600000),
  clearAllData: () => req('POST', '/api/data/clear'),
  getTranslatorConfig: () => req('GET', '/api/settings/translator'),
  updateTranslatorConfig: (data) => req('PUT', '/api/settings/translator', data),
  getProviderPresets: () => req('GET', '/api/settings/translator/presets'),
  fetchModels: (data) => req('POST', '/api/settings/translator/models', data, 20000),
}
