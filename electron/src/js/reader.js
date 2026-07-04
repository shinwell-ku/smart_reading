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
  _pdfDoc: null,
  _scale: 1.2,

  async open(book) {
    this.currentBook = book;
    this.currentPage = 1;
    this.totalPages = book.total_pages || 0;
    this.pages = [];
    this._pdfDoc = null;
    $('#readerTitle').textContent = book.title;

    const viewer = $('#pdfViewer');

    // PDF 文件：使用 PDF.js 渲染原始页面
    if (book.file_type === 'pdf' && book.file_path) {
      const fileUrl = 'file://' + book.file_path;
      try {
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        this._pdfDoc = await loadingTask.promise;
        this.totalPages = this._pdfDoc.numPages;
        await this.renderPage(this.currentPage);
        App.switchView('reader');
      } catch (e) {
        viewer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>PDF 加载失败</h3><p>${e.message}</p></div>`;
        App.switchView('reader');
        return;
      }
    } else {
      // DOCX 或文本：使用文本渲染
      await this.loadPage(book.id, 1);
      this.renderPage(this.currentPage);
      App.switchView('reader');
    }

    // 后台加载笔记 + 书签 + 阅读进度
    this._loadSideData(book.id);
  },

  /** PDF.js 渲染当前页到 Canvas */
  async renderPage(pageNum) {
    const viewer = $('#pdfViewer');
    if (!this._pdfDoc) {
      // 没有 PDF 文档时用文本渲染（回退）
      return this._renderTextPage(pageNum);
    }

    if (pageNum < 1 || pageNum > this.totalPages) {
      viewer.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><h3>无内容</h3></div>';
      return;
    }

    try {
      const page = await this._pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this._scale });

      // 创建 Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // 清空并渲染
      viewer.innerHTML = '';
      viewer.appendChild(canvas);

      const renderContext = { canvasContext: ctx, viewport: viewport };
      await page.render(renderContext).promise;

      // 提取文本用于翻译（可选）
      try {
        const textContent = await page.getTextContent();
        this.pages[pageNum - 1] = textContent.items.map(item => item.str).join(' ');
      } catch { this.pages[pageNum - 1] = ''; }

      // 适配 Canvas 到容器宽度
      const maxWidth = viewer.clientWidth - 48;
      if (canvas.width > maxWidth) {
        const ratio = maxWidth / canvas.width;
        canvas.style.width = maxWidth + 'px';
        canvas.style.height = (canvas.height * ratio) + 'px';
      }

      this.currentPage = pageNum;
      this.updateUI();
      this.saveProgress();

      // 自动翻译
      const mode = document.querySelector('input[name="transMode"]:checked');
      if (mode && (mode.value === 'auto' || mode.value === 'page')) {
        this.translateCurrentPage();
      }
      // 窗口缩放时自适应
      this._resizeHandler = () => {
        const c = viewer.querySelector('canvas');
        if (!c) return;
        const maxW = viewer.clientWidth - 48;
        if (c.width > maxW) {
          c.style.width = maxW + 'px';
          c.style.height = (c.height * maxW / c.width) + 'px';
        } else {
          c.style.width = '';
          c.style.height = '';
        }
      };
      window.addEventListener('resize', this._resizeHandler);

      // 滚动翻页：用 wheel 事件处理
      if (!viewer._wheelHandler) {
        viewer._wheelHandler = (e) => {
          if (!this.currentBook) return;
          const { scrollTop, scrollHeight, clientHeight } = viewer;
          const atTop = scrollTop <= 0;
          const atBottom = scrollTop + clientHeight >= scrollHeight - 5;
          if (e.deltaY > 0 && atBottom && this.currentPage < this.totalPages) {
            e.preventDefault();
            this.nextPage();
          } else if (e.deltaY < 0 && atTop && this.currentPage > 1) {
            e.preventDefault();
            this.prevPage();
          }
        };
        viewer.addEventListener('wheel', viewer._wheelHandler, { passive: false });
      }

    } catch (e) {
      viewer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>渲染失败</h3><p>${e.message}</p></div>`;
    }
  },

  /** 文本渲染（回退/DOCX） */
  _renderTextPage(pageNum) {
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

    const mode = document.querySelector('input[name="transMode"]:checked');
    if (mode && (mode.value === 'auto' || mode.value === 'page')) {
      this.translateCurrentPage();
    }
  },

  /** 加载指定页（文本模式用） */
  async loadPage(bookId, pageNum) {
    try {
      const pg = await api.getPageContent(bookId, pageNum);
      if (pg.content !== undefined) {
        if (pageNum === 1) this.totalPages = pg.total_pages;
        this.pages[pageNum - 1] = pg.content;
        return pg.content;
      }
    } catch {}
    this.pages[pageNum - 1] = '';
  },

  /** 后台加载笔记 + 书签 + 进度 */
  async _loadSideData(bookId) {
    try {
      const [n, b, progress] = await Promise.all([
        api.getNotes(bookId),
        api.getBookmarks(bookId),
        api.getProgress(bookId)
      ]);
      this.notes = n.notes || [];
      this.bookmarks = b.bookmarks || [];
      this.renderNotesPanel();
      this.renderBookmarksPanel();
      if (progress && progress.current_page > 1 && progress.current_page !== this.currentPage) {
        this.currentPage = progress.current_page;
        this.goToPage(this.currentPage);
      }
    } catch {
      this.notes = [];
      this.bookmarks = [];
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
      container.innerHTML = '<div class="hint" style="padding:16px;text-align:center">暂无笔记<br>在上方输入内容后点击「添加笔记」</div>';
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
    $('#btnTogglePanel').addEventListener('click', () => {
      const panel = $('#sidePanel');
      const left = $('.split-left');
      panel.classList.toggle('collapsed');
      left.classList.toggle('expanded');
      $('#btnTogglePanel').textContent = panel.classList.contains('collapsed') ? '»' : '«';
    });
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

    // 笔记：添加按钮
    $('#btnAddNote').addEventListener('click', () => {
      if (!this.currentBook) { showToast('请先打开一本书'); return; }
      const content = $('#noteContentInput').value.trim();
      if (!content) { showToast('请输入笔记内容'); return; }
      const color = $('#noteColors .active')?.dataset.color || '#FFD700';
      this.addNote(this.currentPage, '', content, color);
      $('#noteContentInput').value = '';
    });

    // 笔记：颜色选择
    $$('#noteColors .color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('#noteColors .color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 缩放手势（Ctrl+滚轮 / Mac 触控板捏合）
    $('#pdfViewer').addEventListener('wheel', (e) => {
      if (!this.currentBook) return;
      // Mac 捏合缩放或 Ctrl+滚轮缩放
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const current = parseInt($('#fontSize')?.value || '16');
        const next = Math.max(10, Math.min(36, current + delta));
        $('#fontSize').value = next;
        $('#fontSizeLabel').textContent = next + 'px';
        document.querySelectorAll('.pdf-page').forEach(el => el.style.fontSize = next + 'px');
        localStorage.setItem('sr_fontSize', String(next));
        return;
      }
      // 普通滚轮翻页
      const { scrollTop, scrollHeight, clientHeight } = $('#pdfViewer');
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 5;
      if (e.deltaY > 0 && atBottom && this.currentPage < this.totalPages) {
        e.preventDefault();
        this.nextPage();
      } else if (e.deltaY < 0 && atTop && this.currentPage > 1) {
        e.preventDefault();
        this.prevPage();
      }
    }, { passive: false });

    // Ctrl+= / Ctrl+- 缩放快捷键
    document.addEventListener('keydown', (e) => {
      if (!this.currentBook) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault();
        const delta = (e.key === '-' || e.key === '-') ? -1 : 1;
        const current = parseInt($('#fontSize')?.value || '16');
        const next = Math.max(10, Math.min(36, current + delta));
        $('#fontSize').value = next;
        $('#fontSizeLabel').textContent = next + 'px';
        document.querySelectorAll('.pdf-page').forEach(el => el.style.fontSize = next + 'px');
        localStorage.setItem('sr_fontSize', String(next));
      }
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
