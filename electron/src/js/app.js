/**
 * AI智慧阅读 - 主应用控制器
 * 顶部导航：书库 阅读 翻译 笔记 书签 搜索 图谱 设置
 * 阅读模式下：左侧原文，右侧功能面板由导航控制
 */
const App = {
  currentView: 'library',
  currentPanel: 'translate',
  backendOnline: false,
  healthCheckTimer: null,

  async init() {
    console.log('[App] AI智慧阅读启动中...');
    Library.init();
    Reader.bindEvents();
    Translation.init();
    Knowledge.init();
    this.bindNavigation();
    this.startHealthCheck();
    this.bindSettings();
    console.log('[App] 启动完成');
  },

  bindNavigation() {
    // 视图切换（书库/阅读/设置 — 全宽视图）
    $$('.topbar-btn[data-view]').forEach(item => {
      item.addEventListener('click', () => this.switchView(item.dataset.view));
    });
    // 面板切换（翻译/笔记/书签/搜索/图谱 — 右侧面板）
    $$('.panel-trigger').forEach(item => {
      item.addEventListener('click', () => this.switchPanel(item.dataset.panel));
    });
  },

  /** 切换全宽视图（书库/阅读/设置） */
  switchView(viewName) {
    // 先切到阅读时，如果没书则回退到书库
    if (viewName === 'reader' && !Reader.currentBook) {
      this.switchView('library');
      return;
    }
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = $(`#view-${viewName}`);
    if (!target) return;
    target.classList.add('active');
    this.currentView = viewName;

    // 更新导航高亮
    $$('.topbar-btn[data-view]').forEach(n =>
      n.classList.toggle('active', n.dataset.view === viewName));
    // 面板触发按钮不高亮
    $$('.panel-trigger').forEach(n => n.classList.remove('active'));

    if (viewName === 'library') Library.loadBooks();
  },

  /** 切换右侧功能面板 */
  switchPanel(panelName) {
    // 必须先打开一本书
    if (!Reader.currentBook) {
      showToast('请先从书库打开一本书');
      return;
    }
    // 如果当前不在阅读视图，先切过去
    if (this.currentView !== 'reader') {
      this.switchView('reader');
    }
    this.currentPanel = panelName;

    // 切换右侧面板页
    $$('.panel-page').forEach(p => p.classList.remove('active'));
    const target = $(`#panel-${panelName}`);
    if (target) target.classList.add('active');

    // 更新导航高亮
    $$('.topbar-btn[data-view]').forEach(n => n.classList.remove('active'));
    $$('.panel-trigger').forEach(n => n.classList.remove('active'));
    const trigger = $(`.panel-trigger[data-panel="${panelName}"]`);
    if (trigger) trigger.classList.add('active');

    // 图谱面板：加载或 resize
    if (panelName === 'knowledge') {
      setTimeout(() => Knowledge.sideChart?.resize(), 200);
      if (!Knowledge.sideGraphLoaded) Knowledge.loadSideGraph(Reader.currentBook.id);
    }
  },

  isViewActive(viewName) { return this.currentView === viewName; },

  async startHealthCheck() {
    const check = async () => {
      try {
        const r = await api.checkHealth();
        const online = r.status === 'ok';
        if (online !== this.backendOnline) {
          this.backendOnline = online;
          const dot = $('.status-dot'), txt = $('.status-text');
          if (dot) dot.className = 'status-dot ' + (online ? 'online' : 'offline');
          if (txt) txt.textContent = online ? '服务已就绪' : '服务离线';
        }
      } catch { if (this.backendOnline) { this.backendOnline = false; } }
    };
    await check();
    this.healthCheckTimer = setInterval(check, 10000);
  },

  bindSettings() {
    $('#btnBackup').addEventListener('click', async () => {
      try {
        const r = await api.backup();
        showToast(r.path ? `✅ 备份成功: ${r.path}` : '✅ 备份成功');
      } catch (e) { showToast('备份失败: ' + e.message); }
    });
    $('#btnResetData').addEventListener('click', async () => {
      const ok1 = await UI.confirm('确定清除所有数据？此操作不可恢复！', true);
      if (!ok1) return;
      const ok2 = await UI.confirm('再次确认：所有数据将被永久删除？', true);
      if (!ok2) return;
      try { await api.clearAllData(); showToast('所有数据已清除'); await Library.loadBooks(); }
      catch (e) { showToast('重置失败: ' + e.message); }
    });
    $('#eyeCare').addEventListener('change', e => {
      $('#app').classList.toggle('eye-care-mode', e.target.checked);
    });
    $('#fontSize').addEventListener('input', e => {
      const v = e.target.value + 'px';
      $('#fontSizeLabel').textContent = v;
      document.querySelectorAll('.pdf-page').forEach(el => el.style.fontSize = v);
    });
    $('#lineSpacing').addEventListener('change', e => {
      document.querySelectorAll('.pdf-page').forEach(el => el.style.lineHeight = e.target.value);
    });
    const savedFs = localStorage.getItem('sr_fontSize') || '16';
    $('#fontSize').value = savedFs;
    $('#fontSizeLabel').textContent = savedFs + 'px';
    const savedEc = localStorage.getItem('sr_eyeCare') === 'true';
    $('#eyeCare').checked = savedEc;
    if (savedEc) $('#app').classList.add('eye-care-mode');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(e => showToast('初始化失败: ' + e.message));
});
