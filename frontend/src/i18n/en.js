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
  'app.panel.tools': 'Tools',
  'app.panel.collapse': 'Collapse panel',
  'app.panel.expand': 'Expand',

  // ── Side panel tabs ──
  'side.tab.translate': 'Translate',
  'side.tab.vocabulary': 'Vocabulary',
  'side.tab.notes': 'Notes',
  'side.tab.bookmarks': 'Bookmarks',
  'side.tab.search': 'Search',
  'side.tab.knowledge': 'Graph',

  // ── Common ──
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.pageNo': 'Page {page}',
  'common.loading': 'Loading...',

  // ── About ──
  'about.title': 'About',
  'about.tagline': 'AI translation · Knowledge graph · Multi-format reading',
  'about.slogan': 'Crafting small tools that are simple, fast and pleasant to use',
  'about.donate': 'Open source takes real effort — your support keeps it going 🙏',
  'about.qrAlt': 'Donation QR code',
  'about.qrLabel': 'WeChat tip code',

  // ── Settings · General ──
  'settings.section.general': 'General',
  'settings.language.label': 'Language',
  'settings.language.tooltip': 'Takes effect immediately — no restart needed',

  // ── Errors raised by the frontend itself (no backend involved) ──
  'err.UNKNOWN': 'Unknown error',
  'err.NETWORK': 'Network error',
  'err.TIMEOUT': 'Request timed out',
}
