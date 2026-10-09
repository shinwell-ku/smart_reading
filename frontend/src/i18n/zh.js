/**
 * 中文文案表。
 *
 * key 用扁平的点分命名，不嵌套 —— t() 少一次路径遍历，而且校验漏翻时
 * 直接 diff 两边的 Object.keys 就行，嵌套结构得写递归比较。
 *
 * 分区名和组件目录对应：app / common / library / reader / side / settings /
 * about / lang（语言显示名）/ unit（量词，供组合）/ err（后端错误码）。
 *
 * 复数：中文不需要，同一 key 直接给字符串；英文那边给 { one, other }。
 * err.* 的 key 必须和后端返回的 code 一字不差，方便 grep 对拍。
 */
export default {
  // ── 应用 ──
  'app.title': 'AI智慧阅读',
  'app.menu.library': '书库',
  'app.menu.reader': '阅读',
  'app.menu.settings': '设置',
  'app.menu.about': '关于',
  'app.status.online': '服务已就绪',
  'app.status.offline': '服务离线',
  'app.panel.tools': '工具',
  'app.panel.collapse': '折叠右侧面板',
  'app.panel.expand': '展开',

  // ── 侧边工具面板的页签 ──
  'side.tab.translate': '翻译',
  'side.tab.vocabulary': '生词',
  'side.tab.notes': '笔记',
  'side.tab.bookmarks': '书签',
  'side.tab.search': '搜索',
  'side.tab.knowledge': '图谱',

  // ── 通用 ──
  'common.ok': '确定',
  'common.cancel': '取消',
  'common.pageNo': '第{page}页',
  'common.loading': '加载中...',

  // ── 关于 ──
  'about.title': '关于',
  'about.tagline': 'AI 翻译 · 知识图谱 · 多格式阅读',
  'about.slogan': '用心做好简单、高效、易用的小工具',
  'about.donate': '开源不易，您的捐助是我前进的动力🙏',
  'about.qrAlt': '赞赏码',
  'about.qrLabel': '微信赞赏码',

  // ── 设置 · 通用 ──
  'settings.section.general': '通用',
  'settings.language.label': '界面语言',
  'settings.language.tooltip': '切换后立即生效，无需重启',

  // ── 前端自造的错误（不走后端）──
  'err.UNKNOWN': '未知错误',
  'err.NETWORK': '网络错误',
  'err.TIMEOUT': '请求超时',
}
