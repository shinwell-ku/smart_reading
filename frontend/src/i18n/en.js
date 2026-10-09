/**
 * English strings. Key-for-key mirror of zh.js.
 *
 * 这个文件里**不允许出现汉字**（`lang.*` 的母语名除外，那是刻意的）——
 * 校验脚本会查，防止从 zh.js 复制过来忘了翻译。
 */
export default {
  // ── App ──
  'app.title': 'SmartReading',
  'app.menu.library': 'Library',
  'app.menu.reader': 'Reader',
  'app.menu.settings': 'Settings',
  'app.menu.about': 'About',
  'app.status.online': 'Backend ready',
  'app.status.offline': 'Backend offline',

  // ── Common ──
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.pageNo': 'Page {page}',
  'common.loading': 'Loading...',

  // ── Settings · General ──
  'settings.section.general': 'General',
  'settings.language.label': 'Language',
  'settings.language.tooltip': 'Takes effect immediately — no restart needed',

  // ── Errors raised by the frontend itself (no backend involved) ──
  'err.UNKNOWN': 'Unknown error',
  'err.NETWORK': 'Network error',
  'err.TIMEOUT': 'Request timed out',
}
