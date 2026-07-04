/**
 * AI智慧阅读 - 阅读器模块
 * IDE 分栏模式：左侧阅读，右侧侧边面板
 */
const Reader = {
  currentBook: null,
  currentPage: 1,
  totalPages: 0,
  pages: [],
  notes: [],
  bookmarks: [],
  isEyeCare: false,

  async open(book) {
    this.currentBook = book;
    this.currentPage = 1;
    this.totalPages = book.total_pages || 0;
    $('#readerTitle').textContent = book.title;
    await this.loadPages(book.id);
    await this.loadNotes(book.id);
    await this.loadBookmarks(book.id);
    this.renderPage(this.currentPage);
    this.renderNotesPanel();
    this.renderBookmarksPanel();

    const progress = await api.getProgress(book.id);
    if (progress.current_page > 1) {
      this.currentPage = progress.current_page;
      this.renderPage(this.currentPage);
    }
  },

  async loadPages(bookId) {
    const viewer = $('#pdfViewer');
    viewer.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><h3>加载中...</h3></div>';
    this.pages = [];
    try {
      const page1 = await api.getPageContent(bookId, 1);
      if (page1.content !== undefined) {
        this.pages.push(page1.content);
        this.totalPages = page1.total_pages;
        for (let i = 2; i <= this.totalPages; i++) {
          try {
            const pg = await api.getPageContent(bookId, i);
            this.pages.push(pg.content);
          } catch { this.pages.push(''); }
        }
      }
    } catch (err) {
      viewer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>加载失败</h3><p>${err.message}</p></div>`;
    }
  },

  renderPage(pageNum) {
    const viewer = $('#pdfViewer');
    if (pageNum < 1 || pageNum > this.pages.length) {
      viewer.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><h3>无内容</h3></div>';
      return;
    }
    const content = this.pages[pageNum - 1] || '（空白页）';
    const pageEl = document.createElement('div');
    pageEl.className = 'pdf-page';
    content.split('\n').filter(p => p.trim()).forEach(para => {
      const p = document.createElement('p');
      p.textContent = para;
      pageEl.appendChild(p);
    });
    viewer.innerHTML = '';
    viewer.appendChild(pageEl);
    this.currentPage = pageNum;
    this.updateUI();
    this.saveProgress();

    // 自动翻译模式：翻页后自动翻译当前页
    const mode = document.querySelector('input[name="transMode"]:checked');
    if (mode && (mode.value === 'auto' || mode.value === 'page')) {
      this.translateCurrentPage();
    }
  },

  /** 翻译当前页内容 */
  async translateCurrentPage() {
    const content = this.pages[this.currentPage - 1];
    if (!content || !content.trim()) return;
    const targetLang = $('#sideTargetLang').value;
    $('#sideSourceText').value = content.slice(0, 2000);
    $('#sideTranslateResult').textContent = '翻译中...';
    try {
      const r = await api.translate({ text: content.slice(0, 2000), source_lang: 'auto', target_lang: targetLang });
      $('#sideTranslateResult').textContent = r.translated_text || '翻译失败';
    } catch (e) {
      $('#sideTranslateResult').textContent = '翻译错误: ' + e.message;
    }
  },

  updateUI() {
    $('#pageInfo').textContent = `第 ${this.currentPage}/${this.totalPages} 页`;
    $('#pageSlider').max = this.totalPages;
    $('#pageSlider').value = this.currentPage;
    const pct = this.totalPages > 0 ? Math.round((this.currentPage / this.totalPages) * 100) : 0;
    $('#progressPercent').textContent = `${pct}%`;
    $('#btnPrevPage').disabled = this.currentPage <= 1;
    $('#btnNextPage').disabled = this.currentPage >= this.totalPages;
  },

  prevPage() { if (this.currentPage > 1) { this.currentPage--; this.renderPage(this.currentPage); $('#pdfViewer').scrollTop = 0; } },
  nextPage() { if (this.currentPage < this.totalPages) { this.currentPage++; this.renderPage(this.currentPage); $('#pdfViewer').scrollTop = 0; } },
  goToPage(n) { n = Math.max(1, Math.min(n, this.totalPages)); this.currentPage = n; this.renderPage(n); $('#pdfViewer').scrollTop = 0; },

  /** 恢复阅读进度（从后端加载） */
  updateProgress(progress) {
    if (!progress) return;
    if (progress.current_page > 1) {
      this.currentPage = progress.current_page;
      if (this.pages.length > 0) this.renderPage(this.currentPage);
    }
  },

  async saveProgress() {
    if (!this.currentBook) return;
    try {
      const pct = this.totalPages > 0 ? Math.round((this.currentPage / this.totalPages) * 100) / 100 : 0;
      await api.updateProgress(this.currentBook.id, { current_page: this.currentPage, total_pages: this.totalPages, percentage: pct, scroll_position: 0 });
    } catch {}
  },

  // ─── 笔记 ───
  async loadNotes(bookId) {
    try { const r = await api.getNotes(bookId); this.notes = r.notes || []; } catch { this.notes = []; }
  },
  async addNote(pageNum, selectedText, content, color) {
    if (!this.currentBook) return;
    try {
      await api.addNote(this.currentBook.id, { page_num: pageNum, content, selected_text: selectedText || '', color: color || '#FFD700' });
      showToast('笔记已添加');
      await this.loadNotes(this.currentBook.id);
      this.renderNotesPanel();
    } catch (e) { showToast('添加笔记失败'); }
  },
  async deleteNote(noteId) {
    await api.deleteNote(noteId);
    await this.loadNotes(this.currentBook.id);
    this.renderNotesPanel();
  },
  renderNotesPanel() {
    const container = $('#notesList');
    if (!container) return;
    if (!this.notes || this.notes.length === 0) {
      container.innerHTML = '<div class="hint" style="padding:16px;text-align:center">暂无笔记<br>选中文本后添加笔记</div>';
      return;
    }
    container.innerHTML = this.notes.map(n =>
      `<div class="note-item" style="border-left-color:${n.color||'#FFD700'}">
        <div class="note-text">${n.content}</div>
        ${n.selected_text ? `<div class="note-source">"${n.selected_text.slice(0,80)}"</div>` : ''}
        <div style="font-size:11px;color:var(--text-muted)">第 ${n.page_num} 页</div>
        <button class="btn-icon btn-sm" onclick="Reader.deleteNote(${n.id})" title="删除" style="margin-top:4px">🗑️</button>
      </div>`
    ).join('');
  },

  // ─── 书签 ───
  async loadBookmarks(bookId) {
    try { const r = await api.getBookmarks(bookId); this.bookmarks = r.bookmarks || []; } catch { this.bookmarks = []; }
  },
  async toggleBookmark() {
    if (!this.currentBook) { showToast('请先打开一本书'); return; }
    const existing = this.bookmarks.find(b => b.page_num === this.currentPage);
    if (existing) {
      await api.deleteBookmark(existing.id);
      await this.loadBookmarks(this.currentBook.id);
      showToast('书签已取消');
    } else {
      await api.addBookmark(this.currentBook.id, { page_num: this.currentPage, title: `第${this.currentPage}页` });
      await this.loadBookmarks(this.currentBook.id);
      showToast('🔖 书签已添加');
    }
    this.renderBookmarksPanel();
  },
  renderBookmarksPanel() {
    const container = $('#bookmarksList');
    if (!container) return;
    if (!this.bookmarks || this.bookmarks.length === 0) {
      container.innerHTML = '<div class="hint" style="padding:16px;text-align:center">暂无书签<br>点击工具栏 🔖 添加</div>';
      return;
    }
    container.innerHTML = this.bookmarks.map(b =>
      `<div class="bookmark-item" onclick="Reader.goToPage(${b.page_num})">
        <span>🔖 第 ${b.page_num} 页</span>
        <span style="font-size:11px;color:var(--text-muted)">${(b.created_at||'').slice(5,16)}</span>
      </div>`
    ).join('');
  },

  // ─── 搜索 ───
  renderSearchPanel() {
    const c = $('#sideSearchResults');
    if (!c) return;
  },

  bindEvents() {
    $('#btnPrevPage').addEventListener('click', () => this.prevPage());
    $('#btnNextPage').addEventListener('click', () => this.nextPage());
    $('#pageSlider').addEventListener('input', e => this.goToPage(parseInt(e.target.value)));
    $('#btnBookmark').addEventListener('click', () => this.toggleBookmark());
    $('#btnFullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
    $('#btnBackToLib').addEventListener('click', () => App.switchView('library'));

    // 划词翻译：选中文本后自动填入翻译面板
    $('#pdfViewer').addEventListener('mouseup', () => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && App.currentPanel === 'translate') {
        const mode = document.querySelector('input[name="transMode"]:checked');
        if (mode && mode.value === 'manual') {
          $('#sideSourceText').value = text;
          $('#sideSourceText').readOnly = false;
        }
      }
    });

    // 翻译模式切换：选中的 radio 样式
    $$('.mode-option').forEach(el => {
      const radio = el.querySelector('input');
      radio.addEventListener('change', () => {
        $$('.mode-option').forEach(o => o.classList.remove('active'));
        if (radio.checked) el.classList.add('active');
        if (radio.value !== 'manual') {
          $('#sideSourceText').readOnly = true;
          $('#sideSourceText').value = '翻页后自动翻译...';
        } else {
          $('#sideSourceText').readOnly = false;
          $('#sideSourceText').value = '';
          $('#sideSourceText').placeholder = '在左侧选中文本，或输入要翻译的文字...';
        }
      });
    });

    // 键盘翻页
    document.addEventListener('keydown', e => {
      if (!this.currentBook || !App.isViewActive('reader')) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prevPage(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.nextPage(); }
    });

    // 搜索
    $('#btnSideSearch').addEventListener('click', async () => {
      const keyword = $('#sideSearchInput').value.trim();
      if (!keyword || !this.currentBook) return;
      try {
        const r = await api.search(this.currentBook.id, keyword);
        const div = $('#sideSearchResults');
        if (r.results && r.results.length > 0) {
          div.innerHTML = `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">找到 ${r.total} 处</div>` +
            r.results.slice(0, 30).map(res =>
              `<div class="search-result-item">${highlightMatch(res.matched, keyword)}
                <div style="font-size:10px;color:var(--text-muted)">行 ${res.line}</div></div>`
            ).join('');
        } else {
          div.innerHTML = '<div class="hint" style="padding:8px;text-align:center">未找到匹配</div>';
        }
      } catch {}
    });

    function highlightMatch(text, kw) {
      const i = text.toLowerCase().indexOf(kw.toLowerCase());
      return i === -1 ? text : text.slice(0,i) + '<span class="match">' + text.slice(i, i+kw.length) + '</span>' + text.slice(i+kw.length);
    }
  }
};
