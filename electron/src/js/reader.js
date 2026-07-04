/**
 * AI智慧阅读 - 阅读器模块
 * 使用 PDF.js 原生渲染 + 精确文字层
 */
const Reader = {
  currentBook: null,
  currentPage: 1,
  totalPages: 0,
  pages: [],
  notes: [],
  bookmarks: [],
  _pdfDoc: null,
  _scale: 1,

  async open(book) {
    this.currentBook = book;
    this.currentPage = 1;
    this.totalPages = book.total_pages || 0;
    this.pages = [];
    this._pdfDoc = null;
    $('#readerTitle').textContent = book.title;

    const viewer = $('#pdfViewer');

    // 获取上次阅读进度
    let startPage = 1;
    try {
      const progress = await api.getProgress(book.id);
      if (progress && progress.current_page > 1) startPage = progress.current_page;
    } catch {}
    this.currentPage = startPage;

    if (book.file_type === 'pdf') {
      viewer.innerHTML = '<div class="empty-state"><div style="font-size:32px;margin-bottom:8px">📖</div><h3>加载中...</h3></div>';
      App.switchView('reader');

      try {
        const fileData = await window.electronAPI.readFile(book.file_path);
        if (!fileData || !fileData.success) throw new Error('读取文件失败');
        const loadingTask = pdfjsLib.getDocument({ data: fileData.data });
        this._pdfDoc = await Promise.race([
          loadingTask.promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), 30000))
        ]);
        this.totalPages = this._pdfDoc.numPages;
        await this.renderPage(this.currentPage);
      } catch (e) {
        console.error('PDF解析失败:', e);
        try {
          await this.loadPage(book.id, startPage);
          this._renderTextPage(this.currentPage);
        } catch {
          viewer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>打开失败</h3></div>`;
        }
      }
    } else {
      await this.loadPage(book.id, startPage);
      this._renderTextPage(this.currentPage);
      App.switchView('reader');
    }

    // 后台加载笔记+书签
    try {
      const [n, b] = await Promise.all([api.getNotes(book.id), api.getBookmarks(book.id)]);
      this.notes = n.notes || [];
      this.bookmarks = b.bookmarks || [];
      this.renderNotesPanel();
      this.renderBookmarksPanel();
    } catch { this.notes = []; this.bookmarks = []; }
  },

  async renderPage(pageNum) {
    const viewer = $('#pdfViewer');
    if (!this._pdfDoc) return this._renderTextPage(pageNum);
    if (pageNum < 1 || pageNum > this.totalPages) return;

    try {
      const page = await this._pdfDoc.getPage(pageNum);
      const dpr = window.devicePixelRatio || 1;
      const scale = this._scale * dpr;
      const viewport = page.getViewport({ scale });

      // 容器
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;margin:0 auto';
      wrapper.style.width = Math.floor(viewport.width / dpr) + 'px';

      // Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = Math.floor(viewport.width / dpr) + 'px';
      canvas.style.height = Math.floor(viewport.height / dpr) + 'px';
      wrapper.appendChild(canvas);

      viewer.innerHTML = '';
      viewer.appendChild(wrapper);
      viewer.scrollTop = 0;

      await page.render({ canvasContext: ctx, viewport }).promise;

      // 文字层：使用 pdfjs 文本坐标 + css transform
      try {
        const textContent = await page.getTextContent();
        this.pages[pageNum - 1] = textContent.items.map(item => item.str).join(' ');
        this._buildTextLayer(wrapper, textContent, page, scale, dpr);
      } catch { this.pages[pageNum - 1] = ''; }

      this.currentPage = pageNum;
      this.updateUI();
      this.saveProgress();

      // 自适应宽度
      this._fitToViewer(wrapper, canvas, viewer);

    } catch (e) {
      viewer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>渲染失败</h3></div>`;
    }
  },

  _buildTextLayer(container, textContent, page, scale, dpr) {
    const textLayer = document.createElement('div');
    textLayer.className = 'pdf-text-layer';
    textLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
    container.appendChild(textLayer);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
    textLayer.appendChild(svg);

    const pageHeight = page.getViewport({ scale: 1 }).height * scale / dpr;
    const fontSize = 12 * scale / dpr;

    textContent.items.forEach(item => {
      const tm = item.transform;
      const x = tm[4] * scale / dpr;
      const y = pageHeight - tm[5] * scale / dpr;

      const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tx.setAttribute('x', x);
      tx.setAttribute('y', y);
      tx.setAttribute('font-size', (item.height || fontSize) + 'px');
      tx.setAttribute('font-family', item.fontName || 'sans-serif');
      tx.setAttribute('fill', 'transparent');
      tx.setAttribute('stroke', 'transparent');
      tx.style.pointerEvents = 'auto';
      tx.style.cursor = 'text';
      tx.style.userSelect = 'text';
      tx.style.webkitUserSelect = 'text';
      tx.textContent = item.str;
      svg.appendChild(tx);
    });
  },

  _fitToViewer(wrapper, canvas, viewer) {
    const maxW = viewer.clientWidth - 48;
    if (wrapper.offsetWidth > maxW) {
      const r = maxW / wrapper.offsetWidth;
      wrapper.style.width = maxW + 'px';
      wrapper.style.transform = `scale(${r})`;
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.height = canvas.offsetHeight * r + 'px';
    }
  },

  zoomIn() { if (this._pdfDoc) { this._scale = Math.min(3, this._scale + 0.2); this._updateZoom(); } },
  zoomOut() { if (this._pdfDoc) { this._scale = Math.max(0.3, this._scale - 0.2); this._updateZoom(); } },
  _updateZoom() {
    $('#zoomLevel').textContent = Math.round(this._scale / 1 * 100) + '%';
    this.renderPage(this.currentPage);
  },

  /** 加载页文本（DOCX/回退/翻译用） */
  async loadPage(bookId, pageNum) {
    try {
      const pg = await api.getPageContent(bookId, pageNum);
      if (pg.content !== undefined) {
        if (pageNum === 1) this.totalPages = pg.total_pages;
        this.pages[pageNum - 1] = pg.content;
      }
    } catch {}
  },

  _renderTextPage(pageNum) {
    const viewer = $('#pdfViewer');
    if (pageNum < 1 || pageNum > this.pages.length) return;
    viewer.innerHTML = `<div class="pdf-page">${(this.pages[pageNum-1]||'').split('\n').filter(p=>p.trim()).map(p=>`<p>${p}</p>`).join('')}</div>`;
    this.currentPage = pageNum;
    this.updateUI();
    this.saveProgress();
  },

  // ─── 导航 ───
  updateUI() {
    $('#pageInfo').textContent = `第 ${this.currentPage}/${this.totalPages} 页`;
    $('#pageSlider').max = this.totalPages;
    $('#pageSlider').value = this.currentPage;
    $('#progressPercent').textContent = this.totalPages > 0 ? Math.round(this.currentPage/this.totalPages*100) + '%' : '0%';
    $('#btnPrevPage').disabled = this.currentPage <= 1;
    $('#btnNextPage').disabled = this.currentPage >= this.totalPages;
  },
  prevPage() { if (this.currentPage > 1) { this.currentPage--; this.renderPage(this.currentPage); } },
  nextPage() { if (this.currentPage < this.totalPages) { this.currentPage++; this.renderPage(this.currentPage); } },
  goToPage(n) { n = Math.max(1, Math.min(n, this.totalPages)); this.currentPage = n; this.renderPage(n); },
  updateProgress(p) { if (p && p.current_page > 1) { this.currentPage = p.current_page; this.goToPage(this.currentPage); } },
  async saveProgress() {
    if (!this.currentBook) return;
    try {
      await api.updateProgress(this.currentBook.id, {
        current_page: this.currentPage, total_pages: this.totalPages,
        percentage: this.totalPages > 0 ? this.currentPage / this.totalPages : 0, scroll_position: 0
      });
    } catch {}
  },

  // ─── 笔记 ───
  async loadNotes(bookId) { try { const r = await api.getNotes(bookId); this.notes = r.notes || []; } catch { this.notes = []; } },
  async addNote(pn, st, ct, cl) {
    if (!this.currentBook) return;
    try {
      await api.addNote(this.currentBook.id, { page_num: pn, content: ct, selected_text: st||'', color: cl||'#FFD700' });
      showToast('笔记已添加'); await this.loadNotes(this.currentBook.id); this.renderNotesPanel();
    } catch {}
  },
  async deleteNote(nid) { await api.deleteNote(nid); await this.loadNotes(this.currentBook.id); this.renderNotesPanel(); },
  renderNotesPanel() {
    const c = $('#notesList'); if (!c) return;
    c.innerHTML = (!this.notes||!this.notes.length) ? '<div class="hint" style="padding:16px;text-align:center">暂无笔记</div>'
      : this.notes.map(n => `<div class="note-item" style="border-left-color:${n.color||'#FFD700'}"><div class="note-text">${n.content}</div>${n.selected_text ? `<div class="note-source">"${n.selected_text.slice(0,80)}"</div>` : ''}<div style="font-size:11px;color:var(--text-muted)">第${n.page_num}页</div><button class="btn-icon btn-sm" onclick="Reader.deleteNote(${n.id})">🗑️</button></div>`).join('');
  },

  // ─── 书签 ───
  async loadBookmarks(bookId) { try { const r = await api.getBookmarks(bookId); this.bookmarks = r.bookmarks || []; } catch { this.bookmarks = []; } },
  async toggleBookmark() {
    if (!this.currentBook) { showToast('请先打开一本书'); return; }
    const ex = this.bookmarks.find(b => b.page_num === this.currentPage);
    if (ex) { await api.deleteBookmark(ex.id); await this.loadBookmarks(this.currentBook.id); showToast('书签已取消'); }
    else { await api.addBookmark(this.currentBook.id, { page_num: this.currentPage, title: `第${this.currentPage}页` }); await this.loadBookmarks(this.currentBook.id); showToast('🔖 书签已添加'); }
    this.renderBookmarksPanel();
  },
  renderBookmarksPanel() {
    const c = $('#bookmarksList'); if (!c) return;
    c.innerHTML = (!this.bookmarks||!this.bookmarks.length) ? '<div class="hint" style="padding:16px;text-align:center">暂无书签</div>'
      : this.bookmarks.map(b => `<div class="bookmark-item" onclick="Reader.goToPage(${b.page_num})">🔖 第${b.page_num}页</div>`).join('');
  },

  /** 翻译当前页 */
  async translateCurrentPage() {
    if (!this.pages[this.currentPage - 1] && this.currentBook) await this.loadPage(this.currentBook.id, this.currentPage);
    const content = this.pages[this.currentPage - 1];
    if (!content || !content.trim()) return;
    const lang = $('#sideTargetLang').value;
    $('#sideSourceText').value = content.slice(0, 2000);
    $('#sideTranslateResult').textContent = '翻译中...';
    try {
      const r = await api.translate({ text: content.slice(0, 2000), source_lang: 'auto', target_lang: lang });
      $('#sideTranslateResult').textContent = r.translated_text || '翻译失败';
    } catch {}
  },

  bindEvents() {
    $('#btnPrevPage').addEventListener('click', () => this.prevPage());
    $('#btnNextPage').addEventListener('click', () => this.nextPage());
    $('#pageSlider').addEventListener('input', e => this.goToPage(parseInt(e.target.value)));
    $('#btnBookmark').addEventListener('click', () => this.toggleBookmark());
    $('#btnZoomIn').addEventListener('click', () => this.zoomIn());
    $('#btnZoomOut').addEventListener('click', () => this.zoomOut());
    $('#btnFullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });
    $('#btnBackToLib').addEventListener('click', () => App.switchView('library'));

    document.addEventListener('keydown', e => {
      if (!this.currentBook || !App.isViewActive('reader')) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prevPage(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); this.nextPage(); }
      else if ((e.ctrlKey||e.metaKey) && (e.key === '='||e.key === '+')) { e.preventDefault(); this.zoomIn(); }
      else if ((e.ctrlKey||e.metaKey) && e.key === '-') { e.preventDefault(); this.zoomOut(); }
    });

    // 划词：鼠标松开后取选中文本
    $('#pdfViewer').addEventListener('mouseup', () => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text) return;
      // 检查是否选中了 SVG 文本
      if (sel.anchorNode && sel.anchorNode.nodeType === 3) {
        $('#sideSourceText').value = text;
      }
    });

    // Ctrl+滚轮缩放
    $('#pdfViewer').addEventListener('wheel', e => {
      if (!this.currentBook || !this._pdfDoc) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this._scale = Math.max(0.3, Math.min(3, this._scale + (e.deltaY > 0 ? -0.15 : 0.15)));
        $('#zoomLevel').textContent = Math.round(this._scale / 1 * 100) + '%';
        this.renderPage(this.currentPage);
      }
    }, { passive: false });

    // 搜索
    $('#btnSideSearch').addEventListener('click', async () => {
      const kw = $('#sideSearchInput').value.trim();
      if (!kw || !this.currentBook) return;
      try {
        const r = await api.search(this.currentBook.id, kw);
        const div = $('#sideSearchResults');
        div.innerHTML = r.results && r.results.length > 0
          ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">找到${r.total}处</div>` + r.results.slice(0,30).map(res => `<div class="search-result-item">${res.matched.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),'<span class="match">$&</span>')}</div>`).join('')
          : '<div class="hint" style="padding:8px;text-align:center">未找到</div>';
      } catch {}
    });

    $('#btnAddNote').addEventListener('click', () => {
      if (!this.currentBook) { showToast('请先打开一本书'); return; }
      const ct = $('#noteContentInput').value.trim();
      if (!ct) { showToast('请输入笔记内容'); return; }
      const cl = $('#noteColors .active')?.dataset.color || '#FFD700';
      this.addNote(this.currentPage, '', ct, cl);
      $('#noteContentInput').value = '';
    });
    $$('#noteColors .color-btn').forEach(b => b.addEventListener('click', () => { $$('#noteColors .color-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); }));
  }
};
