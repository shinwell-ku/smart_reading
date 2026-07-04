<template>
  <div class="side-panel">
    <el-tabs v-model="activeTab" class="side-tabs">
      <el-tab-pane label="🌐 翻译" name="translate">
        <div class="panel-body">
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <el-select v-model="sourceLang" size="small" style="width:75px">
              <el-option label="自动" value="auto" />
              <el-option label="中文" value="zh" />
              <el-option label="English" value="en" />
            </el-select>
            <el-button size="small" @click="swapLangs">⇄</el-button>
            <el-select v-model="targetLang" size="small" style="width:75px">
              <el-option label="中文" value="zh" />
              <el-option label="English" value="en" />
            </el-select>
            <el-button type="primary" size="small" @click="translateText">翻译</el-button>
            <el-button size="small" @click="fillPageText">📄 当前页</el-button>
          </div>
          <el-input v-model="sourceText" :rows="3" type="textarea" placeholder="在 PDF 中选中文字后点翻译，或点「当前页」" />
          <el-input v-model="resultText" :rows="4" type="textarea" readonly placeholder="翻译结果" style="margin-top:6px" />
          <el-button size="small" style="margin-top:6px;width:100%" @click="fullTranslate">全文翻译</el-button>
        </div>
      </el-tab-pane>
      <el-tab-pane label="📝 笔记" name="notes">
        <div class="panel-body">
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <el-color-picker v-model="noteColor" :predefine="['#FFD700','#FF6B6B','#51CF66','#339AF0','#CC66FF']" size="small" />
            <el-button type="primary" size="small" @click="addNote">添加笔记</el-button>
          </div>
          <el-input v-model="noteContent" :rows="2" type="textarea" placeholder="输入笔记内容..." />
          <div class="note-list">
            <div v-for="n in notes" :key="n.id" class="note-item" :style="{ borderLeftColor: n.color || '#FFD700' }">
              <div class="note-text">{{ n.content }}</div>
              <div style="font-size:11px;color:#909399">第{{ n.page_num }}页</div>
              <el-button text size="small" @click="deleteNote(n.id)" style="margin-top:4px">🗑️</el-button>
            </div>
            <el-empty v-if="!notes.length" description="暂无笔记" :image-size="40" />
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="🔖 书签" name="bookmarks">
        <div class="panel-body">
          <div v-for="b in bookmarks" :key="b.id" class="bm-item" @click="goToPage(b.page_num)">
            🔖 第{{ b.page_num }}页
          </div>
          <el-empty v-if="!bookmarks.length" description="暂无书签" :image-size="40" />
        </div>
      </el-tab-pane>
      <el-tab-pane label="🧠 图谱" name="knowledge">
        <div class="panel-body">
          <div ref="graphRef" style="width:100%;height:280px"></div>
          <div v-if="graphNodeDetail" style="font-size:12px;padding:8px;background:#f5f7fa;border-radius:4px;margin-top:8px">
            <strong>{{ graphNodeDetail.name }}</strong><br><span style="color:#909399">{{ graphNodeDetail.desc }}</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <el-button size="small" type="primary" @click="extractGraph">🔄 生成图谱</el-button>
            <el-button size="small" @click="exportGraph">📤 导出</el-button>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'
import { api } from '../api.js'
import { ElMessage } from 'element-plus'

const props = defineProps({ book: Object, page: Number, activeTab: String })
const emit = defineEmits(['goToPage'])

const activeTab = ref('translate')
const sourceLang = ref('auto')
const targetLang = ref('zh')
const sourceText = ref('')
const resultText = ref('')
const noteContent = ref('')
const noteColor = ref('#FFD700')
const notes = ref([])
const bookmarks = ref([])
const graphRef = ref(null)
let graphChart = null
const graphNodeDetail = ref(null)

watch(() => props.activeTab, (v) => { activeTab.value = v }, { immediate: true })
watch(() => props.book, (b) => { if (b) { loadNotes(b.id); loadBookmarks(b.id); loadGraph(b.id) } }, { immediate: true })

// PDF 选中文本自动填充
onMounted(() => {
  window.addEventListener('pdf-selection', (e) => {
    if (e.detail && activeTab.value === 'translate') sourceText.value = e.detail.slice(0, 3000)
  })
})

function swapLangs() {
  const s = sourceLang.value; const t = targetLang.value
  if (s !== 'auto') { sourceLang.value = t; targetLang.value = s }
  const st = sourceText.value; const tt = resultText.value
  if (st || tt) { sourceText.value = tt; resultText.value = st }
}

async function translateText() {
  let text = sourceText.value.trim()
  if (!text) { ElMessage.info('请先输入文本'); return }
  resultText.value = '⏳ 翻译中（模型推理较慢，请稍候）...'
  try {
    const r = await api.translate({ text, source_lang: sourceLang.value, target_lang: targetLang.value })
    resultText.value = r.translated_text || '翻译失败'
  } catch { resultText.value = '⏱️ 翻译超时或失败' }
}

