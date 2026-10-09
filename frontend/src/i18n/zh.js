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

  // ── 设置 ──
  'settings.title': '设置',
  'settings.section.reading': '阅读',
  'settings.section.tts': '朗读',
  'settings.section.ai': 'AI 引擎',
  'settings.section.data': '数据管理',

  'settings.eyeCare.label': '护眼模式',
  'settings.eyeCare.tooltip': '阅读区与工具面板使用米色纸感配色',

  'settings.tts.unsupported': '当前环境不支持语音合成',
  'settings.tts.voice': '语音',
  'settings.tts.voice.tooltip': '用的是操作系统已安装的语音，不额外占用安装包体积。中文语音：macOS 有婷婷/美佳，Windows 需在「设置 → 时间和语言 → 语音」里装对应语言包',
  'settings.tts.voice.online': '（在线）',
  'settings.tts.voice.placeholder': '跟随系统（{n} 个可用）',
  'settings.tts.rate': '语速',
  'settings.tts.rate.tooltip': '1.0 为正常速度',
  'settings.tts.noVoice': '系统里没有「{lang}」语音，朗读会用不了。macOS 到「系统设置 → 辅助功能 → 朗读内容 → 系统声音」下载；Windows 到「设置 → 时间和语言 → 语音」添加。',

  'settings.ai.group.cn': '国内',
  'settings.ai.group.intl': '国际',
  'settings.ai.group.local': '本地',
  'settings.provider.deepseek': 'DeepSeek',
  'settings.provider.siliconflow': '硅基流动',
  'settings.provider.moonshot': '月之暗面 Moonshot',
  'settings.provider.zhipu': '智谱 GLM',
  'settings.provider.qwen': '阿里通义千问',
  'settings.provider.doubao': '字节豆包',
  'settings.provider.spark': '讯飞星火',
  'settings.provider.openai': 'OpenAI',
  'settings.provider.anthropic': 'Anthropic (需 proxy)',
  'settings.provider.google': 'Google Gemini',
  'settings.provider.xai': 'xAI Grok',
  'settings.provider.ollama': 'Ollama',
  'settings.provider.custom': '自定义',

  'settings.ai.provider': '大模型供应商',
  'settings.ai.provider.tooltip': '翻译与知识图谱均通过 OpenAI 兼容 API 调用',
  'settings.ai.base': '接口地址',
  'settings.ai.key': 'API Key',
  'settings.ai.model': '模型',
  'settings.ai.model.tooltip': '点「获取模型」从接口拉取列表，也可直接手工输入',
  'settings.ai.getModels': '获取模型',
  'settings.ai.maxTokens': '最大 Token 数',
  'settings.ai.maxTokens.tooltip': '单次回复的长度上限，长文翻译建议不低于 4096',
  'settings.ai.temperature': '温度',
  'settings.ai.temperature.tooltip': '越低越稳定保守，越高越发散。翻译建议保持 0.3 左右',
  'settings.ai.save': '保存配置',
  'settings.ai.saved': 'AI 配置已保存',
  'settings.ai.saveFailed': '保存失败',
  'settings.ai.needBase': '请先填写接口地址',
  'settings.ai.needKey': '请先填写 API Key',
  'settings.ai.modelsGot': '获取到 {n} 个模型',
  'settings.ai.noModels': '该接口未返回任何模型',
  'settings.ai.listFailed': '获取模型列表失败：{msg}',

  'settings.backup.label': '备份',
  'settings.backup.tooltip': '打包书籍、笔记、进度、生词、知识图谱和 AI 引擎配置',
  'settings.backup.export': '导出备份',
  'settings.backup.openFolder': '打开所在文件夹',
  'settings.backup.dialogTitle': '导出备份',
  'settings.backup.fileType': '备份文件',
  'settings.backup.fileName': 'AI智慧阅读备份_{stamp}.zip',
  'settings.backup.ok': '备份成功（{mb} MB）',
  'settings.backup.failed': '备份失败：{msg}',

  'settings.restore.label': '恢复',
  'settings.restore.tooltip': '从备份文件恢复，会覆盖当前全部数据',
  'settings.restore.import': '导入备份',
  'settings.restore.dialogTitle': '选择备份文件',
  'settings.restore.confirmTitle': '导入备份？',
  'settings.restore.confirmBody': '当前所有书籍、笔记、进度、生词和知识图谱将被完全覆盖，且无法恢复。',
  'settings.restore.ok': '覆盖并恢复',
  'settings.restore.okMsg': '恢复成功：{books}、{notes}、{bookmarks}',
  'settings.restore.failed': '恢复失败：{msg}',

  'settings.reset.label': '清除',
  'settings.reset.tooltip': '删除所有书籍、笔记、进度、生词和知识图谱，保留 AI 引擎配置',
  'settings.reset.button': '清除所有数据',
  'settings.reset.title': '清除所有数据？',
  'settings.reset.body': '将删除所有书籍文件、笔记、阅读进度、生词和知识图谱。AI 引擎配置会保留。此操作不可恢复！',
  'settings.reset.title2': '再次确认',
  'settings.reset.body2': '所有书籍和阅读数据将被永久删除，无法找回！',
  'settings.reset.done': '已清除',

  // ── 量词（给组合句用；中文不需要复数）──
  'unit.book': '{count} 本书',
  'unit.note': '{count} 条笔记',
  'unit.bookmark': '{count} 个书签',

  // ── 语言显示名（langName() 用；字典型里没有的代码原样返回）──
  'lang.zh': '中文',
  'lang.en': '英语',
  'lang.ja': '日语',
  'lang.ko': '韩语',
  'lang.fr': '法语',
  'lang.de': '德语',
  'lang.es': '西班牙语',
  'lang.ru': '俄语',
  'lang.pt': '葡萄牙语',
  'lang.it': '意大利语',
  'lang.nl': '荷兰语',
  'lang.pl': '波兰语',
  'lang.tr': '土耳其语',
  'lang.vi': '越南语',
  'lang.th': '泰语',
  'lang.ar': '阿拉伯语',
  'lang.hi': '印地语',
  'lang.mn': '蒙古语',

  // ── 前端自造的错误（不走后端）──
  'err.UNKNOWN': '未知错误',
  'err.NETWORK': '网络错误',
  'err.TIMEOUT': '请求超时',
}
