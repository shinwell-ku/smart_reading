<template>
  <div class="reader-wrap">
    <div class="reader-toolbar">
      <el-button text @click="$emit('back')">←</el-button>
      <span class="reader-title">{{ book?.title || '未选择书籍' }}</span>
      <el-button text @click="$emit('bookmark')">🔖</el-button>
      <el-button text @click="zoomOut">−</el-button>
      <span style="font-size:12px;color:#909399;min-width:36px;text-align:center">{{ Math.round(scale/1*100) }}%</span>
      <el-button text @click="zoomIn">+</el-button>
      <el-button text @click="toggleFullscreen">⛶</el-button>
    </div>
    <div ref="viewerContainer" class="pdf-container"></div>
    <div class="reader-footer">
      <el-button text :disabled="page <= 1" @click="goTo(page-1)">◀</el-button>
      <span style="font-size:12px;color:#606266;min-width:90px;text-align:center">第 {{ page }}/{{ totalPages }} 页</span>
      <el-slider v-model="page" :min="1" :max="totalPages" style="flex:1;max-width:300px;margin:0 8px" @input="goTo" />
      <el-button text :disabled="page >= totalPages" @click="goTo(page+1)">▶</el-button>
      <span style="font-size:11px;color:#c0c4cc;min-width:36px;text-align:right">{{ totalPages > 0 ? Math.round(page/totalPages*100) + '%' : '' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { api } from '../api.js'

const props = defineProps({ book: Object })
const emit = defineEmits(['pageChange', 'back', 'bookmark'])

const viewerContainer = ref(null)
const page = ref(1)
const totalPages = ref(0)
const scale = ref(1)
let pdfDoc = null
let renderTask = null
let curPageNum = 0

watch(() => props.book, (book) => { if (book) loadPDF(book) }, { immediate: true })

async function loadPDF(book) {
  if (!book || book.file_type !== 'pdf') return
  reset()
  try {
    const fd = await window.electronAPI.readFile(book.file_path)
    if (!fd || !fd.success) throw new Error('读取失败')
    const task = pdfjsLib.getDocument({ data: fd.data })
    pdfDoc = await Promise.race([task.promise, new Promise((_,r)=>setTimeout(()=>r(new Error('超时')),30000))])
    if (!pdfDoc.numPages) throw new Error('无效PDF')
    totalPages.value = pdfDoc.numPages

    // 恢复进度
    try {
      const p = await api.getProgress(book.id)
      if (p && p.current_page > 1) page.value = p.current_page
    } catch {}
    await renderPage(page.value)
  } catch (e) {
    viewerContainer.value.innerHTML = `<div style="padding:60px;text-align:center;color:#909399">加载失败: ${e.message}</div>`
  }
}

async function renderPage(pn) {
  if (!pdfDoc || pn < 1 || pn > pdfDoc.numPages) return
  if (renderTask) { try { await renderTask.cancel() } catch {} }
  curPageNum = pn
  const viewer = viewerContainer.value
  const dpr = window.devicePixelRatio || 1

  const pageObj = await pdfDoc.getPage(pn)
  const vp = pageObj.getViewport({ scale: scale.value * dpr })

  const canvas = document.createElement('canvas')
  canvas.className = 'pdf-canvas'
  const ctx = canvas.getContext('2d')
  canvas.width = vp.width
  canvas.height = vp.height
  canvas.style.width = (vp.width / dpr) + 'px'
  canvas.style.height = (vp.height / dpr) + 'px'

  viewer.innerHTML = ''
  viewer.appendChild(canvas)

  renderTask = pageObj.render({ canvasContext: ctx, viewport: vp })
  await renderTask.promise

  // 文字层
  try {
    const tc = await pageObj.getTextContent()
    const tl = document.createElement('div')
    tl.className = 'text-layer'
    tl.style.cssText = `position:absolute;top:0;left:50%;transform:translateX(-50%);width:${canvas.style.width};height:${canvas.style.height};pointer-events:none`
    viewer.appendChild(tl)

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.style.cssText = 'width:100%;height:100%'
    tl.appendChild(svg)

    const ph = pageObj.getViewport({ scale: 1 }).height * scale.value * dpr
    tc.items.forEach(item => {
      const tm = item.transform
      const x = tm[4] * scale.value * dpr
      const y = ph - tm[5] * scale.value * dpr
      const tx = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      tx.setAttribute('x', x)
      tx.setAttribute('y', y)
      tx.setAttribute('font-size', (item.height || 12) * scale.value * dpr + 'px')
      tx.setAttribute('fill', 'transparent')
      tx.style.pointerEvents = 'auto'
      tx.style.cursor = 'text'
      tx.style.userSelect = 'text'
      tx.textContent = item.str
      svg.appendChild(tx)
    })
  } catch {}

  page.value = pn
  emit('pageChange', pn)
  saveProgress()
}

function reset() { pdfDoc = null; totalPages.value = 0; page.value = 1; curPageNum = 0 }
function zoomIn() { scale.value = Math.min(3, scale.value + 0.2); if (pdfDoc) renderPage(curPageNum) }
function zoomOut() { scale.value = Math.max(0.3, scale.value - 0.2); if (pdfDoc) renderPage(curPageNum) }
function goTo(n) { n = Math.max(1, Math.min(n, totalPages.value)); if (n !== curPageNum && pdfDoc) renderPage(n) }
function toggleFullscreen() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen() }

async function saveProgress() {
  if (!props.book) return
  try { await api.updateProgress(props.book.id, { current_page: page.value, total_pages: totalPages.value, percentage: totalPages.value > 0 ? page.value/totalPages.value : 0, scroll_position: 0 }) } catch {}
}
</script>

<style scoped>
.reader-wrap { display:flex;flex-direction:column;height:100%;overflow:hidden }
.reader-toolbar { display:flex;align-items:center;gap:4px;padding:4px 12px;border-bottom:1px solid var(--el-border-color-light);flex-shrink:0 }
.reader-title { flex:1;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.pdf-container { flex:1;overflow-y:auto;background:#525659;display:flex;flex-direction:column;align-items:center;padding:16px;position:relative }
.pdf-canvas { box-shadow:0 2px 16px rgba(0,0,0,0.15);border-radius:2px;max-width:100% }
.text-layer svg text { user-select:text;-webkit-user-select:text;cursor:text }
:deep(::selection) { background:rgba(64,158,255,0.45) }
.reader-footer { display:flex;align-items:center;gap:8px;padding:2px 12px;border-top:1px solid var(--el-border-color-light);flex-shrink:0;height:38px }
</style>