async function fillPageText() {
  if (!props.book) { ElMessage.info('请先打开一本书'); return }
  try {
    const r = await api.getPageContent(props.book.id, props.page)
    if (r.content) { sourceText.value = r.content.slice(0, 3000) }
    else { ElMessage.info('当前页无文本') }
  } catch { ElMessage.info('获取文本失败') }
}

async function fullTranslate() {
  if (!props.book) { ElMessage.warning('请先打开一本书'); return }
  try {
    await api.translateFull({ book_id: props.book.id, target_lang: targetLang.value })
    ElMessage.success('全文翻译任务已启动')
  } catch { ElMessage.error('启动失败') }
}

async function loadNotes(bid) { try { const r = await api.getNotes(bid); notes.value = r.notes || [] } catch {} }
async function loadBookmarks(bid) { try { const r = await api.getBookmarks(bid); bookmarks.value = r.bookmarks || [] } catch {} }
async function addNote() {
  if (!props.book) return
  if (!noteContent.value.trim()) { ElMessage.warning('请输入笔记内容'); return }
  await api.addNote(props.book.id, { page_num: props.page, content: noteContent.value, color: noteColor.value })
  ElMessage.success('笔记已添加'); noteContent.value = ''; loadNotes(props.book.id)
}
async function deleteNote(nid) { await api.deleteNote(nid); loadNotes(props.book.id) }
function goToPage(pn) { emit('goToPage', pn) }

async function loadGraph(bid) {
  try {
    const data = await api.getKnowledgeGraph(bid)
    if (!data.nodes || !data.nodes.length) return
    await nextTick()
    if (!graphRef.value) return
    if (!graphChart) {
      const echarts = (await import('echarts')).default
      graphChart = echarts.init(graphRef.value)
    }
    graphChart.setOption({
      tooltip: { formatter: p => p.dataType === 'node' ? `<strong>${p.name}</strong><br/>${p.data._desc||''}` : '' },
      series: [{
        type: 'graph', layout: 'force',
        data: data.nodes.map(n => ({id:n.id,name:n.label,symbolSize:Math.max(8,20-n.level*3),category:n.level,itemStyle:{color:['#4263eb','#51cf66','#ffd43b','#ff6b6b'][n.level]||'#748ffc'},_desc:n.description})),
        edges: data.edges.map(e => ({source:e.source,target:e.target,label:{show:true,formatter:e.label||'',fontSize:9},lineStyle:{color:'#adb5bd',width:1,curveness:0.2,opacity:0.5}})),
        roam: true, draggable: true, force: { repulsion: 300, edgeLength: [60,150], gravity: 0.1 },
        label: { show: true, position: 'right', fontSize: 10 },
      }]
    })
    graphChart.on('click', p => { if (p.dataType === 'node') graphNodeDetail.value = { name: p.name, desc: p.data._desc||'暂无描述' } })
  } catch {}
}
function extractGraph() {
  if (!props.book) return
  api.extractKnowledge(props.book.id); ElMessage.success('知识抽取已启动')
  setTimeout(() => loadGraph(props.book.id), 3000)
}
function exportGraph() {
  if (graphChart) {
    const url = graphChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
    const a = document.createElement('a'); a.href = url; a.download = `knowledge_${props.book?.id||0}.png`; a.click()
  }
}
</script>

<style scoped>
.side-panel { display:flex;flex-direction:column;height:100%;overflow:hidden }
.side-tabs { flex:1;display:flex;flex-direction:column }
.side-tabs :deep(.el-tabs__header) { margin:0;background:#f5f7fa;border-bottom:1px solid var(--el-border-color-light) }
.side-tabs :deep(.el-tabs__nav-wrap) { padding:0 4px }
.side-tabs :deep(.el-tabs__item) { height:32px;line-height:32px;padding:0 10px;font-size:12px;border:1px solid transparent;border-bottom:none;border-radius:4px 4px 0 0;margin:0 1px }
.side-tabs :deep(.el-tabs__item.is-active) { background:#fff;border-color:var(--el-border-color-light);border-bottom-color:#fff }
.side-tabs :deep(.el-tabs__active-bar) { display:none }
.side-tabs :deep(.el-tabs__content) { flex:1;overflow:hidden;background:#fff }
.side-tabs :deep(.el-tab-pane) { height:100%;overflow-y:auto }
.panel-body { padding:12px;display:flex;flex-direction:column;gap:4px }
.note-list { flex:1;overflow-y:auto;margin-top:8px }
.note-item { padding:8px;margin-bottom:6px;border-radius:4px;border-left:3px solid #ffd43b;background:#f5f7fa;font-size:12px }
.note-text { margin-bottom:2px }
.bm-item { padding:6px 8px;margin-bottom:2px;border-radius:4px;cursor:pointer;font-size:12px }
.bm-item:hover { background:#f5f7fa }
</style>
