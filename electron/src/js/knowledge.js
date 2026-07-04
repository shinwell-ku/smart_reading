/**
 * AI智慧阅读 - 侧边栏知识图谱模块
 */
const Knowledge = {
  sideChart: null,
  sideGraphLoaded: false,
  currentBookId: null,

  init() {
    this.bindEvents();
  },

  async loadSideGraph(bookId) {
    this.currentBookId = bookId;
    try {
      const data = await api.getKnowledgeGraph(bookId);
      if (data.nodes && data.nodes.length > 0) {
        this.renderSideGraph(data);
        this.sideGraphLoaded = true;
      } else {
        $('#sideNodeDetail').innerHTML = '<p class="hint">尚无图谱数据，点击「生成图谱」</p>';
      }
    } catch {
      $('#sideNodeDetail').innerHTML = '<p class="hint">加载失败</p>';
    }
  },

  renderSideGraph(data) {
    const container = $('#sideGraphContainer');
    if (!container) return;

    const nodes = data.nodes.map(n => ({
      id: n.id, name: n.label,
      symbolSize: Math.max(10, 25 - n.level * 4),
      category: n.level || 0,
      itemStyle: { color: this.getColor(n.type, n.level) },
      _desc: n.description, _chapter: n.chapter
    }));

    const edges = data.edges.map(e => ({
      source: e.source, target: e.target,
      label: { show: true, formatter: e.label || '', fontSize: 9 },
      lineStyle: { color: '#adb5bd', width: 1, curveness: 0.2, opacity: 0.5 }
    }));

    try {
      if (this.sideChart) this.sideChart.dispose();
      this.sideChart = echarts.init(container);
      this.sideChart.setOption({
        tooltip: { formatter: p => p.dataType === 'node' ? `<strong>${p.name}</strong><br/>${p.data._desc||''}` : '' },
        series: [{
          type: 'graph', layout: 'force',
          data: nodes, edges: edges,
          roam: true, draggable: true,
          focusNodeAdjacency: true,
          force: { repulsion: 400, edgeLength: [80, 200], gravity: 0.1 },
          label: { show: true, position: 'right', fontSize: 10 },
          lineStyle: { color: 'source', curveness: 0.2 }
        }]
      });
      this.sideChart.on('click', params => {
        if (params.dataType === 'node') {
          $('#sideNodeDetail').innerHTML =
            `<strong>${params.name}</strong><br/>
             <span style="font-size:11px;color:var(--text-dim)">${params.data._desc||'暂无描述'}</span>`;
        }
      });
    } catch {}
  },

  getColor(type, level) {
    if (level === 0) return '#1e1b4b';
    if (level === 1) return '#4263eb';
    const colors = { concept: '#51cf66', example: '#ffd43b', theorem: '#ff6b6b', case: '#339af0' };
    return colors[type] || '#748ffc';
  },

  async extractKnowledge() {
    const bookId = Reader.currentBook?.id;
    if (!bookId) { showToast('请先在阅读器中打开一本书'); return; }
    $('#sideNodeDetail').innerHTML = '<p class="hint">⏳ 知识抽取中...</p>';
    try {
      await api.extractKnowledge(bookId);
      showToast('✅ 知识抽取已启动');
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const data = await api.getKnowledgeGraph(bookId);
        if (data.nodes && data.nodes.length > 0) {
          this.renderSideGraph(data);
          this.sideGraphLoaded = true;
          showToast('✅ 知识抽取完成');
          return;
        }
      }
      showToast('知识抽取超时');
    } catch (e) { showToast('抽取失败: ' + e.message); }
  },

  async exportGraph() {
    if (!this.currentBookId) { showToast('请先生成图谱'); return; }
    if (this.sideChart) {
      const url = this.sideChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
      const a = document.createElement('a');
      a.href = url; a.download = `知识图谱_${this.currentBookId}.png`; a.click();
      showToast('✅ 图谱图片已导出');
    }
  },

  bindEvents() {
    $('#btnSideExtract').addEventListener('click', () => this.extractKnowledge());
    $('#btnSideExport').addEventListener('click', () => this.exportGraph());
  }
};
