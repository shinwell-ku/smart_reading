/**
 * AI智慧阅读 - 书库模块
 * 管理书籍的导入、展示、搜索、删除
 */

const Library = {
  books: [],
  filteredBooks: [],
  currentFilter: '',

  /** 初始化书库 */
  async init() {
    await this.loadBooks();
    this.bindEvents();
  },

  /** 加载书籍列表 */
  async loadBooks() {
    try {
      const result = await api.listBooks();
      this.books = result.books || [];
      this.filterBooks();
    } catch (err) {
      console.error('加载书库失败:', err);
      this.books = [];
      this.filteredBooks = [];
    }
  },

  /** 筛选书籍 */
  filterBooks() {
    const q = this.currentFilter.toLowerCase().trim();
    this.filteredBooks = q
      ? this.books.filter(b =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q))
        )
      : this.books;
    this.render();
  },

  /** 渲染书库 */
  render() {
    const grid = $('#bookGrid');

    if (this.filteredBooks.length === 0) {
      const hasBooks = this.books.length > 0;
      if (hasBooks) {
        grid.innerHTML = `<div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>未找到匹配的书籍</h3>
          <p>尝试不同的搜索关键词</p>
        </div>`;
      } else {
        grid.innerHTML = `<div class="empty-state">
          <div class="empty-icon">📚</div>
          <h3>书库为空</h3>
          <p>点击「导入书籍」按钮添加您的第一本电子书</p>
          <p class="hint">支持 PDF、DOCX 格式</p>
        </div>`;
      }
      return;
    }

    grid.innerHTML = this.filteredBooks.map(book => {
      const coverUrl = api.getCoverUrl(book.id);
      return `<div class="book-card" data-book-id="${book.id}">
        <div class="book-cover ${book.file_type}" style="position:relative;overflow:hidden">
          <img src="${coverUrl}" class="cover-img" alt="${book.title}"
               onerror="this.style.display='none'" />
          <span class="cover-emoji" style="${book.file_type === 'pdf' ? '' : ''}">${book.file_type === 'pdf' ? '📕' : '📘'}</span>
          <button class="btn-delete-book" onclick="event.stopPropagation();Library.deleteBook(${book.id})" title="删除">✕</button>
        </div>
        <div class="book-info">
          <div class="book-title" title="${book.title}">${book.title}</div>
          <div class="book-meta">
            <span>📄 ${book.file_type.toUpperCase()}</span>
            <span>📏 ${book.total_pages || 0}页</span>
            ${book.last_read_at ? `<span>🕐 ${formatDate(book.last_read_at).slice(5, 16)}</span>` : ''}
          </div>
          <div class="book-progress">
            <div class="book-progress-bar" style="width: 0%"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    // 卡牌点击 - 打开阅读器
    $$('.book-card').forEach(card => {
      card.addEventListener('click', () => {
        const bookId = parseInt(card.dataset.bookId);
        this.openBook(bookId);
      });

      // 右键菜单
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const bookId = parseInt(card.dataset.bookId);
        this.showBookContextMenu(e, bookId);
      });
    });
  },

  /** 打开书籍阅读 */
  async openBook(bookId) {
    try {
      const book = await api.getBook(bookId);
      if (book.error) {
        showToast('无法打开书籍: ' + book.error);
        return;
      }

      // 切换到阅读器视图
      Reader.open(book);
      App.switchView('reader');

      // 启用所有功能按钮
      $$('#nav-reader, #nav-translate, #nav-notes, #nav-bookmarks, #nav-search, #nav-knowledge')
        .forEach(b => b.disabled = false);
      // 默认切到翻译面板
      App.switchPanel('translate');

      // 更新进度
      const progress = await api.getProgress(bookId);
      Reader.updateProgress(progress);

      // 加载侧边图谱
      Knowledge.loadSideGraph(bookId);

    } catch (err) {
      showToast('打开书籍失败: ' + err.message);
    }
  },

  /** 导入书籍（带遮罩防重复） */
  async importBook() {
    if (this._importing) return;
    this._importing = true;

    const overlay = $('#importOverlay');
    const progressText = $('#importProgressText');
    const btn = $('#btnImportBook');

    try {
      btn.disabled = true;
      const result = await window.electronAPI.openFileDialog({});
      if (result.canceled || !result.filePaths.length) { this._importing = false; btn.disabled = false; return; }

      overlay.classList.add('show');
      let successCount = 0, failCount = 0;

      for (let i = 0; i < result.filePaths.length; i++) {
        const filePath = result.filePaths[i];
        progressText.textContent = `正在导入 ${i + 1}/${result.filePaths.length}...`;

        try {
          const copyResult = await window.electronAPI.copyToBooks(filePath);
          if (!copyResult.success) { failCount++; continue; }

          const fileData = await window.electronAPI.readFile(copyResult.path);
          if (!fileData.success) { failCount++; continue; }

          const fileName = copyResult.path.split('/').pop().split('\\').pop();
          const importResult = await api.importBook(new File([fileData.data], fileName));

          if (importResult.error) { failCount++; }
          else { successCount++; }
        } catch {
          failCount++;
        }
      }

      overlay.classList.remove('show');
      btn.disabled = false;
      this._importing = false;

      const msg = successCount > 0 ? `✅ 导入成功 ${successCount} 本` : '';
      const failMsg = failCount > 0 ? `，${failCount} 本失败` : '';
      showToast(msg + failMsg || '导入完成');
      await this.loadBooks();
    } catch (err) {
      overlay.classList.remove('show');
      btn.disabled = false;
      this._importing = false;
      showToast('导入失败: ' + err.message);
    }
  },

  /** 删除书籍 */
  async deleteBook(bookId) {
    if (!confirm('确定要删除这本书吗？所有笔记和进度也将被删除。')) return;

    try {
      const result = await api.deleteBook(bookId);
      if (result.error) {
        showToast('删除失败: ' + result.error);
      } else {
        showToast('书籍已删除');
        await this.loadBooks();
      }
    } catch (err) {
      showToast('删除失败: ' + err.message);
    }
  },

  /** 书籍右键菜单（简易版） */
  showBookContextMenu(e, bookId) {
    const menu = createElement('div', {
      className: 'context-menu',
      style: { left: e.clientX + 'px', top: e.clientY + 'px' }
    },
      createElement('button', { className: 'context-item', onClick: () => this.deleteBook(bookId) }, '🗑️ 删除')
    );
    document.body.appendChild(menu);

    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  /** 绑定事件 */
  bindEvents() {
    // 导入按钮
    $('#btnImportBook').addEventListener('click', () => this.importBook());

    // 搜索
    $('#librarySearch').addEventListener('input', debounce((e) => {
      this.currentFilter = e.target.value;
      this.filterBooks();
    }, 300));
  }
};
