/**
 * AI智慧阅读 - 侧边栏翻译模块
 */
const Translation = {
  init() {
    this.bindEvents();
  },

  async translate() {
    const text = $('#sideSourceText').value.trim();
    if (!text) { showToast('请输入要翻译的文本'); return; }
    const sourceLang = $('#sideSourceLang').value;
    const targetLang = $('#sideTargetLang').value;
    $('#sideTranslateResult').textContent = '翻译中...';
    try {
      const r = await api.translate({ text, source_lang: sourceLang, target_lang: targetLang });
      $('#sideTranslateResult').textContent = r.translated_text || '翻译失败';
    } catch (e) {
      $('#sideTranslateResult').textContent = '翻译错误: ' + e.message;
    }
  },

  async fullTranslate() {
    const bookId = Reader.currentBook?.id;
    if (!bookId) { showToast('请先在阅读器中打开一本书'); return; }
    try {
      await api.translateFull({ book_id: bookId, target_lang: $('#sideTargetLang').value });
      showToast('✅ 全文翻译任务已启动');
      $('#sideSourceText').value = '全文翻译任务已启动，等待完成...';
      $('#sideTranslateResult').textContent = '处理中...';
      this.pollResult(bookId);
    } catch (e) { showToast('启动失败: ' + e.message); }
  },

  async pollResult(bookId, max = 60) {
    for (let i = 0; i < max; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const s = await api.getTranslationStatus(bookId);
        if (s.status === 'completed' && s.data) {
          const text = s.data.full_translation || (s.data.segments || []).map(x => x.translation).join('\n\n');
          if (text) {
            $('#sideSourceText').value = '✅ 全文翻译完成';
            $('#sideTranslateResult').textContent = text;
            showToast('✅ 全文翻译完成');
            return;
          }
        }
        if (i % 5 === 0) $('#sideTranslateResult').textContent = `翻译中...已等待 ${(i+1)*3} 秒`;
      } catch {}
    }
    showToast('翻译超时');
  },

  swapLangs() {
    const s = $('#sideSourceLang').value, t = $('#sideTargetLang').value;
    if (s !== 'auto') { $('#sideSourceLang').value = t; $('#sideTargetLang').value = s; }
    const st = $('#sideSourceText').value, tt = $('#sideTranslateResult').textContent;
    if (st || tt) { $('#sideSourceText').value = tt; $('#sideTranslateResult').textContent = st; }
  },

  bindEvents() {
    $('#btnSideTranslate').addEventListener('click', () => this.translate());
    $('#btnFullTranslateSide').addEventListener('click', () => this.fullTranslate());
    $('#btnSideSwapLang').addEventListener('click', () => this.swapLangs());
    // Ctrl+Enter 触发翻译
    $('#sideSourceText').addEventListener('keydown', e => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); this.translate(); }
    });
  }
};
